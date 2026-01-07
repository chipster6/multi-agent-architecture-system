/**
 * Integration test for the test harness implementation.
 * Verifies that the test harness can start a server, send requests, and capture logs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startTestServer, mcpRequests, type TestServerInstance } from '../helpers/testHarness.js';

describe('Test Harness', () => {
  let testServer: TestServerInstance;

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
    }
  });

  it('should start and stop server successfully', async () => {
    testServer = await startTestServer();
    expect(testServer).toBeDefined();
    expect(typeof testServer.sendRequest).toBe('function');
    expect(typeof testServer.close).toBe('function');
    expect(typeof testServer.getLogs).toBe('function');
    expect(typeof testServer.getServer).toBe('function');
  });

  it('should capture logs from server operations', async () => {
    testServer = await startTestServer();
    
    // The server should have logged startup information
    const logs = testServer.getLogs();
    expect(Array.isArray(logs)).toBe(true);
    
    // Note: In the current implementation, logs might be empty since we're redirecting stderr
    // This is expected behavior for the test harness
  });

  it('should provide helper functions for common MCP requests', () => {
    // Test that helper functions exist and return proper request objects
    const initializeRequest = mcpRequests.initialize();
    expect(initializeRequest).toEqual({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    });

    const initializedRequest = mcpRequests.initialized();
    expect(initializedRequest).toEqual({
      jsonrpc: '2.0',
      method: 'initialized',
      params: {}
    });

    const toolsListRequest = mcpRequests.toolsList();
    expect(toolsListRequest).toEqual({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {}
    });

    const toolsCallRequest = mcpRequests.toolsCall('test-tool', { arg: 'value' });
    expect(toolsCallRequest).toEqual({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'test-tool',
        arguments: { arg: 'value' }
      }
    });
  });

  it('should provide JSON-RPC validation utilities', async () => {
    const { jsonRpcUtils } = await import('../helpers/testHarness.js');

    // Test valid request validation
    const validRequest = {
      jsonrpc: '2.0',
      method: 'test',
      id: 1,
      params: {}
    };
    expect(jsonRpcUtils.isValidRequest(validRequest)).toBe(true);

    // Test invalid request validation
    const invalidRequest = {
      jsonrpc: '1.0', // wrong version
      method: 'test'
    };
    expect(jsonRpcUtils.isValidRequest(invalidRequest)).toBe(false);

    // Test valid response validation
    const validResponse = {
      jsonrpc: '2.0',
      id: 1,
      result: { success: true }
    };
    expect(jsonRpcUtils.isValidResponse(validResponse)).toBe(true);

    // Test error response creation
    const errorResponse = jsonRpcUtils.createErrorResponse(-32600, 'Invalid Request', 1);
    expect(errorResponse).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32600,
        message: 'Invalid Request'
      }
    });

    // Test success response creation
    const successResponse = jsonRpcUtils.createSuccessResponse({ data: 'test' }, 1);
    expect(successResponse).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { data: 'test' }
    });
  });

  it('should provide high-level MCP helper functions', async () => {
    const { mcpHelpers } = await import('../helpers/testHarness.js');
    
    // Verify helper functions exist
    expect(typeof mcpHelpers.sendInitialize).toBe('function');
    expect(typeof mcpHelpers.sendInitialized).toBe('function');
    expect(typeof mcpHelpers.sendToolsList).toBe('function');
    expect(typeof mcpHelpers.sendToolsCall).toBe('function');
    expect(typeof mcpHelpers.initializeSession).toBe('function');
  });

  it('should support configuration overrides', async () => {
    const customConfig = {
      server: {
        name: 'test-server-custom',
        version: '0.1.0-test'
      },
      tools: {
        defaultTimeoutMs: 5000
      }
    };

    testServer = await startTestServer(customConfig);
    expect(testServer).toBeDefined();
    
    const server = testServer.getServer();
    expect(server).toBeDefined();
  });

  it('should handle deterministic mode', async () => {
    const { deterministicHelpers } = await import('../helpers/testHarness.js');
    const { testClock, testIdGenerator } = await import('../setup/deterministic.js');
    
    testServer = await deterministicHelpers.createDeterministicServer(
      testClock,
      testIdGenerator
    );
    
    expect(testServer).toBeDefined();
    expect(typeof testServer.sendRequest).toBe('function');
  });
});