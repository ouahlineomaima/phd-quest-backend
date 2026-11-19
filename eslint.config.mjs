import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const scope = JSON.parse(readFileSync(new URL('./quality-scope.json', import.meta.url), 'utf8'));
export default defineConfig([
  { ignores: ['node_modules/**', 'dist/**', '.artifacts/**', 'out-tsc/**'] },
  {
    files: ['test/stage3/browser.check.cjs', 'test/stage4/browser-workflow.cjs'],
    languageOptions: {
      globals: { document: 'readonly', innerWidth: 'readonly', getComputedStyle: 'readonly' },
    },
  },
  {
    files: scope.typescript,
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: fileURLToPath(new URL('./', import.meta.url)),
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    },
  },
  {
    files: scope.javascript,
    extends: [js.configs.recommended],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        structuredClone: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
]);
