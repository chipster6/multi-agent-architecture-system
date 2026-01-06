/**
 * Simple Property-Based Tests
 * 
 * Minimal tests to verify the property testing infrastructure works
 */

import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';

describe('Simple Property Tests', () => {
  test.prop([fc.integer()])('integers are numbers', (value) => {
    expect(typeof value).toBe('number');
    expect(Number.isInteger(value)).toBe(true);
  }, { numRuns: 10, timeout: 1000 });

  test.prop([fc.string()])('strings have length property', (value) => {
    expect(typeof value).toBe('string');
    expect(typeof value.length).toBe('number');
    expect(value.length).toBeGreaterThanOrEqual(0);
  }, { numRuns: 10, timeout: 1000 });

  test.prop([fc.array(fc.integer())])('arrays are arrays', (value) => {
    expect(Array.isArray(value)).toBe(true);
    expect(typeof value.length).toBe('number');
  }, { numRuns: 10, timeout: 1000 });
});