/**
 * Tests the hook with a fake SpeechSource so we can drive transcript
 * events deterministically and verify the matcher/state wiring.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { parseChordPro } from '../chordpro/parser';

import type { SpeechSource } from './SpeechSource';
import { useLiveFollow } from './useLiveFollow';

class FakeSpeechSource implements SpeechSource {
  isSupported = true;
  private transcriptCbs = new Set<(t: string, f: boolean) => void>();
  private errorCbs = new Set<(e: Error) => void>();
  private started = false;
  permissionGranted = true;

  async requestPermissions(): Promise<boolean> {
    return this.permissionGranted;
  }
  async start(): Promise<void> {
    this.started = true;
  }
  async stop(): Promise<void> {
    this.started = false;
  }
  onTranscript(cb: (t: string, f: boolean) => void): () => void {
    this.transcriptCbs.add(cb);
    return () => this.transcriptCbs.delete(cb);
  }
  onError(cb: (e: Error) => void): () => void {
    this.errorCbs.add(cb);
    return () => this.errorCbs.delete(cb);
  }
  /** Test helper — pretends the recognizer delivered a partial. */
  emit(text: string, isFinal = false): void {
    for (const cb of this.transcriptCbs) cb(text, isFinal);
  }
  /** Test helper — pretends the recognizer errored. */
  emitError(err: Error): void {
    for (const cb of this.errorCbs) cb(err);
  }
  isStarted(): boolean {
    return this.started;
  }
}

const SONG = parseChordPro(`
Jen Ty Pane můj jsi má skála
Tobě svěřuji svou cestu
Smiluj se nad námi a slyš
Hallelujah amen
`);

function makeHook(fake: FakeSpeechSource) {
  return renderHook(() =>
    useLiveFollow({ song: SONG, sourceFactory: () => fake }),
  );
}

describe('useLiveFollow', () => {
  test('initial state: not listening, no error, followLine=-1', () => {
    const fake = new FakeSpeechSource();
    const { result } = makeHook(fake);
    expect(result.current.isSupported).toBe(true);
    expect(result.current.isListening).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.followLine).toBe(-1);
  });

  test('start() requests permissions and sets isListening', async () => {
    const fake = new FakeSpeechSource();
    const { result } = makeHook(fake);
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isListening).toBe(true);
    expect(fake.isStarted()).toBe(true);
  });

  test('permission denied sets an error and does not start', async () => {
    const fake = new FakeSpeechSource();
    fake.permissionGranted = false;
    const { result } = makeHook(fake);
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isListening).toBe(false);
    expect(result.current.error?.message).toMatch(/Microphone permission/i);
  });

  test('transcript advances followLine across the song', async () => {
    const fake = new FakeSpeechSource();
    const { result } = makeHook(fake);
    await act(async () => {
      await result.current.start();
    });
    // First line.
    act(() => fake.emit('jen ty pane'));
    const firstSet = result.current.followLine;
    expect(firstSet).toBeGreaterThanOrEqual(0);

    // Advances to a later line.
    act(() => fake.emit('tobe sveruji svou cestu'));
    expect(result.current.followLine).toBeGreaterThan(firstSet);

    // Reaches the last lyric line.
    act(() => fake.emit('hallelujah amen'));
    const last = result.current.followLine;
    expect(last).toBeGreaterThan(0);
  });

  test('garbage transcript leaves followLine alone', async () => {
    const fake = new FakeSpeechSource();
    const { result } = makeHook(fake);
    await act(async () => {
      await result.current.start();
    });
    act(() => fake.emit('jen ty pane'));
    const before = result.current.followLine;
    act(() => fake.emit('xxxxxx yyyyyy zzzzz'));
    expect(result.current.followLine).toBe(before);
  });

  test('error events surface via the hook', async () => {
    const fake = new FakeSpeechSource();
    const { result } = makeHook(fake);
    await act(async () => {
      await result.current.start();
    });
    act(() => fake.emitError(new Error('mic glitch')));
    expect(result.current.error?.message).toBe('mic glitch');
  });

  test('stop() flips isListening back to false', async () => {
    const fake = new FakeSpeechSource();
    const { result } = makeHook(fake);
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.isListening).toBe(false);
    expect(fake.isStarted()).toBe(false);
  });

  test('unsupported source produces a clear error on start', async () => {
    const fake = new FakeSpeechSource();
    fake.isSupported = false;
    const { result } = makeHook(fake);
    expect(result.current.isSupported).toBe(false);
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isListening).toBe(false);
    expect(result.current.error?.message).toMatch(/not supported/i);
  });
});
