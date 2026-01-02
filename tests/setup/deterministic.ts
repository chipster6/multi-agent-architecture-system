/**
 * Deterministic test setup for Vitest
 *
 * This setup file provides injectable dependencies (Clock, IdGenerator)
 * for deterministic testing as specified in the requirements.
 *
 * Usage in tests:
 * - Import { testClock, testIdGenerator } from this file
 * - Pass these to components that need deterministic behavior
 */

import { beforeEach, vi } from 'vitest';

// Mock Date.now() and new Date() for deterministic timestamps
let mockTimestamp = 1640995200000; // 2022-01-01T00:00:00.000Z

export const testClock = {
  now(): number {
    return mockTimestamp;
  },

  timestamp(): string {
    return new Date(mockTimestamp).toISOString();
  },

  advance(ms: number): void {
    mockTimestamp += ms;
  },

  reset(): void {
    mockTimestamp = 1640995200000;
  },
};

// Mock ID generation for deterministic IDs
let mockIdCounter = 0;

export const testIdGenerator = {
  generateRunId(): string {
    return `run-${String(mockIdCounter++).padStart(8, '0')}`;
  },

  generateCorrelationId(): string {
    return `corr-${String(mockIdCounter++).padStart(8, '0')}`;
  },

  generateConnectionCorrelationId(): string {
    return `conn-${String(mockIdCounter++).padStart(8, '0')}`;
  },

  reset(): void {
    mockIdCounter = 0;
  },
};

// Configure fast-check for property-based testing with minimum 100 iterations
// This will be imported by property tests
export const fastCheckConfig = {
  numRuns: 100, // Minimum 100 iterations as specified in requirements
  seed: 42, // Fixed seed for deterministic property tests
  endOnFailure: true, // Stop on first failure for faster feedback
};

// Reset state before each test for determinism
beforeEach(() => {
  testClock.reset();
  testIdGenerator.reset();

  // Mock global Date for deterministic timestamps
  vi.useFakeTimers();
  vi.setSystemTime(new Date(mockTimestamp));
});

// Global fast-check configuration for property-based tests
// This ensures all property tests use minimum 100 iterations
if (typeof globalThis !== 'undefined') {
  // Only configure if fast-check is available
  try {
    const fc = require('fast-check');
    fc.configureGlobal(fastCheckConfig);
  } catch {
    // fast-check not available, skip configuration
  }
}
