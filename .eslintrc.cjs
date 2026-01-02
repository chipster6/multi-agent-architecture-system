module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    'dist/**',
    'node_modules/**',
    'coverage/**',
    'arch_docs/**', // Exclude architecture documentation directory
    '*.js',
    '**/*.d.ts',
    'tests/**', // Exclude test files from TypeScript project requirement
    'vitest.config.ts', // Exclude vitest config
  ],
  rules: {
    // Core ESLint rules
    'no-unused-vars': 'off', // Disabled in favor of TypeScript version
    'prefer-const': 'error',
    'no-var': 'error',
    'no-console': 'warn', // Allow console for MCP server logging
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
    'no-throw-literal': 'error',
    'prefer-promise-reject-errors': 'error',

    // TypeScript-specific rules for production MCP server
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/explicit-function-return-type': [
      'error',
      {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
      },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': [
      'error',
      {
        checksVoidReturn: false, // Allow async event handlers
      },
    ],
    '@typescript-eslint/require-await': 'error',
    '@typescript-eslint/prefer-readonly': 'error',
    '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
    '@typescript-eslint/consistent-type-imports': [
      'error',
      {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      },
    ],

    // Performance and best practices
    '@typescript-eslint/prefer-includes': 'error',
    '@typescript-eslint/prefer-string-starts-ends-with': 'error',
    '@typescript-eslint/prefer-for-of': 'error',
    '@typescript-eslint/no-unnecessary-condition': 'error',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',

    // Naming conventions for consistency
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'interface',
        format: ['PascalCase'],
      },
      {
        selector: 'typeAlias',
        format: ['PascalCase'],
      },
      {
        selector: 'enum',
        format: ['PascalCase'],
      },
      {
        selector: 'class',
        format: ['PascalCase'],
      },
      {
        selector: 'method',
        format: ['camelCase'],
      },
      {
        selector: 'function',
        format: ['camelCase'],
      },
      {
        selector: 'variable',
        format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        leadingUnderscore: 'allow',
      },
    ],
  },
  overrides: [
    // Test files configuration
    {
      files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        // Don't require TypeScript project for test files
      },
      rules: {
        // Relaxed rules for test files
        'no-console': 'off',
        '@typescript-eslint/no-explicit-any': 'off', // Allow any in tests for mocking
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off', // Allow ! in tests
        '@typescript-eslint/no-empty-function': 'off', // Allow empty mock functions
        '@typescript-eslint/require-await': 'off', // Allow async functions without await in tests
      },
    },
    // Configuration files
    {
      files: ['*.config.{js,ts,mjs}', 'vitest.config.ts'],
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        // Don't require TypeScript project for config files
      },
      rules: {
        'no-console': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
      },
    },
  ],
};
