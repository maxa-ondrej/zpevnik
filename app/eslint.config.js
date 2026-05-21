/**
 * Flat-config ESLint (v9+). Replaces the legacy `.eslintrc` format.
 *
 * Why we skipped `eslint-config-expo`:
 *   The installed copy (8.0.1) extends `plugin:react-hooks/recommended`,
 *   but `eslint-plugin-react-hooks` is not in the lockfile — wrapping it
 *   with `FlatCompat` would fail at load time. The project's lint surface
 *   is small enough that a minimal flat config built on `@eslint/js`
 *   + `typescript-eslint` is honest, fast, and avoids a phantom peer dep.
 *
 * To layer Expo's defaults back in: install `eslint-plugin-react-hooks`
 * (and any other missing peers), then wrap with @eslint/eslintrc's
 * `FlatCompat`.
 */
const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'web-build/**',
      'expo-env.d.ts',
      'babel.config.js',
      'vitest.config.ts',
      'vitest.setup.ts',
      // The config file itself runs in node-CJS context with its own
      // globals; not worth a dedicated config block to lint it.
      'eslint.config.js',
    ],
  },

  js.configs.recommended,

  // Source files — TS + TSX.
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        __DEV__: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // TypeScript already enforces this; the core rule produces false
      // positives on JSX/global types it can't resolve.
      'no-undef': 'off',

      // Use the TS-aware version with our underscore-prefix opt-out.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // Loose equality is a real footgun; warn rather than error so an
      // intentional `== null` check doesn't break the build.
      eqeqeq: ['warn', 'smart'],

      // The codebase commonly uses `() => { ... }` returning void in
      // useEffect cleanup chains; the empty function rule fires
      // unhelpfully on those.
      'no-empty-function': 'off',

      // Logs are fine in user-facing dev builds; we redact them at
      // export time. Warn so they don't proliferate without notice.
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },

  // Vitest tests — opt in to its globals so describe/test/expect lint clean.
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
    },
  },
];
