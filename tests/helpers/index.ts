/**
 * Test helpers index - exports all test utilities for easy importing.
 * 
 * This module re-exports all test harness functionality to provide a single
 * import point for integration tests and other test files.
 * 
 * Usage:
 * ```typescript
 * import {
 *   startTestServer,
 *   initializeTestServer,
 *   sendToolsCall,
 *   assertLogContains,
 *   type TestServerInstance
 * } from '../helpers/index.js';
 * ```
 */

// Re-export all test harness functionality
export {
  // Core interfaces
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcNotification,
  type CapturedLogEntry,
  type TestServerInstance,
  
  // Main test server functions
  startTestServer,
  initializeTestServer,
  
  // JSON-RPC helper functions
  sendInitialize,
  sendInitialized,
  sendToolsList,
  sendToolsCall,
  
  // Validation functions
  validateJsonRpcResponse,
  validateJsonRpcError,
  
  // Log utilities
  assertLogContains,
  waitForLog,
} from './testHarness.js';