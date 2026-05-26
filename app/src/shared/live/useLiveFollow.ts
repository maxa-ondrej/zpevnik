/**
 * Live-mode hook: glues the SpeechSource + lyric matcher to a follow-
 * line index that the song screen can consume directly.
 *
 * Lifecycle:
 *   - The SpeechSource instance is created once per song (constructor
 *     stays cheap; permissions only requested on start).
 *   - `start()` requests permission, kicks off recognition, and begins
 *     feeding transcripts into the matcher.
 *   - Each interim transcript trims to the last WINDOW_TOKENS tokens,
 *     runs `matchLine`, and (if confidence clears the threshold) sets
 *     `followLine`.
 *   - `stop()` tears everything down.
 *
 * Pure UI/state — no platform-specific code lives here. The adapter
 * handles the rest.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ParsedSong } from '../chordpro/parser';

import { buildLineTokens, matchLine } from './matcher';
import { NativeSpeechSource } from './NativeSpeechSource';
import { tokenize } from './normalize';
import type { SpeechSource } from './SpeechSource';

/** How many recent transcript tokens to keep in the matching window. */
const WINDOW_TOKENS = 8;

export interface UseLiveFollowOptions {
  /** The current song. Required to build the per-line token cache. */
  song: ParsedSong | null;
  /** BCP-47 locale for recognition. Songs are Czech today. */
  locale?: string;
  /** Optional override for the adapter — useful in tests. */
  sourceFactory?: () => SpeechSource;
}

export interface UseLiveFollow {
  /** True iff the platform has a working backend. */
  isSupported: boolean;
  /** True between start() resolving and stop() being called. */
  isListening: boolean;
  /** Last error emitted by the recognizer (sticky until next start). */
  error: Error | null;
  /** Line index the matcher is currently focused on. -1 before the
   *  first confident match. */
  followLine: number;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function useLiveFollow({
  song,
  locale = 'cs-CZ',
  sourceFactory,
}: UseLiveFollowOptions): UseLiveFollow {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [followLine, setFollowLine] = useState(-1);

  // Source is stable across renders. A factory lets tests inject a
  // fake without us reaching into module internals.
  const source = useMemo<SpeechSource>(
    () => (sourceFactory ? sourceFactory() : new NativeSpeechSource()),
    [sourceFactory],
  );

  // Per-song token cache — rebuilds whenever the song changes.
  const lineTokens = useMemo(
    () => (song ? buildLineTokens(song) : []),
    [song],
  );

  // Mutable transcript buffer — interim results arrive frequently and
  // we don't want a setState per token, so we accumulate in a ref and
  // only set followLine when the matcher clears the threshold.
  const recentTokensRef = useRef<string[]>([]);
  const currentLineRef = useRef(-1);

  // Keep currentLineRef in sync with state so the matcher's lookback/
  // lookahead window slides forward as we advance.
  useEffect(() => {
    currentLineRef.current = followLine;
  }, [followLine]);

  const handleTranscript = useCallback(
    (text: string, _isFinal: boolean) => {
      if (lineTokens.length === 0) return;
      const tokens = tokenize(text);
      // The recognizer emits the *cumulative* transcript for the current
      // utterance. We slide our own window over its tail so the matcher
      // sees only what was sung recently, not the whole song so far.
      const window = tokens.slice(-WINDOW_TOKENS);
      recentTokensRef.current = window;

      // First match: bootstrap from the top of the song so the matcher
      // can pick any starting line.
      const cur =
        currentLineRef.current < 0 ? 0 : currentLineRef.current;
      const m = matchLine(lineTokens, window, cur);
      if (m !== null && m.lineIdx !== currentLineRef.current) {
        currentLineRef.current = m.lineIdx;
        setFollowLine(m.lineIdx);
      }
    },
    [lineTokens],
  );

  // Wire up transcript + error listeners for the lifetime of the hook.
  // The SpeechSource handles add/remove of its own internal subs; here
  // we only need to manage our subscriptions to it.
  useEffect(() => {
    const offT = source.onTranscript(handleTranscript);
    const offE = source.onError((err) => setError(err));
    return () => {
      offT();
      offE();
    };
  }, [source, handleTranscript]);

  const start = useCallback(async () => {
    setError(null);
    setFollowLine(-1);
    currentLineRef.current = -1;
    recentTokensRef.current = [];
    if (!source.isSupported) {
      setError(new Error('Live mode not supported on this platform'));
      return;
    }
    const granted = await source.requestPermissions();
    if (!granted) {
      setError(new Error('Microphone permission denied'));
      return;
    }
    await source.start({ locale, onDevice: true });
    setIsListening(true);
  }, [source, locale]);

  const stop = useCallback(async () => {
    await source.stop();
    setIsListening(false);
  }, [source]);

  // Best-effort teardown on unmount.
  useEffect(() => {
    return () => {
      void source.stop();
    };
  }, [source]);

  return {
    isSupported: source.isSupported,
    isListening,
    error,
    followLine,
    start,
    stop,
  };
}
