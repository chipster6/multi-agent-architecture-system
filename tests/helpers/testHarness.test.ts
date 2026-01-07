/**
 * Tests for the test harness itself.
 * Verifies that the test harness provides the expected functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startTestServer,
  sendInitialize,
  sendInitialized,
  sendToolsList,
  sendToolsCall,
  initializeTestServer,
  validateJsonRpcResponse,
  validateJsonRpcError,
  assertLogContains,
  type TestServerInstance,
} from './testHarness.js';
import { DeterministicIdGenerator, ControllableClock } from '../../src/shared/index.js';

describe('Test Harness', () => {
  let testServer: TestServerInstance;

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
    }
  });

  describe('Server Lifecycle', () => {
    it('should start and stop test server', async () => {
      testServer = await startTestServer();
      expect(testServer).toBeDefined();
      expect(typeof testServer.sendRequest).toBe('function');
      expect(typeof testServer.close).toBe('function');
      expect(typeof testServer.getLogs).toBe('function');
      
      await testServer.close();
    });

    it('should support deterministic mode', async () => {
      const clock = new ControllableClock(new Date('2024-01-15T10:30:00.000Z'));
      const idGenerator = new DeterministicIdGenerator();
      
      testServer = await startTestServer(undefined, {
        clock,
        idGenerator,
        deterministic: true,
      });
      
      expect(testServer).toBeDefined();
    });

    it('should support configuration overrides', async () => {
      testServer = await startTestServer({
        server: {
          name: 'test-server',
          version: '1.0.0-test',
          shutdownTimeoutMs: 5000,
        },
        tools: {
          defaultTimeoutMs: 15000,
          maxPayloadBytes: 512000,
        },
      });
      
      expect(testServer).toBeDefined();
    });
  });

  describe('JSON-RPC Communication', () => {
    beforeEach(async () => {
      testServer = await startTestServer();
    });

    it('should handle initialize request', async () => {
      const initRequest = sendInitialize({ name: 'test-client', version: '1.0.0' });
      const response = await testServer.sendRequest(initRequest);
      
      expect(validateJsonRpcResponse(response)).toBe(true);
      expect(response.id).toBe('init-1');
      expect(response.result).toBeDefined();
      
      const result = response.result as any;
      expect(result.protocolVersion).toBe('2024-11-05');
      expect(result.serverInfo).toBeDefined();
      expect(result.serverInfo.name).toBe('foundation-mcp-runtime');
      expect(result.capabilities).toBeDefined();
    });

    it('should handle initialized notification', async () => {
      // First initialize
      await testServer.sendRequest(sendInitialize());
      
      // Then send initialized notification (should not throw)
      const notification = sendInitialized();
      await expect(testServer.sendNotification(notification)).resolves.toBeUndefined();
    });

    it('should handle tools/list request after initialization', async () => {
      // Initialize server
      await initializeTestServer(testServer);
      
      // Request tools list
      const toolsListRequest = sendToolsList();
      const response = await testServer.sendRequest(toolsListRequest);
      
      expect(validateJsonRpcResponse(response)).toBe(true);
      expect(response.result).toBeDefined();
      
      const result = response.result as any;
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      
      // Should include health tool
      const healthTool = result.tools.find((tool: any) => tool.name === 'health');
      expect(healthTool).toBeDefined();
      expect(healthTool.description).toBeDefined();
      expect(healthTool.inputSchema).toBeDefined();
    });

    it('should handle tools/call request', async () => {
      // Initialize server
      await initializeTestServer(testServer);
      
      // Call health tool
      const toolsCallRequest = sendToolsCall('health', {});
      const response = await testServer.sendRequest(toolsCallRequest);
      
      expect(validateJsonRpcResponse(response)).toBe(true);
      expect(response.result).toBeDefined();
      
      const result = response.result as any;
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.isError).toBe(false);
    });

    it('should enforce initialization gate', async () => {
      // Try to call tools/list before initialization
      const toolsListRequest = sendToolsList();
      const response = await testServer.sendRequest(toolsListRequest);
      
      expect(validateJsonRpcResponse(response)).toBe(true);
      expect(response.error).toBeDefined();
      expect(validateJsonRpcError(response.error)).toBe(true);
      expect(response.error!.code).toBe(-32002); // Not initialized
    });
  });

  describe('Log Capture', () => {
    beforeEach(async () => {
      testServer = await startTestServer();
    });

    it('should capture log entries', async () => {
      // Initialize server to generate some logs
      await initializeTestServer(testServer);
      
      const logs = testServer.getLogs();
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
      
      // Should have startup logs
      const hasStartupLog = assertLogContains(logs, 'info', 'Starting Foundation MCP Runtime');
      expect(hasStartupLog).toBe(true);
    });

    it('should clear log entries', async () => {
      // Generate some logs
      await initializeTestServer(testServer);
      
      let logs = testServer.getLogs();
      expect(logs.length).toBeGreaterThan(0);
      
      // Clear logs
      testServer.clearLogs();
      
      logs = testServer.getLogs();
      expect(logs.length).toBe(0);
    });

    it('should capture structured log entries with correlation IDs', async () => {
      // Initialize server
      await initializeTestServer(testServer);
      
      // Make a tools/call to generate logs with correlation ID
      await testServer.sendRequest(sendToolsCall('health', {}));
      
      const logs = testServer.getLogs();
      
      // Should have logs with correlation IDs
      const hasCorrelationLog = logs.some(log => 
        log.correlationId !== undefined && 
        typeof log.correlationId === 'string'
      );
      expect(hasCorrelationLog).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    it('should validate JSON-RPC response structure', () => {
      const validResponse = {
        jsonrpc: '2.0',
        id: 'test-1',
        result: { success: true },
      };
      expect(validateJsonRpcResponse(validResponse)).toBe(true);
      
      const validError = {
        jsonrpc: '2.0',
        id: 'test-2',
        error: { code: -32600, message: 'Invalid request' },
      };
      expect(validateJsonRpcResponse(validError)).toBe(true);
      
      const invalid = {
        jsonrpc: '2.0',
        id: 'test-3',
        // Missing both result and error
      };
      expect(validateJsonRpcResponse(invalid)).toBe(false);
    });

    it('should validate JSON-RPC error structure', () => {
      const validError = {
        code: -32600,
        message: 'Invalid request',
        data: { additional: 'info' },
      };
      expect(validateJsonRpcError(validError)).toBe(true);
      
      const invalidError = {
        code: 'not-a-number',
        message: 'Invalid request',
      };
      expect(validateJsonRpcError(invalidError)).toBe(false);
    });

    it('should create proper initialize request', () => {
      const request = sendInitialize({ name: 'test', version: '1.0' });
      
      expect(request.jsonrpc).toBe('2.0');
      expect(request.method).toBe('initialize');
      expect(request.id).toBe('init-1');
      expect(request.params).toBeDefined();
      
      const params = request.params as any;
      expect(params.protocolVersion).toBe('2024-11-05');
      expect(params.clientInfo.name).toBe('test');
      expect(params.clientInfo.version).toBe('1.0');
    });

    it('should create proper tools/call request', () => {
      const request = sendToolsCall('test-tool', { arg1: 'value1' }, { correlationId: 'test-corr' });
      
      expect(request.jsonrpc).toBe('2.0');
      expect(request.method).toBe('tools/call');
      expect(request.params).toBeDefined();
      
      const params = request.params as any;
      expect(params.name).toBe('test-tool');
      expect(params.arguments).toEqual({ arg1: 'value1' });
      expect(params._meta).toEqual({ correlationId: 'test-corr' });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      testServer = await startTestServer();
    });

    it('should handle unknown method requests', async () => {
      // Initialize server first
      await initializeTestServer(testServer);
      
      // Send a request for an unknown method
      const request = {
        jsonrpc: '2.0' as const,
        id: 'unknown-test',
        method: 'nonexistent/method',
        params: {},
      };
      
      const response = await testServer.sendRequest(request);
      
      expect(validateJsonRpcResponse(response)).toBe(true);
      expect(response.error).toBeDefined();
      expect(validateJsonRpcError(response.error)).toBe(true);
      expect(response.error!.code).toBe(-32601); // Method not found
    });

    it('should handle server close gracefully', async () => {
      // Initialize server
      await initializeTestServer(testServer);
      
      // Close server
      await testServer.close();
      
      // Verify server is closed by checking that we can't send requests
      // (In a real scenario, this would throw, but our test harness handles it gracefully)
      const logs = testServer.getLogs();
      const hasStopLog = assertLogContains(logs, 'info', 'Foundation MCP Runtime stopped');
      expect(hasStopLog).toBe(true);
    });
  });
});