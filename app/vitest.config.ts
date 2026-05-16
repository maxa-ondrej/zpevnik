import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the Expo / React Native app.
 *
 * Component tests render through `react-native-web` so that React Native
 * primitives (View, Text, etc.) produce real DOM nodes inside jsdom.
 * Pure-helper tests don't care about the environment but happily run here too.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    // jsdom needs an actual origin or `localStorage` throws SecurityError.
    // Zustand's persist middleware calls `localStorage.setItem` during the
    // first `setState`, so we set a URL upfront.
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: [
      // Route the bare `react-native` import to `react-native-web` so jsdom
      // can mount the components. A regex with end-of-string anchor matches
      // ONLY the bare specifier — deep imports (`react-native/Libraries/…`)
      // are left untouched.
      { find: /^react-native$/, replacement: 'react-native-web' },
    ],
  },
});
