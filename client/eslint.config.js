import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Injected at build time via vite.config.js's `define` block.
        __APP_VERSION__: 'readonly',
        __BUILD_TIME__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // Part of react-hooks' React Compiler readiness preset. This project
      // doesn't use the Compiler, and the rule flags the ordinary "kick off
      // a fetch on mount, setLoading(true) synchronously" pattern used
      // throughout every section page as an error, even though it's safe
      // and doesn't cause cascading renders in practice.
      'react-hooks/set-state-in-effect': 'off',
      // A dev-experience hint about Fast Refresh, not a correctness rule.
      // Flags the standard Context+hook pattern (SubscriptionContext,
      // AuthContext) and the app entry point (main.jsx), none of which
      // are actual bugs worth restructuring around.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
