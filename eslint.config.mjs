import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.mjs', '*.js', '*.cjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: true,
      },
    },
    rules: {
      'import/no-cycle': 'error',
      'import/no-self-import': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: ['**/*.config.{js,mjs,cjs,ts}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['apps/extension/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      globals: { ...globals.browser, chrome: 'readonly' },
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactPlugin.configs.flat['jsx-runtime'].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      '@typescript-eslint/no-non-null-assertion': 'off',
      // @types/chrome tags the whole `chrome` global as deprecated (it points at the
      // retired Chrome Apps platform docs), but it's the correct MV3 extension API.
      '@typescript-eslint/no-deprecated': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  prettierConfig,
);
