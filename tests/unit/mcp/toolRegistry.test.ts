/**
 * Unit tests for ToolRegistry implementation.
 * Tests tool registration, validation, and management functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createToolRegistry, type ToolDefinition, type ToolHandler, type ToolContext } from '../../../src/mcp/toolRegistry.js';
import { createConfigManager } from '../../../src/config/configManager.js';
import { StructuredLogger, SystemClock } from '../../../src/logging/structuredLogger.js';
import { ErrorCode } from '../../../src/errors/errorHandler.js';

describe('ToolRegistry', () => {
  let toolRegistry: ReturnType<typeof createToolRegistry>;
  let configManager: ReturnType<typeof createConfigManager>;
  let logger: StructuredLogger;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    configManager = createConfigManager();
    logger = new StructuredLogger(new SystemClock());
    toolRegistry = createToolRegistry(configManager, logger);
    
    // Spy on stderr.write to capture log output without polluting test output
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  describe('register', () => {
    it('should register a valid tool successfully', () => {
      const definition: ToolDefinition = {
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        }
      };

      const handler: ToolHandler = async (args: Record<string, unknown>, _ctx: ToolContext) => {
        return { result: `Hello ${args.message}` };
      };

      expect(() => toolRegistry.register(definition, handler)).not.toThrow();
    });

    it('should reject tool with duplicate name', () => {
      const definition: ToolDefinition = {
        name: 'duplicate-tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      // Register first time - should succeed
      toolRegistry.register(definition, handler);

      // Register second time - should fail
      expect(() => toolRegistry.register(definition, handler)).toThrow();
    });

    it('should reject tool with invalid name', () => {
      const definition: ToolDefinition = {
        name: '123-invalid', // starts with number
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      expect(() => toolRegistry.register(definition, handler)).toThrow();
    });

    it('should reject tool with non-object root schema', () => {
      const definition: ToolDefinition = {
        name: 'invalid-schema-tool',
        description: 'A test tool',
        inputSchema: {
          type: 'string' // should be 'object'
        }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      expect(() => toolRegistry.register(definition, handler)).toThrow();
    });

    it('should log dynamic registrations at WARN level', () => {
      // Set environment variables to enable dynamic registration
      const originalAdminEnabled = process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'];
      const originalDynamicEnabled = process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'];
      
      process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'true';
      process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'true';
      
      // Create a new config manager and tool registry with dynamic registration enabled
      const dynamicConfigManager = createConfigManager();
      const dynamicToolRegistry = createToolRegistry(dynamicConfigManager, logger);

      const definition: ToolDefinition = {
        name: 'dynamic-test-tool',
        description: 'A dynamically registered test tool',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      // Clear previous calls
      stderrSpy.mockClear();

      // Register as dynamic tool
      dynamicToolRegistry.register(definition, handler, { isDynamic: true });

      // Verify the tool was registered
      const registeredTool = dynamicToolRegistry.get('dynamic-test-tool');
      expect(registeredTool).toBeDefined();
      expect(registeredTool?.isDynamic).toBe(true);

      // Verify WARN level log was written
      expect(stderrSpy).toHaveBeenCalled();
      const logCalls = stderrSpy.mock.calls;
      const warnLog = logCalls.find(call => {
        const logEntry = call[0] as string;
        return logEntry.includes('"level":"warn"') && 
               logEntry.includes('Dynamic tool registered: dynamic-test-tool');
      });
      expect(warnLog).toBeDefined();

      // Restore original environment variables
      if (originalAdminEnabled !== undefined) {
        process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = originalAdminEnabled;
      } else {
        delete process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'];
      }
      if (originalDynamicEnabled !== undefined) {
        process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = originalDynamicEnabled;
      } else {
        delete process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'];
      }
    });

    it('should not log static registrations', () => {
      const definition: ToolDefinition = {
        name: 'static-test-tool',
        description: 'A statically registered test tool',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      // Clear previous calls
      stderrSpy.mockClear();

      // Register as static tool (default)
      toolRegistry.register(definition, handler);

      // Verify the tool was registered
      const registeredTool = toolRegistry.get('static-test-tool');
      expect(registeredTool).toBeDefined();
      expect(registeredTool?.isDynamic).toBe(false);

      // Verify no WARN level log was written for static registration
      const logCalls = stderrSpy.mock.calls;
      const warnLog = logCalls.find(call => {
        const logEntry = call[0] as string;
        return logEntry.includes('"level":"warn"') && 
               logEntry.includes('Dynamic tool registered');
      });
      expect(warnLog).toBeUndefined();
    });
  });

  describe('get', () => {
    it('should retrieve registered tool', () => {
      const definition: ToolDefinition = {
        name: 'get-test-tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      toolRegistry.register(definition, handler);
      const retrieved = toolRegistry.get('get-test-tool');

      expect(retrieved).toBeDefined();
      expect(retrieved?.definition.name).toBe('get-test-tool');
      expect(retrieved?.handler).toBe(handler);
      expect(retrieved?.validator).toBeDefined();
    });

    it('should return undefined for non-existent tool', () => {
      const retrieved = toolRegistry.get('non-existent-tool');
      expect(retrieved).toBeUndefined();
    });

    it('should cache compiled validators and reuse them', () => {
      const definition: ToolDefinition = {
        name: 'validator-cache-test',
        description: 'A test tool for validator caching',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      toolRegistry.register(definition, handler);
      
      // Get the tool multiple times
      const retrieved1 = toolRegistry.get('validator-cache-test');
      const retrieved2 = toolRegistry.get('validator-cache-test');

      expect(retrieved1).toBeDefined();
      expect(retrieved2).toBeDefined();
      
      // The validator should be the same instance (cached)
      expect(retrieved1?.validator).toBe(retrieved2?.validator);
      
      // The validator should be a function
      expect(typeof retrieved1?.validator).toBe('function');
      
      // Test that the validator works correctly
      const validator = retrieved1!.validator;
      
      // Valid input should pass
      const validInput = { message: 'hello' };
      expect(validator(validInput)).toBe(true);
      
      // Invalid input should fail
      const invalidInput = { notMessage: 'hello' };
      expect(validator(invalidInput)).toBe(false);
      expect(validator.errors).toBeDefined();
    });
  });

  describe('list', () => {
    it('should return empty array when no tools registered', () => {
      const tools = toolRegistry.list();
      expect(tools).toEqual([]);
    });

    it('should return tools sorted lexicographically by name', () => {
      const tools = [
        { name: 'zebra-tool', description: 'Z tool', inputSchema: { type: 'object', properties: {} } },
        { name: 'alpha-tool', description: 'A tool', inputSchema: { type: 'object', properties: {} } },
        { name: 'beta-tool', description: 'B tool', inputSchema: { type: 'object', properties: {} } }
      ];

      const handler: ToolHandler = async () => ({ result: 'test' });

      tools.forEach(tool => toolRegistry.register(tool, handler));

      const listed = toolRegistry.list();
      expect(listed).toHaveLength(3);
      expect(listed[0].name).toBe('alpha-tool');
      expect(listed[1].name).toBe('beta-tool');
      expect(listed[2].name).toBe('zebra-tool');
    });
  });

  describe('unregister', () => {
    it('should remove registered tool and return true', () => {
      const definition: ToolDefinition = {
        name: 'unregister-test-tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      toolRegistry.register(definition, handler);
      expect(toolRegistry.get('unregister-test-tool')).toBeDefined();

      const result = toolRegistry.unregister('unregister-test-tool');
      expect(result).toBe(true);
      expect(toolRegistry.get('unregister-test-tool')).toBeUndefined();
    });

    it('should return false for non-existent tool', () => {
      const result = toolRegistry.unregister('non-existent-tool');
      expect(result).toBe(false);
    });
  });

  describe('validateDefinition', () => {
    it('should validate correct tool definition', () => {
      const definition: ToolDefinition = {
        name: 'valid-tool',
        description: 'A valid test tool',
        inputSchema: {
          type: 'object',
          properties: {
            param: { type: 'string' }
          }
        }
      };

      const result = toolRegistry.validateDefinition(definition);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject definition with invalid name', () => {
      const definition: ToolDefinition = {
        name: '', // empty name
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      };

      const result = toolRegistry.validateDefinition(definition);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.path === 'name')).toBe(true);
    });

    it('should reject definition with empty description', () => {
      const definition: ToolDefinition = {
        name: 'test-tool',
        description: '', // empty description
        inputSchema: {
          type: 'object',
          properties: {}
        }
      };

      const result = toolRegistry.validateDefinition(definition);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.path === 'description')).toBe(true);
    });

    it('should reject definition with non-object root schema', () => {
      const definition: ToolDefinition = {
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: {
          type: 'string' // should be 'object'
        }
      };

      const result = toolRegistry.validateDefinition(definition);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.path === 'inputSchema.type')).toBe(true);
    });
  });
});