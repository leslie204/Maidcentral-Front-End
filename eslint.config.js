// Lint config (ESLint 9 flat config). Rules focus on real bugs: undefined variables,
// unused code. Formatting is not linted.
import js from '@eslint/js';
import globals from 'globals';

const unused = ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }];

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'capture/output/**', 'capture/.auth/**', '.data/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': unused, 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
  {
    // The crawler runs some functions inside the browser page.
    files: ['capture/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
