/**
 * Hold-to-repeat helper for stepper buttons.
 *
 * Returns `{ start, stop }` handlers. Wire them to a Pressable's
 * `onPressIn` / `onPressOut`. `start` fires `onPress` once immediately,
 * then — after a short delay — repeats it on a fixed interval until
 * `stop` is called, the host unmounts, or `disabled` flips truthy.
 */
import { useEffect, useRef } from 'react';

export interface UseAutoRepeatOptions {
  onPress: () => void;
  disabled?: boolean;
  /** Delay before the first repeat fires after the initial press, in ms. */
  delayMs?: number;
  /** Cadence of repeats once the delay has elapsed, in ms. */
  intervalMs?: number;
}

export interface UseAutoRepeatResult {
  start: () => void;
  stop: () => void;
}

export function useAutoRepeat({
  onPress,
  disabled,
  delayMs = 400,
  intervalMs = 80,
}: UseAutoRepeatOptions): UseAutoRepeatResult {
  // Keep latest onPress / disabled in refs so handlers don't need to be
  // re-created on every render (which would also re-fire any useEffect
  // wired to them).
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (delayRef.current != null) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const start = () => {
    if (disabledRef.current) return;
    // Always restart from clean state — guards against an `onPressIn`
    // arriving without a paired `onPressOut` (mouse leaves the element).
    stop();
    onPressRef.current();
    delayRef.current = setTimeout(() => {
      delayRef.current = null;
      if (disabledRef.current) return;
      intervalRef.current = setInterval(() => {
        if (disabledRef.current) {
          stop();
          return;
        }
        onPressRef.current();
      }, intervalMs);
    }, delayMs);
  };

  // Tear down if the host flips to disabled mid-hold (e.g. value hit a
  // boundary clamp and the parent disabled the button).
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);
  // Cleanup on unmount.
  useEffect(() => () => stop(), []);

  return { start, stop };
}
