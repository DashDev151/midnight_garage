import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'tools/**',
      // Agent worktrees: whole checkouts of this repo nested inside it. Never
      // lint them, and never let their tsconfigs be mistaken for this root's
      // (tsconfigRootDir below pins that).
      '.claude/**',
      // Parked, unintegrated drive-mode v2 payload. It is a self-contained
      // package that has never been wired into the workspace, and linting it
      // in place fails the gate on code no build consumes. DELETE THIS ENTRY
      // as part of integrating it, so the code is linted the moment it is real.
      'drive_mode_unintegrated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    files: ['packages/game/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Plain CommonJS Node scripts (build helpers, not part of any TS
    // project) - .cjs always runs as CommonJS regardless of package.json
    // "type", so require()/process are expected here.
    files: ['**/*.cjs'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Boundary law (CLAUDE.md / roadmap section 5): the sim core stays
    // renderer-, storage-, and framework-agnostic. Enforced here, not by
    // discipline.
    name: 'midnight-garage/sim-boundary-law',
    files: ['packages/sim/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'vue', message: 'Boundary law: sim never imports Vue.' },
            { name: 'pixi.js', message: 'Boundary law: sim never imports Pixi.' },
            { name: 'pinia', message: 'Boundary law: stores live in packages/game.' },
            { name: 'dexie', message: 'Boundary law: persistence lives outside the sim.' },
            { name: 'howler', message: 'Boundary law: audio lives in packages/game.' },
          ],
          patterns: [
            {
              group: ['@midnight-garage/game', '@midnight-garage/game/*'],
              message: 'Boundary law: sim never imports from the game app.',
            },
          ],
        },
      ],
    },
  },
  prettier,
)
