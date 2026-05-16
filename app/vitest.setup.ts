/**
 * Vitest setup: extends `expect` with jest-dom matchers so component tests
 * can use `toBeInTheDocument`, `toHaveStyle`, etc.
 *
 * We also polyfill `localStorage` because vitest's jsdom environment ships
 * an empty Storage stub (no `setItem`/`getItem`), and the settings store
 * uses zustand's `persist` middleware which crashes on the first write.
 */
import '@testing-library/jest-dom/vitest';

/** Minimal in-memory `Storage` polyfill — enough for `persist` middleware. */
function makeMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key) {
      return data.has(key) ? (data.get(key) as string) : null;
    },
    key(i) {
      return Array.from(data.keys())[i] ?? null;
    },
    removeItem(key) {
      data.delete(key);
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

const memoryLocalStorage = makeMemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: memoryLocalStorage,
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: memoryLocalStorage,
  });
}
