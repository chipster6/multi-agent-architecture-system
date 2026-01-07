import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Global configuration
    globals: true,
    environment: 'node',
    
    // Pass when no tests are found (Context7 pattern for optional test suites)
    passWithNoTests: true,

    // Multi-project setup for different test types (Context7 verified pattern)
    projects: [
      {
        name: 'unit',
        include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules', 'dist', 'arch_docs'],
        testTimeout: 30000,
        hookTimeout: 30000,
        environment: 'node',
      },
      {
        name: 'integration',
        include: ['tests/integration/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules', 'dist', 'arch_docs'],
        testTimeout: 30000,
        hookTimeout: 30000,
        environment: 'node',
      },
      {
        name: 'performance',
        include: ['tests/performance/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules', 'dist', 'arch_docs'],
        testTimeout: 120000, // 2 minutes timeout for performance tests
        hookTimeout: 60000,
      },
      {
        name: 'property',
        include: ['tests/property/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules', 'dist', 'arch_docs'],
        testTimeout: 60000, // Longer timeout for property-based tests
        hookTimeout: 60000,
      },
    ],

    // Setup files for deterministic testing
    setupFiles: ['./tests/setup/deterministic.ts'],

    // Ensure deterministic test execution
    sequence: {
      shuffle: false, // Deterministic test order
      concurrent: false, // Sequential execution for determinism
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      enabled: false, // Enable via --coverage flag
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      clean: true,
      cleanOnRerun: true,

      // Include source files in coverage
      include: ['src/**/*.{js,ts}'],

      // Exclude test files and config from coverage
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'arch_docs/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/*.test.{js,ts}',
        '**/*.spec.{js,ts}',
        '**/index.ts', // Entry points typically just re-export
        'src/shared/types/index.ts', // Type-only files
      ],

      // Coverage thresholds as specified in requirements
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
