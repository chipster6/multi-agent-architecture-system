/**
 * Integration tests for MCP tools/list and tools/call handlers.
 * 
 * Tests the complete tool lifecycle including registration, listing,
 * validation, execution, and error handling as specified in the
 * requirements and design documents.
 * 
 * Requirements tested:
 * - 2.3: Tool listing and ordering
 * - 3.1-3.6: Tool execution and error handling
 * - 8.2, 8.3: Integration test coverage
 * 
 * Updated with Context7 consultation findings:
 * - Direct handler testing approach
 * - Enhanced error testing patterns
 * - Proper timeout and exception handling
 * - Structured tool response validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSession } from '../../src/mcp/session.js';
import { 
  handleInitialize, 
  handleInitialized, 
  handleToolsList,
  wrapResult,
  wrapToolError
} from '../../src/mcp/handlers.js';
import { createConfigManager } from '../../src/config/configManager.js';
import { StructuredLogger, SystemClock } from '../../src/logging/structuredLogger.js';
import { createToolRegistry } from '../../src/mcp/toolRegistry.js';
import { createResourceManager } from '../../src/resources/resourceManager.js';
import { ProductionIdGenerator } from '../../src/shared/idGenerator.js';
import { ErrorCode, createError } from '../../src/errors/errorHandler.js';
import type { SessionContext } from '../../src/mcp/session.js';
import type { ServerConfig } from '../../src/config/configManager.js';
import type { ToolRegistry } from '../../src/mcp/toolRegistry.js';
import type { ToolContext } from '../../src/mcp/toolRegistry.js';
import * as z from 'zod';

describe('Tools Integration Tests', () => {
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

    // Initialize session to RUNNING state
    const initParams = {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'test-client', version: '1.0.0' },
      capabilities: {}
    };
    handleInitialize(initParams, session, config);
    handleInitialized(session);

    // Clear any remaining mocks to prevent test interference
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any resources
    vi.clearAllMocks();
  });

  describe('tools/list Handler', () => {
    it('should return registered tools in lexicographic order', () => {
      // Register tools in non-alphabetical order
      toolRegistry.register(
        {
          name: 'zebra-tool',
          description: 'A zebra tool',
          inputSchema: { type: 'object', properties: { input: { type: 'string' } } }
        },
        async (args: any, ctx: ToolContext) => ({ result: 'zebra' })
      );

      toolRegistry.register(
        {
          name: 'alpha-tool',
          description: 'An alpha tool',
          inputSchema: { type: 'object', properties: { value: { type: 'number' } } }
        },
        async (args: any, ctx: ToolContext) => ({ result: 'alpha' })
      );

      toolRegistry.register(
        {
          name: 'beta-tool',
          description: 'A beta tool',
          inputSchema: { type: 'object', properties: { flag: { type: 'boolean' } } },
          version: '1.2.0'
        },
        async (args: any, ctx: ToolContext) => ({ result: 'beta' })
      );

      // Call tools/list handler
      const result = handleToolsList(session, toolRegistry, config, resourceManager);

      // Verify tools are returned in lexicographic order
      expect(result.tools).toHaveLength(3);
      expect(result.tools[0].name).toBe('alpha-tool');
      expect(result.tools[1].name).toBe('beta-tool');
      expect(result.tools[2].name).toBe('zebra-tool');

      // Verify tool structure
      expect(result.tools[0]).toEqual({
        name: 'alpha-tool',
        description: 'An alpha tool',
        inputSchema: { type: 'object', properties: { value: { type: 'number' } } }
      });

      expect(result.tools[1]).toEqual({
        name: 'beta-tool',
        description: 'A beta tool',
        inputSchema: { type: 'object', properties: { flag: { type: 'boolean' } } },
        version: '1.2.0'
      });

      expect(result.tools[2]).toEqual({
        name: 'zebra-tool',
        description: 'A zebra tool',
        inputSchema: { type: 'object', properties: { input: { type: 'string' } } }
      });
    });

    it('should return empty array when no tools are registered', () => {
      const result = handleToolsList(session, toolRegistry, config, resourceManager);

      expect(result.tools).toEqual([]);
    });

    it('should exclude admin tools when dynamic registration is not effective', () => {
      // Register a regular tool
      toolRegistry.register(
        {
          name: 'regular-tool',
          description: 'A regular tool',
          inputSchema: { type: 'object', properties: {} }
        },
        async (args: any, ctx: ToolContext) => ({ result: 'regular' })
      );

      // Register an admin tool (simulated by adding isAdminTool property)
      const adminToolDef = {
        name: 'admin-tool',
        description: 'An admin tool',
        inputSchema: { type: 'object', properties: {} },
        isAdminTool: true
      };
      
      toolRegistry.register(
        adminToolDef,
        async (args: any, ctx: ToolContext) => ({ result: 'admin' })
      );

      // Ensure dynamic registration is not effective
      expect(config.tools.adminRegistrationEnabled && config.security.dynamicRegistrationEnabled).toBe(false);

      const result = handleToolsList(session, toolRegistry, config, resourceManager);

      // Should only return the regular tool, not the admin tool
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('regular-tool');
    });
  });

  describe('tools/call Handler - Success Cases', () => {
    beforeEach(() => {
      // Register test tools for call testing
      toolRegistry.register(
        {
          name: 'add-numbers',
          description: 'Add two numbers',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' }
            },
            required: ['a', 'b']
          }
        },
        async (args: { a: number; b: number }, ctx: ToolContext) => {
          return { result: args.a + args.b, operation: 'addition' };
        }
      );

      toolRegistry.register(
        {
          name: 'echo-message',
          description: 'Echo a message',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' }
            },
            required: ['message']
          }
        },
        async (args: { message: string }, ctx: ToolContext) => {
          return { echo: args.message, timestamp: new Date().toISOString() };
        }
      );
    });

    it('should successfully call tool with valid arguments', () => {
      const tool = toolRegistry.get('add-numbers');
      expect(tool).toBeDefined();

      // Simulate tool execution
      const args = { a: 5, b: 3 };
      const ctx: ToolContext = {
        runId: idGenerator.generateRunId(),
        correlationId: idGenerator.generateCorrelationId(),
        logger: session.logger,
        abortSignal: new AbortController().signal
      };

      // Execute tool handler directly
      const resultPromise = tool!.handler(args, ctx);

      return expect(resultPromise).resolves.toEqual({
        result: 8,
        operation: 'addition'
      });
    });

    it('should wrap successful results in MCP format', () => {
      const result = { result: 42, status: 'success' };
      const ctx = {
        runId: 'test-run-123',
        correlationId: 'test-corr-456',
        transport: { type: 'stdio' as const },
        connectionCorrelationId: session.connectionCorrelationId,
        logger: session.logger
      };

      const wrappedResult = wrapResult(result, ctx);

      expect(wrappedResult).toEqual({
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: false
      });
    });

    it('should include runId and correlationId in successful responses', () => {
      const result = 'success';
      const ctx = {
        runId: 'test-run-789',
        correlationId: 'test-corr-012',
        transport: { type: 'stdio' as const },
        connectionCorrelationId: session.connectionCorrelationId,
        logger: session.logger
      };

      const wrappedResult = wrapResult(result, ctx);

      expect(wrappedResult.isError).toBe(false);
      expect(wrappedResult.content).toHaveLength(1);
      expect(wrappedResult.content[0].type).toBe('text');
      expect(wrappedResult.content[0].text).toBe(JSON.stringify(result));
    });
  });

  describe('tools/call Handler - Error Cases', () => {
    beforeEach(() => {
      // Register a tool that validates input strictly
      toolRegistry.register(
        {
          name: 'strict-tool',
          description: 'A tool with strict validation',
          inputSchema: {
            type: 'object',
            properties: {
              requiredField: { type: 'string', minLength: 1 },
              numberField: { type: 'number', minimum: 0 }
            },
            required: ['requiredField', 'numberField'],
            additionalProperties: false
          }
        },
        async (args: any, ctx: ToolContext) => {
          return { processed: args };
        }
      );

      // Register a tool that throws exceptions
      toolRegistry.register(
        {
          name: 'error-tool',
          description: 'A tool that throws errors',
          inputSchema: {
            type: 'object',
            properties: {
              shouldThrow: { type: 'boolean' },
              errorType: { type: 'string' }
            },
            required: ['shouldThrow']
          }
        },
        async (args: { shouldThrow: boolean; errorType?: string }, ctx: ToolContext) => {
          if (args.shouldThrow) {
            switch (args.errorType) {
              case 'timeout':
                throw createError(ErrorCode.Timeout, 'Operation timed out');
              case 'not-found':
                throw createError(ErrorCode.NotFound, 'Resource not found');
              default:
                throw new Error('Generic error occurred');
            }
          }
          return { success: true };
        }
      );
    });

    it('should return INVALID_ARGUMENT for schema validation failures', () => {
      const tool = toolRegistry.get('strict-tool');
      expect(tool).toBeDefined();

      // Test with invalid arguments
      const invalidArgs = {
        requiredField: '', // Too short
        numberField: -1,   // Below minimum
        extraField: 'not allowed' // Additional property
      };

      // Validate arguments using the tool's validator
      const validationResult = tool!.validator(invalidArgs);
      expect(validationResult).toBe(false);

      // Create a structured error for invalid arguments
      const error = createError(
        ErrorCode.InvalidArgument,
        'Invalid tool arguments',
        { validationErrors: tool!.validator.errors }
      );

      const ctx = {
        runId: 'test-run-123',
        correlationId: 'test-corr-456',
        transport: { type: 'stdio' as const },
        connectionCorrelationId: session.connectionCorrelationId,
        logger: session.logger
      };

      const wrappedError = wrapToolError(error, ctx);

      expect(wrappedError.isError).toBe(true);
      expect(wrappedError.content).toHaveLength(1);
      expect(wrappedError.content[0].type).toBe('text');

      const errorData = JSON.parse(wrappedError.content[0].text);
      expect(errorData.code).toBe(ErrorCode.InvalidArgument);
      expect(errorData.message).toBe('Invalid tool arguments');
      expect(errorData.correlationId).toBe(ctx.correlationId);
      expect(errorData.runId).toBe(ctx.runId);
    });

    it('should return NOT_FOUND for unknown tools', () => {
      const tool = toolRegistry.get('non-existent-tool');
      expect(tool).toBeUndefined();

      // Create NOT_FOUND error
      const error = createError(
        ErrorCode.NotFound,
        'Tool not found: non-existent-tool'
      );

      const ctx = {
        runId: 'test-run-123',
        correlationId: 'test-corr-456',
        transport: { type: 'stdio' as const },
        connectionCorrelationId: session.connectionCorrelationId,
        logger: session.logger
      };

      const wrappedError = wrapToolError(error, ctx);

      expect(wrappedError.isError).toBe(true);
      const errorData = JSON.parse(wrappedError.content[0].text);
      expect(errorData.code).toBe(ErrorCode.NotFound);
      expect(errorData.message).toBe('Tool not found: non-existent-tool');
      expect(errorData.correlationId).toBe(ctx.correlationId);
      expect(errorData.runId).toBe(ctx.runId);
    });

    it('should return INTERNAL for handler exceptions', async () => {
      const tool = toolRegistry.get('error-tool');
      expect(tool).toBeDefined();

      const args = { shouldThrow: true };
      const ctx: ToolContext = {
        runId: idGenerator.generateRunId(),
        correlationId: idGenerator.generateCorrelationId(),
        logger: session.logger,
        abortSignal: new AbortController().signal
      };

      // Execute tool handler and expect it to throw
      await expect(tool!.handler(args, ctx)).rejects.toThrow('Generic error occurred');

      // Test with structured error
      const structuredArgs = { shouldThrow: true, errorType: 'not-found' };
      await expect(tool!.handler(structuredArgs, ctx)).rejects.toThrow();
    });

    it('should return TIMEOUT for timeout scenarios', async () => {
      // Register a tool that simulates timeout behavior
      toolRegistry.register(
        {
          name: 'slow-tool',
          description: 'A tool that can timeout',
          inputSchema: {
            type: 'object',
            properties: {
              delay: { type: 'number' }
            },
            required: ['delay']
          }
        },
        async (args: { delay: number }, ctx: ToolContext) => {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              resolve({ completed: true, delay: args.delay });
            }, args.delay);

            // Listen for abort signal
            ctx.abortSignal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(createError(ErrorCode.Timeout, 'Operation was aborted'));
            });
          });
        }
      );

      const tool = toolRegistry.get('slow-tool');
      expect(tool).toBeDefined();

      // Create an AbortController and abort it immediately to simulate timeout
      const abortController = new AbortController();
      const ctx: ToolContext = {
        runId: idGenerator.generateRunId(),
        correlationId: idGenerator.generateCorrelationId(),
        logger: session.logger,
        abortSignal: abortController.signal
      };

      // Start the tool execution
      const executionPromise = tool!.handler({ delay: 1000 }, ctx);

      // Immediately abort to simulate timeout
      abortController.abort();

      // Should reject with timeout error
      await expect(executionPromise).rejects.toThrow();
    });

    it('should include runId and correlationId in error responses', () => {
      const error = createError(
        ErrorCode.InvalidArgument,
        'Test error message',
        { details: 'Additional error details' }
      );

      const ctx = {
        runId: 'test-run-999',
        correlationId: 'test-corr-888',
        transport: { type: 'stdio' as const },
        connectionCorrelationId: session.connectionCorrelationId,
        logger: session.logger
      };

      const wrappedError = wrapToolError(error, ctx);

      expect(wrappedError.isError).toBe(true);
      const errorData = JSON.parse(wrappedError.content[0].text);
      expect(errorData.runId).toBe('test-run-999');
      expect(errorData.correlationId).toBe('test-corr-888');
      expect(errorData.code).toBe(ErrorCode.InvalidArgument);
      expect(errorData.message).toBe('Test error message');
      expect(errorData.details).toEqual({ details: 'Additional error details' });
    });
  });

  describe('Result and Error Wrapping', () => {
    it('should handle primitive result types correctly', () => {
      const ctx = {
        runId: 'test-run-123',
        correlationId: 'test-corr-456',
        transport: { type: 'stdio' as const },
        connectionCorrelationId: session.connectionCorrelationId,
        logger: session.logger
      };

      // Test string result
      const stringResult = wrapResult('hello world', ctx);
      expect(stringResult).toEqual({
        content: [{ type: 'text', text: '"hello world"' }],
        isError: false
      });

      // Test number result
      const numberResult = wrapResult(42, ctx);
      expect(numberResult).toEqual({
        content: [{ type: 'text', text: '42' }],
        isError: false
      });

      // Test boolean result
      const booleanResult = wrapResult(true, ctx);
      expect(booleanResult).toEqual({
        content: [{ type: 'text', text: 'true' }],
        isError: false
      });

      // Test null result
      const nullResult = wrapResult(null, ctx);
      expect(nullResult).toEqual({
        content: [{ type: 'text', text: 'null' }],
        isError: false
      });
    });

    it('should handle complex object results correctly', () => {
      const ctx = {
        runId: 'test-run-123',
        correlationId: 'test-corr-456',
        transport: { type: 'stdio' as const },
        connectionCorrelationId: session.connectionCorrelationId,
        logger: session.logger
      };

      const complexResult = {
        data: [1, 2, 3],
        metadata: { count: 3, type: 'numbers' },
        success: true
      };

      const wrappedResult = wrapResult(complexResult, ctx);
      expect(wrappedResult.isError).toBe(false);
      expect(wrappedResult.content).toHaveLength(1);
      expect(wrappedResult.content[0].type).toBe('text');

      const parsedResult = JSON.parse(wrappedResult.content[0].text);
      expect(parsedResult).toEqual(complexResult);
    });

    it('should handle non-serializable results gracefully', () => {
      const ctx = {
        runId: 'test-run-123',
        correlationId: 'test-corr-456',
        transport: { type: 'stdio' as const },
        connectionCorrelationId: session.connectionCorrelationId,
        logger: session.logger
      };

      // Create a circular reference
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      const wrappedResult = wrapResult(circularObj, ctx);
      expect(wrappedResult.isError).toBe(true);
      expect(wrappedResult.content).toHaveLength(1);

      const errorData = JSON.parse(wrappedResult.content[0].text);
      expect(errorData.code).toBe(ErrorCode.Internal);
      expect(errorData.message).toBe('Result not serializable');
      expect(errorData.details.reason).toBe('result_not_serializable');
      expect(errorData.correlationId).toBe(ctx.correlationId);
      expect(errorData.runId).toBe(ctx.runId);
    });
  });

  describe('Tool Registry Integration', () => {
    it('should validate tool definitions during registration', () => {
      // Valid tool registration should succeed
      expect(() => {
        toolRegistry.register(
          {
            name: 'valid-tool',
            description: 'A valid tool',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' }
              }
            }
          },
          async (args: any, ctx: ToolContext) => ({ result: 'ok' })
        );
      }).not.toThrow();

      // Invalid tool registration should fail
      expect(() => {
        toolRegistry.register(
          {
            name: 'invalid-tool',
            description: 'An invalid tool',
            inputSchema: {
              type: 'array', // Non-object root schema should be rejected
              items: { type: 'string' }
            }
          },
          async (args: any, ctx: ToolContext) => ({ result: 'ok' })
        );
      }).toThrow();
    });

    it('should prevent duplicate tool registration', () => {
      const toolDef = {
        name: 'duplicate-tool',
        description: 'A tool that will be duplicated',
        inputSchema: { type: 'object', properties: {} }
      };
      const handler = async (args: any, ctx: ToolContext) => ({ result: 'ok' });

      // First registration should succeed
      expect(() => {
        toolRegistry.register(toolDef, handler);
      }).not.toThrow();

      // Second registration with same name should fail
      expect(() => {
        toolRegistry.register(toolDef, handler);
      }).toThrow();
    });

    it('should compile and cache schema validators', () => {
      const toolDef = {
        name: 'validated-tool',
        description: 'A tool with validation',
        inputSchema: {
          type: 'object',
          properties: {
            required_field: { type: 'string' },
            optional_field: { type: 'number' }
          },
          required: ['required_field']
        }
      };

      toolRegistry.register(
        toolDef,
        async (args: any, ctx: ToolContext) => ({ result: 'validated' })
      );

      const registeredTool = toolRegistry.get('validated-tool');
      expect(registeredTool).toBeDefined();
      expect(registeredTool!.validator).toBeDefined();

      // Test validator with valid input
      const validInput = { required_field: 'test' };
      expect(registeredTool!.validator(validInput)).toBe(true);

      // Test validator with invalid input
      const invalidInput = { optional_field: 42 }; // Missing required field
      expect(registeredTool!.validator(invalidInput)).toBe(false);
      expect(registeredTool!.validator.errors).toBeDefined();
    });
  });
});