/**
 * Property-Based Test Suite Index
 * 
 * Organizes and exports all property-based tests for the MCP server.
 * This file serves as the entry point for running all property tests.
 */

// Import all property test suites
import './correctness.test.js';
import './edge-cases.test.js';
import './pathological-inputs.test.js';

/**
 * Property Test Configuration
 * 
 * All property tests are configured with:
 * - Minimum 100 iterations per property (as required by specification)
 * - Deterministic testing via injectable Clock and IdGenerator
 * - Comprehensive coverage of all 10 correctness properties
 * - Edge case and pathological input validation
 * - Proper test tagging for traceability
 */

export const PROPERTY_TEST_CONFIG = {
  minIterations: 100,
  testCategories: [
    'correctness',
    'edge-cases', 
    'pathological-inputs'
  ],
  properties: [
    'Property 1: Initialization Response Completeness',
    'Property 2: Strict Initialization Gate', 
    'Property 3: Protocol Error Correlation',
    'Property 4: Tools/List Ordering',
    'Property 5: Validator Precompilation',
    'Property 6: Arguments Shape Enforcement',
    'Property 7: Concurrency Limit Enforcement',
    'Property 8: Timeout Enforcement with Cooperative Cancellation',
    'Property 9: Log Redaction and Sanitization',
    'Property 10: Agent Serialism'
  ]
} as const;