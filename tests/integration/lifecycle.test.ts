/**
 * Integration Tests - Protocol Lifecycle (Task 8.9)
 * 
 * Tests the MCP protocol state machine transitions and initialization gate enforcement.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startTestServer, initializeTestServer, sendInitialize, sendInitialized, sendToolsList, sendToolsCall } from '../helpers/testHarness.js';
import type { TestServerInstance } from '../helpers/testHarness.js';

describe('Protocol Lifecycle Integration', () => {
  let testServer: TestServerInstance;

  beforeEach(async () => {
    testServer = await startTestServer({}, { deterministic: true });
  });

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
    }
  });

  describe('State Transitions', () => {
    it('should transition STARTING → INITIALIZING → RUNNING', async () => {
      // Server starts in STARTING state
      
      // Send initialize request (STARTING → INITIALIZING)
      const initRequest = sendInitialize({
        name: 'test-client',
        version: '1.0.0'
      });
      
      const initResponse = await testServer.sendRequest(initRequest);
      
      expect(initResponse.jsonrpc).toBe('2.0');
      expect(initResponse.id).toBe(initRequest.id);
      expect(initResponse.result).toBeDefined();
      expect((initResponse.result as any).serverInfo).toBeDefined();
      expect((initResponse.result as any).serverInfo.name).toBe('foundation-mcp-runtime');
      expect((initResponse.result as any).capabilities).toBeDefined();
      
      // Send initialized notification (INITIALIZING → RUNNING)
      const initializedNotification = sendInitialized();
      await testServer.sendNotification(initializedNotification);
      
      // Now server should be in RUNNING state and accept other methods
      const toolsRequest = sendToolsList();
      const toolsResponse = await testServer.sendRequest(toolsRequest);
      
      expect(toolsResponse.jsonrpc).toBe('2.0');
      expect(toolsResponse.result).toBeDefined();
      expect(Array.isArray((toolsResponse.result as any).tools)).toBe(true);
    });

    it('should include server name and version in initialize response', async () => {
      const initRequest = sendInitialize();
      const response = await testServer.sendRequest(initRequest);
      
      expect((response.result as any).serverInfo.name).toBe('foundation-mcp-runtime');
      expect((response.result as any).serverInfo.version).toBe('0.1.0');
    });

    it('should include capabilities in initialize response', async () => {
      const initRequest = sendInitialize();
      const response = await testServer.sendRequest(initRequest);
      
      expect((response.result as any).capabilities).toBeDefined();
      expect((response.result as any).capabilities.tools).toBeDefined();
    });
  });

  describe('Initialization Gate Enforcement', () => {
    it('should block tools/list before RUNNING state', async () => {
      // Try to call tools/list before initialization
      const toolsRequest = sendToolsList();
      const response = await testServer.sendRequest(toolsRequest);
      
      // Should return JSON-RPC error -32002 (Not initialized)
      expect(response.jsonrpc).toBe('2.0');
      expect(response.error).toBeDefined();
      if (response.error) {
        expect(response.error.code).toBe(-32002);
        expect(response.error.message).toBe('Server not initialized');
        expect((response.error as any).data).toBeDefined();
        expect((response.error as any).data?.code).toBe('NOT_INITIALIZED');
        expect((response.error as any).data?.correlationId).toBeDefined();
      }
    });

    it('should block tools/call before RUNNING state', async () => {
      const toolsCallRequest = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        params: {
          name: 'health',
          arguments: {}
        },
        id: 'test-call-1'
      };
      
      const response = await testServer.sendRequest(toolsCallRequest);
      
      // Should return JSON-RPC error -32002 (Not initialized)
      expect(response.jsonrpc).toBe('2.0');
      expect(response.error).toBeDefined();
      if (response.error) {
        expect(response.error.code).toBe(-32002);
        expect(response.error.message).toBe('Server not initialized');
        expect((response.error as any).data?.code).toBe('NOT_INITIALIZED');
      }
    });

    it('should allow initialize method before RUNNING state', async () => {
      const initRequest = sendInitialize();
      const response = await testServer.sendRequest(initRequest);
      
      // Should succeed, not return error
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
    });

    it('should allow initialized notification before RUNNING state', async () => {
      // First initialize
      await testServer.sendRequest(sendInitialize());
      
      // Then send initialized notification - should not throw
      const initializedNotification = sendInitialized();
      await expect(
        testServer.sendNotification(initializedNotification)
      ).resolves.toBeUndefined();
    });

    it('should allow methods after RUNNING state is reached', async () => {
      // Complete initialization sequence
      await initializeTestServer(testServer);
      
      // Now tools/list should work
      const toolsRequest = sendToolsList();
      const response = await testServer.sendRequest(toolsRequest);
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(Array.isArray((response.result as any).tools)).toBe(true);
    });
  });

  describe('State Error Correlation', () => {
    it('should include correlationId in state errors', async () => {
      const toolsRequest = sendToolsList();
      const response = await testServer.sendRequest(toolsRequest);
      
      expect(response.error).toBeDefined();
      if (response.error && (response.error as any).data) {
        expect((response.error as any).data.correlationId).toBeDefined();
        expect(typeof (response.error as any).data.correlationId).toBe('string');
      }
    });

    it('should use connectionCorrelationId when request correlation not derivable', async () => {
      // Send request without proper ID to test fallback
      const malformedRequest = {
        jsonrpc: '2.0' as const,
        method: 'tools/list',
        id: null, // Use null id to test fallback
      };
      
      const response = await testServer.sendRequest(malformedRequest);
      
      expect(response.error).toBeDefined();
      if (response.error && (response.error as any).data?.correlationId) {
        // Should be connectionCorrelationId format (conn-xxxxxxxx)
        expect((response.error as any).data.correlationId).toMatch(/^conn-\d{8}$/);
      }
    });

    it('should preserve request correlationId when available', async () => {
      // Initialize server first so we can test normal operation correlation ID preservation
      await initializeTestServer(testServer);
      
      const toolsRequest = {
        ...sendToolsCall('nonexistent-tool', {}),
        params: {
          ...sendToolsCall('nonexistent-tool', {}).params,
          _meta: {
            correlationId: 'test-correlation-123'
          }
        }
      };
      
      const response = await testServer.sendRequest(toolsRequest);
      
      expect(response.result).toBeDefined();
      expect(response.result.isError).toBe(true);
      
      // Parse the tool error response
      const errorData = JSON.parse(response.result.content[0].text);
      expect(errorData.correlationId).toBe('test-correlation-123');
    });
  });

  describe('Protocol Compliance', () => {
    it('should handle multiple initialization attempts', async () => {
      // First initialization
      const init1 = await testServer.sendRequest(sendInitialize());
      expect(init1.result || init1.error).toBeDefined();
      
      // Second initialization attempt
      const init2 = await testServer.sendRequest(sendInitialize());
      expect(init2.result || init2.error).toBeDefined();
      
      // Should still work normally after initialized
      await testServer.sendNotification(sendInitialized());
      
      const toolsResponse = await testServer.sendRequest(sendToolsList());
      expect(toolsResponse.result).toBeDefined();
    });

    it('should handle initialized notification without prior initialize', async () => {
      // Send initialized without initialize first
      const initializedNotification = sendInitialized();
      
      // Should not throw, but server should still not be in RUNNING state
      await expect(
        testServer.sendNotification(initializedNotification)
      ).resolves.toBeUndefined();
      
      // tools/list should still be blocked
      const toolsResponse = await testServer.sendRequest(sendToolsList());
      expect(toolsResponse.error).toBeDefined();
      if (toolsResponse.error) {
        expect(toolsResponse.error.code).toBe(-32002);
      }
    });

    it('should maintain state across multiple requests', async () => {
      // Initialize properly
      await initializeTestServer(testServer);
      
      // Multiple requests should all work
      const responses = await Promise.all([
        testServer.sendRequest(sendToolsList()),
        testServer.sendRequest(sendToolsList()),
        testServer.sendRequest(sendToolsList())
      ]);
      
      responses.forEach(response => {
        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();
      });
    });
  });
});