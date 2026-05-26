/**
 * Swappable interface between Live mode and the underlying speech
 * recognizer. The rest of the app depends only on this contract; the
 * concrete implementation is platform-resolved at import time.
 *
 * v1 uses SFSpeechRecognizer (iOS) / Android SpeechRecognizer via
 * `expo-speech-recognition`. A future swap to whisper.rn replaces one
 * file and nothing else.
 */

export interface SpeechSourceStartOptions {
  /** BCP-47 locale, e.g. "cs-CZ". */
  locale: string;
  /** Whether to prefer on-device recognition (iOS 17+ for cs-CZ). */
  onDevice?: boolean;
}

export interface SpeechSource {
  /** True if this platform has a working backend. */
  readonly isSupported: boolean;
  /** Ask the OS for mic + speech-recognition permission. Resolves to
   *  true iff granted. No-op + false on unsupported platforms. */
  requestPermissions(): Promise<boolean>;
  /** Begin continuous recognition with interim results. Repeated calls
   *  are idempotent — same instance can be restarted. */
  start(opts: SpeechSourceStartOptions): Promise<void>;
  /** Stop the current session. Idempotent. */
  stop(): Promise<void>;
  /** Subscribe to interim + final transcript updates. Returns an
   *  unsubscribe function. The `text` is the cumulative best-guess
   *  string for the current utterance (recognizer-defined). */
  onTranscript(cb: (text: string, isFinal: boolean) => void): () => void;
  /** Subscribe to error events. */
  onError(cb: (err: Error) => void): () => void;
}
