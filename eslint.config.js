// Modern ESLint flat config format
// This is the recommended approach for new projects
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  // Base configurations
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // Global settings
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Main source files
  {
    files: ['src/**/*.ts'],
    rules: {
      // Your existing rules from .eslintrc.js can be migrated here
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // Add other rules as needed
    },
  },

  // Test files with relaxed rules
  {
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },

  // Global ignores
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.d.ts'],
  },
]);
