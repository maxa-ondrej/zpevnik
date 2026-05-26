/**
 * SpeechSource backed by `expo-speech-recognition`, which wraps
 * SFSpeechRecognizer on iOS and SpeechRecognizer on Android. Falls back
 * to a no-op on web (the package's web polyfill exists but browser
 * support is uneven; v1 only promises Live mode on iOS).
 *
 * The adapter shape is what the rest of Live mode consumes. Swapping
 * to whisper.rn later only touches this file.
 */

import { Platform } from 'react-native';

import type { SpeechSource, SpeechSourceStartOptions } from './SpeechSource';

// Lazy require so a missing dep on web (or a metro-resolution hiccup)
// can't kill the bundle at import time. The module is only touched
// when Live mode is actually started.
type SpeechModule = {
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(opts: Record<string, unknown>): void | Promise<void>;
  stop(): void | Promise<void>;
  abort(): void | Promise<void>;
  addListener(event: string, cb: (e: unknown) => void): { remove(): void };
};

type ResultPayload = {
  isFinal: boolean;
  results: Array<{ transcript: string }>;
};

function loadModule(): SpeechModule | null {
  try {
    const mod = require('expo-speech-recognition') as {
      ExpoSpeechRecognitionModule: SpeechModule;
    };
    return mod.ExpoSpeechRecognitionModule;
  } catch {
    return null;
  }
}

export class NativeSpeechSource implements SpeechSource {
  readonly isSupported: boolean;
  private mod: SpeechModule | null;
  private transcriptCbs = new Set<(text: string, isFinal: boolean) => void>();
  private errorCbs = new Set<(err: Error) => void>();
  private subs: Array<{ remove(): void }> = [];

  constructor() {
    // v1: iOS only. Android has SpeechRecognizer but per-OEM quirks
    // and we haven't tested it. Web has the polyfill but uneven Safari
    // support — explicitly unsupported until we add a web build path.
    this.isSupported = Platform.OS === 'ios' || Platform.OS === 'android';
    this.mod = this.isSupported ? loadModule() : null;
    if (this.mod === null) {
      // Module is missing (dep not installed yet, or running on a
      // platform where require() can't resolve it). Downgrade to
      // unsupported instead of crashing later.
      (this as { isSupported: boolean }).isSupported = false;
    }
  }

  async requestPermissions(): Promise<boolean> {
    if (this.mod === null) return false;
    try {
      const res = await this.mod.requestPermissionsAsync();
      return res.granted === true;
    } catch (err) {
      this.emitError(err);
      return false;
    }
  }

  async start(opts: SpeechSourceStartOptions): Promise<void> {
    if (this.mod === null) return;
    this.attachListeners();
    try {
      await this.mod.start({
        lang: opts.locale,
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: opts.onDevice ?? true,
      });
    } catch (err) {
      this.emitError(err);
    }
  }

  async stop(): Promise<void> {
    if (this.mod === null) return;
    try {
      await this.mod.stop();
    } catch (err) {
      this.emitError(err);
    } finally {
      this.detachListeners();
    }
  }

  onTranscript(cb: (text: string, isFinal: boolean) => void): () => void {
    this.transcriptCbs.add(cb);
    return () => this.transcriptCbs.delete(cb);
  }

  onError(cb: (err: Error) => void): () => void {
    this.errorCbs.add(cb);
    return () => this.errorCbs.delete(cb);
  }

  private attachListeners(): void {
    if (this.mod === null || this.subs.length > 0) return;
    this.subs.push(
      this.mod.addListener('result', (e) => {
        const ev = e as ResultPayload;
        // expo-speech-recognition emits an array of alternative
        // results; first one is the recognizer's best guess.
        const transcript = ev.results?.[0]?.transcript ?? '';
        if (transcript.length === 0) return;
        for (const cb of this.transcriptCbs) cb(transcript, ev.isFinal);
      }),
      this.mod.addListener('error', (e) => {
        const ev = e as { error?: string; message?: string };
        this.emitError(new Error(ev.message ?? ev.error ?? 'speech error'));
      }),
    );
  }

  private detachListeners(): void {
    for (const s of this.subs) s.remove();
    this.subs = [];
  }

  private emitError(err: unknown): void {
    const e = err instanceof Error ? err : new Error(String(err));
    for (const cb of this.errorCbs) cb(e);
  }
}
