/**
 * Tests for {@link useAutoRepeat}. Drives the hook via `renderHook` so the
 * test exercises real timer + ref behavior without dragging Pressable's
 * cross-platform event plumbing into scope.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { useAutoRepeat } from './useAutoRepeat';

describe('useAutoRepeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('start fires onPress once immediately', () => {
    const onPress = vi.fn();
    const { result } = renderHook(() => useAutoRepeat({ onPress }));
    act(() => result.current.start());
    expect(onPress).toHaveBeenCalledTimes(1);
    act(() => result.current.stop());
  });

  test('holding fires repeats after the delay, then every interval', () => {
    const onPress = vi.fn();
    const { result } = renderHook(() => useAutoRepeat({ onPress }));

    act(() => result.current.start());
    expect(onPress).toHaveBeenCalledTimes(1); // initial

    // 399ms into the 400ms delay → no extra calls.
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    // 400ms — delay setTimeout fires and schedules the interval. The
    // interval itself doesn't tick until +intervalMs more.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    // First repeat tick.
    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(onPress).toHaveBeenCalledTimes(2);

    // Second repeat tick.
    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(onPress).toHaveBeenCalledTimes(3);

    act(() => result.current.stop());
  });

  test('stop halts further repeats', () => {
    const onPress = vi.fn();
    const { result } = renderHook(() => useAutoRepeat({ onPress }));

    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(400 + 80 * 3);
    });
    const beforeStop = onPress.mock.calls.length;
    expect(beforeStop).toBe(4); // initial + 3 repeats

    act(() => result.current.stop());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onPress).toHaveBeenCalledTimes(beforeStop);
  });

  test('disabled at call time blocks the initial fire', () => {
    const onPress = vi.fn();
    const { result } = renderHook(() =>
      useAutoRepeat({ onPress, disabled: true }),
    );
    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onPress).not.toHaveBeenCalled();
  });

  test('flipping disabled mid-hold tears down the repeat', () => {
    const onPress = vi.fn();
    const { result, rerender } = renderHook(
      ({ disabled }: { disabled: boolean }) =>
        useAutoRepeat({ onPress, disabled }),
      { initialProps: { disabled: false } },
    );

    act(() => result.current.start());
    expect(onPress).toHaveBeenCalledTimes(1);

    // Get into the repeat phase.
    act(() => {
      vi.advanceTimersByTime(400 + 80);
    });
    expect(onPress).toHaveBeenCalledTimes(2);

    // Parent flips disabled → useEffect on [disabled] calls stop().
    rerender({ disabled: true });
    const afterFlip = onPress.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onPress).toHaveBeenCalledTimes(afterFlip);
  });

  test('unmount during hold cancels the pending delay', () => {
    const onPress = vi.fn();
    const { result, unmount } = renderHook(() => useAutoRepeat({ onPress }));

    act(() => result.current.start());
    expect(onPress).toHaveBeenCalledTimes(1);

    // Unmount BEFORE the delay elapses → the queued setTimeout must be
    // cleared, otherwise it would still fire its callback and schedule a
    // ghost interval.
    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('a second start() during repeat resets cleanly (no double interval)', () => {
    const onPress = vi.fn();
    const { result } = renderHook(() => useAutoRepeat({ onPress }));

    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(400 + 80);
    });
    expect(onPress).toHaveBeenCalledTimes(2); // initial + 1 repeat

    // A second start (e.g. a stray onPressIn without paired onPressOut)
    // fires once and restarts the delay — it should NOT leave a second
    // interval running in parallel.
    act(() => result.current.start());
    expect(onPress).toHaveBeenCalledTimes(3); // immediate fire

    // Wait one full repeat period of a hypothetical leaked interval — only
    // ONE additional call should land (from the newly-armed delay+interval).
    act(() => {
      vi.advanceTimersByTime(400 + 80);
    });
    expect(onPress).toHaveBeenCalledTimes(4);

    act(() => result.current.stop());
  });

  test('honors custom delayMs and intervalMs', () => {
    const onPress = vi.fn();
    const { result } = renderHook(() =>
      useAutoRepeat({ onPress, delayMs: 100, intervalMs: 20 }),
    );
    act(() => result.current.start());
    expect(onPress).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(100 + 20);
    });
    expect(onPress).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(onPress).toHaveBeenCalledTimes(3);
    act(() => result.current.stop());
  });
});
