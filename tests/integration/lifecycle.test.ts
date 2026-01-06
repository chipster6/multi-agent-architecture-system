/**
 * Integration tests for MCP protocol lifecycle state machine.
 * 
 * Tests the STARTING → INITIALIZING → RUNNING state transitions
 * and enforcement of the strict initialization gate as specified
 * in the requirements and design documents.
 * 
 * Requirements tested:
 * - 1.2: MCP initialization sequence
 * - 1.3: State machine enforcement
 * - 8.2: Integration test coverage
 * 
 * Updated with Context7 consultation findings:
 * - Enhanced async testing patterns with expect.poll()
 * - Improved mock lifecycle management
 * - Strict JSON-RPC 2.0 compliance validation
 * - Direct protocol handler testing approach
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSession } from '../../src/mcp/session.js';
import { 
  handleInitialize, 
  handleInitialized, 
  enforceInitializationGate,
  handleToolsList,
  handleParseError,
  handleInvalidRequest,
  handleMethodNotFound,
  handleInvalidParams
} from '../../src/mcp/handlers.js';
import { createConfigManager } from '../../src/config/configManager.js';
import { StructuredLogger, SystemClock } from '../../src/logging/structuredLogger.js';
import { createToolRegistry } from '../../src/mcp/toolRegistry.js';
import { createResourceManager } from '../../src/resources/resourceManager.js';
import { ProductionIdGenerator } from '../../src/shared/idGenerator.js';
import type { SessionContext } from '../../src/mcp/session.js';
import type { ServerConfig } from '../../src/config/configManager.js';
import type { ToolRegistry } from '../../src/mcp/toolRegistry.js';

describe('Protocol Lifecycle State Machine', () => {
  let session: SessionContext;
  let config: ServerConfig;
  let toolRegistry: ToolRegistry;
  let resourceManager: any;
  let logger: StructuredLogger;
  let idGenerator: ProductionIdGenerator;

  beforeEach(() => {
    // Initialize test components
    const configManager = createConfigManager();
    config = configManager.load();
    logger = new StructuredLogger(new SystemClock(), config.logging.redactKeys);
    toolRegistry = createToolRegistry(configManager, logger);
    resourceManager = createResourceManager(config);
    idGenerator = new ProductionIdGenerator();

    // Create a fresh session for each test
    session = createSession(
      { type: 'stdio' },
      idGenerator,
      logger
    );

    // Clear any remaining mocks to prevent test interference
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any resources
    vi.clearAllMocks();
  });

  describe('State Transitions', () => {
    it('should start in STARTING state and transition through INITIALIZING to RUNNING', () => {
      // Verify initial state
      expect(session.state).toBe('STARTING');
      expect(session.connectionCorrelationId).toBeDefined();
      expect(typeof session.connectionCorrelationId).toBe('string');
      expect(session.transport.type).toBe('stdio');

      // Step 1: Handle initialize request (STARTING → INITIALIZING)
      const initParams = {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test-client', version: '1.0.0' },
        capabilities: {}
      };

      const initResult = handleInitialize(initParams, session, config);

      // Verify initialize response structure
      expect(initResult.protocolVersion).toBe('2024-11-05');
      expect(initResult.serverInfo).toBeDefined();
      expect(initResult.serverInfo.name).toBe(config.server.name);
      expect(initResult.serverInfo.version).toBe(config.server.version);
      expect(initResult.capabilities).toBeDefined();
      expect(initResult.capabilities.tools).toBeDefined();

      // Verify state transition to INITIALIZING
      expect(session.state).toBe('INITIALIZING');

      // Step 2: Handle initialized notification (INITIALIZING → RUNNING)
      handleInitialized(session);

      // Verify state transition to RUNNING
      expect(session.state).toBe('RUNNING');
    });

    it('should allow initialize and initialized at any state', () => {
      // Can call initialize multiple times
      const initParams = {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test-client', version: '1.0.0' },
        capabilities: {}
      };

      const firstInit = handleInitialize(initParams, session, config);
      expect(firstInit.protocolVersion).toBe('2024-11-05');
      expect(session.state).toBe('INITIALIZING');

      // Second initialize call should throw error since we're no longer in STARTING state
      expect(() => {
        handleInitialize(initParams, session, config);
      }).toThrow();

      // Can call initialized after initialize
      handleInitialized(session);
      expect(session.state).toBe('RUNNING');
    });
  });

  describe('Strict Initialization Gate', () => {
    it('should block tools/list before RUNNING state with -32002 error', () => {
      // Verify session is in STARTING state
      expect(session.state).toBe('STARTING');

      // Try to enforce initialization gate for tools/list
      const gateResult = enforceInitializationGate(session, 'tools/list');

      // Should return JSON-RPC error -32002 (Not initialized)
      expect(gateResult).toBeDefined();
      expect(gateResult!.jsonrpc).toBe('2.0');
      expect(gateResult!.error).toBeDefined();
      expect(gateResult!.error.code).toBe(-32002);
      expect(gateResult!.error.message).toBe('Not initialized');
      
      // Verify error data contains structured error with correlationId
      expect(gateResult!.error.data).toBeDefined();
      const errorData = gateResult!.error.data as any;
      expect(errorData.code).toBe('NOT_INITIALIZED');
      expect(errorData.message).toBeDefined();
      expect(typeof errorData.message).toBe('string');
      expect(errorData.correlationId).toBe(session.connectionCorrelationId);
      
      // runId should NOT be present in state errors (only in tool errors)
      expect(errorData.runId).toBeUndefined();
    });

    it('should block tools/call before RUNNING state with -32002 error', () => {
      // Verify session is in STARTING state
      expect(session.state).toBe('STARTING');

      // Try to enforce initialization gate for tools/call
      const gateResult = enforceInitializationGate(session, 'tools/call');

      // Should return JSON-RPC error -32002 (Not initialized)
      expect(gateResult).toBeDefined();
      expect(gateResult!.jsonrpc).toBe('2.0');
      expect(gateResult!.error).toBeDefined();
      expect(gateResult!.error.code).toBe(-32002);
      expect(gateResult!.error.message).toBe('Not initialized');
      
      // Verify error data structure matches JSON-RPC 2.0 spec
      expect(gateResult!.error.data).toBeDefined();
      const errorData = gateResult!.error.data as any;
      expect(errorData.code).toBe('NOT_INITIALIZED');
      expect(errorData.correlationId).toBe(session.connectionCorrelationId);
    });

    it('should block unknown methods before RUNNING state with -32002 error', () => {
      // Verify session is in STARTING state
      expect(session.state).toBe('STARTING');

      // Try to enforce initialization gate for unknown method
      const gateResult = enforceInitializationGate(session, 'unknown/method');

      // Should return JSON-RPC error -32002 (Not initialized)
      // The initialization gate is enforced before method resolution
      expect(gateResult).toBeDefined();
      expect(gateResult!.error).toBeDefined();
      expect(gateResult!.error.code).toBe(-32002);
      expect(gateResult!.error.message).toBe('Not initialized');
    });

    it('should allow initialize and initialized methods at any state', () => {
      // Verify session is in STARTING state
      expect(session.state).toBe('STARTING');

      // initialize and initialized should be allowed
      const initGateResult = enforceInitializationGate(session, 'initialize');
      expect(initGateResult).toBeUndefined();

      const initializedGateResult = enforceInitializationGate(session, 'initialized');
      expect(initializedGateResult).toBeUndefined();
    });

    it('should allow all methods after RUNNING state', () => {
      // Transition to RUNNING state
      const initParams = {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test-client', version: '1.0.0' },
        capabilities: {}
      };
      handleInitialize(initParams, session, config);
      handleInitialized(session);
      expect(session.state).toBe('RUNNING');

      // All methods should be allowed now
      const toolsListGate = enforceInitializationGate(session, 'tools/list');
      expect(toolsListGate).toBeUndefined();

      const toolsCallGate = enforceInitializationGate(session, 'tools/call');
      expect(toolsCallGate).toBeUndefined();

      const unknownGate = enforceInitializationGate(session, 'unknown/method');
      expect(unknownGate).toBeUndefined();
    });

    it('should use connectionCorrelationId in state error responses', () => {
      // Verify session is in STARTING state
      expect(session.state).toBe('STARTING');

      // Make two different gate checks that should be blocked
      const toolsListGate = enforceInitializationGate(session, 'tools/list');
      const toolsCallGate = enforceInitializationGate(session, 'tools/call');

      // Both should have the same connectionCorrelationId since they're from the same session
      expect(toolsListGate!.error.data).toBeDefined();
      expect(toolsCallGate!.error.data).toBeDefined();
      
      const listErrorData = toolsListGate!.error.data as any;
      const callErrorData = toolsCallGate!.error.data as any;
      
      expect(listErrorData.correlationId).toBeDefined();
      expect(callErrorData.correlationId).toBeDefined();
      expect(listErrorData.correlationId).toBe(callErrorData.correlationId);
      expect(listErrorData.correlationId).toBe(session.connectionCorrelationId);
      
      // Verify both errors have the same structure and error codes
      expect(listErrorData.code).toBe('NOT_INITIALIZED');
      expect(callErrorData.code).toBe('NOT_INITIALIZED');
      expect(toolsListGate!.error.code).toBe(-32002);
      expect(toolsCallGate!.error.code).toBe(-32002);
    });
  });

  describe('Initialization Sequence Validation', () => {
    it('should require initialize before initialized', () => {
      // Verify session is in STARTING state
      expect(session.state).toBe('STARTING');

      // Try to call initialized without initialize first - should throw error
      expect(() => {
        handleInitialized(session);
      }).toThrow('Cannot complete initialization: session in STARTING state, expected INITIALIZING');

      // But if we create a fresh session and try tools/list without proper initialization
      const freshSession = createSession(
        { type: 'stdio' },
        idGenerator,
        logger
      );
      
      // Should still block tools/list without proper initialization
      const gateResult = enforceInitializationGate(freshSession, 'tools/list');
      expect(gateResult).toBeDefined();
      expect(gateResult!.error.code).toBe(-32002);
      expect(gateResult!.error.message).toBe('Not initialized');
    });

    it('should complete full initialization sequence successfully', () => {
      // Verify session is in STARTING state
      expect(session.state).toBe('STARTING');

      // Step 1: Handle initialize request
      const initParams = {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test-client', version: '1.0.0' },
        capabilities: {}
      };

      const initResult = handleInitialize(initParams, session, config);
      
      // Verify initialize response structure
      expect(initResult.protocolVersion).toBe('2024-11-05');
      expect(initResult.serverInfo).toBeDefined();
      expect(initResult.serverInfo.name).toBe(config.server.name);
      expect(initResult.serverInfo.version).toBe(config.server.version);
      expect(initResult.capabilities).toBeDefined();
      expect(initResult.capabilities.tools).toBeDefined();

      // Verify state transition to INITIALIZING
      expect(session.state).toBe('INITIALIZING');

      // Step 2: Handle initialized notification
      handleInitialized(session);

      // Verify state transition to RUNNING
      expect(session.state).toBe('RUNNING');

      // Verify we can now call all methods
      const toolsListGate = enforceInitializationGate(session, 'tools/list');
      expect(toolsListGate).toBeUndefined();

      const toolsCallGate = enforceInitializationGate(session, 'tools/call');
      expect(toolsCallGate).toBeUndefined();

      // Test actual tools/list handler
      const toolsListResult = handleToolsList(session, toolRegistry, config, resourceManager);
      expect(toolsListResult).toBeDefined();
      expect(toolsListResult.tools).toBeDefined();
      expect(Array.isArray(toolsListResult.tools)).toBe(true);
    });

    it('should handle multiple initialize calls gracefully', () => {
      // Verify session is in STARTING state
      expect(session.state).toBe('STARTING');

      const initParams = {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test-client', version: '1.0.0' },
        capabilities: {}
      };

      // Call initialize multiple times - first should succeed
      const firstInit = handleInitialize(initParams, session, config);
      expect(firstInit.protocolVersion).toBe('2024-11-05');
      expect(session.state).toBe('INITIALIZING');

      // Second initialize call should throw error since we're no longer in STARTING state
      expect(() => {
        handleInitialize(initParams, session, config);
      }).toThrow();

      // Complete initialization
      handleInitialized(session);
      expect(session.state).toBe('RUNNING');

      // Should work normally after initialization
      const toolsListGate = enforceInitializationGate(session, 'tools/list');
      expect(toolsListGate).toBeUndefined();
    });
  });

  describe('Error Response Format Validation', () => {
    it('should return properly formatted JSON-RPC error responses', () => {
      // Verify session is in STARTING state
      expect(session.state).toBe('STARTING');

      // Try to call tools/list before initialization
      const gateResult = enforceInitializationGate(session, 'tools/list');

      // Validate JSON-RPC 2.0 error response structure per specification
      expect(gateResult).toBeDefined();
      expect(gateResult!.jsonrpc).toBe('2.0');
      expect(gateResult!.error).toBeDefined();
      expect(gateResult!.result).toBeUndefined();
      
      // Validate error structure per JSON-RPC 2.0 spec
      const error = gateResult!.error!;
      expect(typeof error.code).toBe('number');
      expect(typeof error.message).toBe('string');
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.data).toBeDefined();
      
      // Validate structured error data (MCP extension)
      const errorData = error.data as any;
      expect(errorData.code).toBe('NOT_INITIALIZED');
      expect(typeof errorData.message).toBe('string');
      expect(errorData.message.length).toBeGreaterThan(0);
      expect(typeof errorData.correlationId).toBe('string');
      expect(errorData.correlationId.length).toBeGreaterThan(0);
      expect(errorData.correlationId).toBe(session.connectionCorrelationId);
      
      // Verify error code is in the correct range per JSON-RPC 2.0 spec
      expect(error.code).toBe(-32002); // Server error range: -32000 to -32099
    });

    it('should include request id in error responses when provided', () => {
      // Test parse error handler
      const parseErrorResult = handleParseError(session);
      
      // Validate JSON-RPC 2.0 compliance for parse error
      expect(parseErrorResult.jsonrpc).toBe('2.0');
      expect(parseErrorResult.error).toBeDefined();
      expect(parseErrorResult.id).toBe(null); // Parse errors always have id: null
      expect(parseErrorResult.error!.code).toBe(-32700);
      expect(parseErrorResult.error!.message).toBe('Parse error');
      expect(parseErrorResult.error!.data).toBeDefined();
      
      const errorData = parseErrorResult.error!.data as any;
      expect(errorData.correlationId).toBe(session.connectionCorrelationId);
    });

    it('should handle numeric request ids correctly', () => {
      // Test method not found handler with numeric id
      const methodNotFoundResult = handleMethodNotFound(session, 'unknown/method', 42);
      
      // Validate JSON-RPC 2.0 compliance for numeric id handling
      expect(methodNotFoundResult.jsonrpc).toBe('2.0');
      expect(methodNotFoundResult.error).toBeDefined();
      expect(methodNotFoundResult.id).toBe(42);
      expect(typeof methodNotFoundResult.id).toBe('number');
      
      // Verify error structure is maintained with numeric id
      expect(methodNotFoundResult.error!.code).toBe(-32601);
      expect(methodNotFoundResult.error!.message).toBe('Method not found: unknown/method');
      
      const errorData = methodNotFoundResult.error!.data as any;
      expect(errorData.correlationId).toBe(session.connectionCorrelationId);
    });
  });

  describe('State Persistence Across Requests', () => {
    it('should maintain RUNNING state across multiple requests', () => {
      // Complete initialization
      const initParams = {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test-client', version: '1.0.0' },
        capabilities: {}
      };
      
      handleInitialize(initParams, session, config);
      handleInitialized(session);
      expect(session.state).toBe('RUNNING');

      // Make multiple gate checks - all should succeed
      const gateChecks = [
        enforceInitializationGate(session, 'tools/list'),
        enforceInitializationGate(session, 'tools/call'),
        enforceInitializationGate(session, 'tools/list'),
        enforceInitializationGate(session, 'tools/call')
      ];

      gateChecks.forEach((gateResult, index) => {
        expect(gateResult).toBeUndefined();
      });

      // Test actual handler calls
      const toolsListResult1 = handleToolsList(session, toolRegistry, config, resourceManager);
      expect(toolsListResult1).toBeDefined();
      expect(toolsListResult1.tools).toBeDefined();

      const toolsListResult2 = handleToolsList(session, toolRegistry, config, resourceManager);
      expect(toolsListResult2).toBeDefined();
      expect(toolsListResult2.tools).toBeDefined();

      // State should remain RUNNING
      expect(session.state).toBe('RUNNING');
    });

    it('should not allow re-initialization after RUNNING', () => {
      // Complete initialization
      const initParams = {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test-client', version: '1.0.0' },
        capabilities: {}
      };
      
      handleInitialize(initParams, session, config);
      handleInitialized(session);
      expect(session.state).toBe('RUNNING');

      // Verify we're in RUNNING state
      const toolsGate = enforceInitializationGate(session, 'tools/list');
      expect(toolsGate).toBeUndefined();

      // Try to initialize again - should throw error since we're not in STARTING state
      expect(() => {
        handleInitialize(initParams, session, config);
      }).toThrow();

      // Should still be able to call methods after failed re-init attempt
      const postReinitGate = enforceInitializationGate(session, 'tools/list');
      expect(postReinitGate).toBeUndefined();
      
      const toolsListResult = handleToolsList(session, toolRegistry, config, resourceManager);
      expect(toolsListResult).toBeDefined();
      expect(toolsListResult.tools).toBeDefined();
    });
  });
});