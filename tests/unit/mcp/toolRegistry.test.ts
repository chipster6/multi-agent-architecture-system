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
      expect(() => toolRegistry.register(definition, handler)).not.toThrow();
      
      // Verify the tool was registered successfully
      const registeredTool = toolRegistry.get('duplicate-tool');
      expect(registeredTool).toBeDefined();
      expect(registeredTool?.definition.name).toBe('duplicate-tool');

      // Register second time with same name - should fail with specific error
      try {
        toolRegistry.register(definition, handler);
        expect.fail('Expected registration to throw an error for duplicate name');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.InvalidArgument);
        expect(error.message).toContain('Tool with name \'duplicate-tool\' is already registered');
      }

      // Verify the registry still contains only one tool with that name
      const toolsAfterDuplicate = toolRegistry.list();
      const duplicateTools = toolsAfterDuplicate.filter(t => t.name === 'duplicate-tool');
      expect(duplicateTools).toHaveLength(1);
    });

    it('should reject duplicate name even with different handler', () => {
      const definition: ToolDefinition = {
        name: 'same-name-tool',
        description: 'First tool',
        inputSchema: {
          type: 'object',
          properties: { param1: { type: 'string' } },
        }
      };

      const handler1: ToolHandler = async () => ({ result: 'handler1' });
      const handler2: ToolHandler = async () => ({ result: 'handler2' });

      // Register first tool
      toolRegistry.register(definition, handler1);

      // Try to register different handler with same name - should fail
      const differentDefinition: ToolDefinition = {
        name: 'same-name-tool', // same name
        description: 'Second tool', // different description
        inputSchema: {
          type: 'object',
          properties: { param2: { type: 'number' } }, // different schema
        }
      };

      try {
        toolRegistry.register(differentDefinition, handler2);
        expect.fail('Expected registration to throw an error for duplicate name');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.InvalidArgument);
        expect(error.message).toContain('Tool with name \'same-name-tool\' is already registered');
      }

      // Verify only the first tool remains
      const registeredTool = toolRegistry.get('same-name-tool');
      expect(registeredTool).toBeDefined();
      expect(registeredTool?.definition.description).toBe('First tool');
      expect(registeredTool?.handler).toBe(handler1);
    });

    it('should treat tool names as case-sensitive for duplicates', () => {
      const handler: ToolHandler = async () => ({ result: 'test' });

      const lowerCaseDefinition: ToolDefinition = {
        name: 'case-test-tool',
        description: 'Lowercase tool',
        inputSchema: { type: 'object', properties: {} }
      };

      const upperCaseDefinition: ToolDefinition = {
        name: 'CASE-TEST-TOOL',
        description: 'Uppercase tool',
        inputSchema: { type: 'object', properties: {} }
      };

      const mixedCaseDefinition: ToolDefinition = {
        name: 'Case-Test-Tool',
        description: 'Mixed case tool',
        inputSchema: { type: 'object', properties: {} }
      };

      // All should register successfully as names are case-sensitive
      expect(() => toolRegistry.register(lowerCaseDefinition, handler)).not.toThrow();
      expect(() => toolRegistry.register(upperCaseDefinition, handler)).not.toThrow();
      expect(() => toolRegistry.register(mixedCaseDefinition, handler)).not.toThrow();

      // Verify all three tools are registered
      expect(toolRegistry.get('case-test-tool')).toBeDefined();
      expect(toolRegistry.get('CASE-TEST-TOOL')).toBeDefined();
      expect(toolRegistry.get('Case-Test-Tool')).toBeDefined();

      const tools = toolRegistry.list();
      const caseTestTools = tools.filter(t => t.name.toLowerCase().includes('case-test-tool'));
      expect(caseTestTools).toHaveLength(3);
    });

    it('should prevent duplicates between static and dynamic registrations', () => {
      const definition: ToolDefinition = {
        name: 'static-dynamic-conflict',
        description: 'Test tool',
        inputSchema: { type: 'object', properties: {} }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      // Register as static tool first
      toolRegistry.register(definition, handler, { isDynamic: false });

      // Try to register same name as dynamic tool - should fail
      try {
        toolRegistry.register(definition, handler, { isDynamic: true });
        expect.fail('Expected registration to throw an error for duplicate name');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.InvalidArgument);
        expect(error.message).toContain('Tool with name \'static-dynamic-conflict\' is already registered');
      }

      // Verify only the static tool remains
      const registeredTool = toolRegistry.get('static-dynamic-conflict');
      expect(registeredTool).toBeDefined();
      expect(registeredTool?.isDynamic).toBe(false);
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

    it('should reject tools with various non-object root schema types', () => {
      const handler: ToolHandler = async () => ({ result: 'test' });
      
      const nonObjectTypes = [
        'string',
        'number', 
        'boolean',
        'array',
        'null'
      ];

      nonObjectTypes.forEach((type, index) => {
        const definition: ToolDefinition = {
          name: `invalid-schema-tool-${index}`,
          description: 'A test tool',
          inputSchema: {
            type: type as any
          }
        };

        expect(() => toolRegistry.register(definition, handler)).toThrow(
          /Tool input schema must have type "object" at root level/
        );
      });
    });

    it('should reject tool with missing type in root schema', () => {
      const definition: ToolDefinition = {
        name: 'missing-type-tool',
        description: 'A test tool',
        inputSchema: {
          properties: {
            message: { type: 'string' }
          }
          // missing 'type' field
        }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      expect(() => toolRegistry.register(definition, handler)).toThrow(
        /Tool input schema must have type "object" at root level/
      );
    });

    it('should throw INVALID_ARGUMENT error for non-object root schema', () => {
      const definition: ToolDefinition = {
        name: 'error-code-test-tool',
        description: 'A test tool',
        inputSchema: {
          type: 'string'
        }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      try {
        toolRegistry.register(definition, handler);
        expect.fail('Expected registration to throw an error');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.InvalidArgument);
        expect(error.message).toContain('Tool input schema must have type "object" at root level');
      }
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

    describe('allowArbitraryCodeTools security (reserved for future use)', () => {
      it('should accept allowArbitraryCodeTools configuration but not use it in v0.1', () => {
        // Test that the configuration field exists and can be set to true
        const originalAllowArbitrary = process.env['MCP_SECURITY_ALLOW_ARBITRARY_CODE_TOOLS'];
        const originalAdminEnabled = process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'];
        const originalDynamicEnabled = process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'];
        
        // Enable dynamic registration for this test
        process.env['MCP_SECURITY_ALLOW_ARBITRARY_CODE_TOOLS'] = 'true';
        process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'true';
        process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'true';
        
        try {
          // Create config manager with allowArbitraryCodeTools enabled
          const configWithArbitrary = createConfigManager();
          const config = configWithArbitrary.load();
          
          // Verify the configuration field is set
          expect(config.security.allowArbitraryCodeTools).toBe(true);
          expect(config.tools.adminRegistrationEnabled).toBe(true);
          expect(config.security.dynamicRegistrationEnabled).toBe(true);
          
          // Create tool registry with this config
          const registryWithArbitrary = createToolRegistry(configWithArbitrary, logger);
          
          // Test that tool registration works the same regardless of allowArbitraryCodeTools setting
          const definition: ToolDefinition = {
            name: 'arbitrary-code-test-tool',
            description: 'Test tool for allowArbitraryCodeTools',
            inputSchema: {
              type: 'object',
              properties: {
                code: { type: 'string' }
              },
              required: ['code']
            }
          };

          const handler: ToolHandler = async (args) => ({ result: `Executed: ${args.code}` });

          // Registration should succeed (same as when allowArbitraryCodeTools is false)
          expect(() => registryWithArbitrary.register(definition, handler, { isDynamic: true })).not.toThrow();
          
          // Tool should be registered normally
          const registeredTool = registryWithArbitrary.get('arbitrary-code-test-tool');
          expect(registeredTool).toBeDefined();
          expect(registeredTool?.definition.name).toBe('arbitrary-code-test-tool');
          expect(registeredTool?.isDynamic).toBe(true);
          
        } finally {
          // Restore original environment variables
          if (originalAllowArbitrary !== undefined) {
            process.env['MCP_SECURITY_ALLOW_ARBITRARY_CODE_TOOLS'] = originalAllowArbitrary;
          } else {
            delete process.env['MCP_SECURITY_ALLOW_ARBITRARY_CODE_TOOLS'];
          }
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
        }
      });

      it('should behave identically when allowArbitraryCodeTools is false (default)', () => {
        // Enable dynamic registration but keep allowArbitraryCodeTools as default (false)
        const originalAdminEnabled = process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'];
        const originalDynamicEnabled = process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'];
        
        process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'true';
        process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'true';
        
        try {
          // Create config manager with dynamic registration enabled but allowArbitraryCodeTools false
          const configWithDynamic = createConfigManager();
          const config = configWithDynamic.load();
          
          expect(config.security.allowArbitraryCodeTools).toBe(false);
          expect(config.tools.adminRegistrationEnabled).toBe(true);
          expect(config.security.dynamicRegistrationEnabled).toBe(true);
          
          // Create tool registry with this config
          const registryWithDynamic = createToolRegistry(configWithDynamic, logger);
          
          // Test that tool registration works normally
          const definition: ToolDefinition = {
            name: 'no-arbitrary-code-test-tool',
            description: 'Test tool with allowArbitraryCodeTools disabled',
            inputSchema: {
              type: 'object',
              properties: {
                data: { type: 'string' }
              },
              required: ['data']
            }
          };

          const handler: ToolHandler = async (args) => ({ result: `Processed: ${args.data}` });

          // Registration should succeed (v0.1 doesn't enforce this restriction yet)
          expect(() => registryWithDynamic.register(definition, handler, { isDynamic: true })).not.toThrow();
          
          // Tool should be registered normally
          const registeredTool = registryWithDynamic.get('no-arbitrary-code-test-tool');
          expect(registeredTool).toBeDefined();
          expect(registeredTool?.definition.name).toBe('no-arbitrary-code-test-tool');
          expect(registeredTool?.isDynamic).toBe(true);
          
        } finally {
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
        }
      });

      it('should document that allowArbitraryCodeTools is reserved for future use', () => {
        // This test documents the current state: allowArbitraryCodeTools exists but is not used
        const config = configManager.load();
        
        // The field should exist in the configuration
        expect(config.security).toHaveProperty('allowArbitraryCodeTools');
        expect(typeof config.security.allowArbitraryCodeTools).toBe('boolean');
        
        // Default should be false
        expect(config.security.allowArbitraryCodeTools).toBe(false);
        
        // In v0.1, this setting should not affect tool registration behavior
        // Both true and false should allow the same tool registrations
        // This test serves as documentation that the feature is not yet implemented
        
        // Set up environment for dynamic registration
        const originalAdminEnabled = process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'];
        const originalDynamicEnabled = process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'];
        const originalAllowArbitrary = process.env['MCP_SECURITY_ALLOW_ARBITRARY_CODE_TOOLS'];
        
        process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'true';
        process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'true';
        
        try {
          // Test with allowArbitraryCodeTools: false (default)
          const configWithDefaults = createConfigManager();
          const registryWithDefaults = createToolRegistry(configWithDefaults, logger);
          
          const definition: ToolDefinition = {
            name: 'future-security-test-tool',
            description: 'Test tool for future security implementation',
            inputSchema: {
              type: 'object',
              properties: {
                command: { type: 'string' }
              }
            }
          };

          const handler: ToolHandler = async () => ({ result: 'test' });
          
          // Should succeed with default (false) setting
          expect(() => registryWithDefaults.register(definition, handler, { isDynamic: true })).not.toThrow();
          expect(registryWithDefaults.get('future-security-test-tool')).toBeDefined();
          
          // Clean up for next test
          registryWithDefaults.unregister('future-security-test-tool');
          
          // Test with allowArbitraryCodeTools: true (should behave the same in v0.1)
          process.env['MCP_SECURITY_ALLOW_ARBITRARY_CODE_TOOLS'] = 'true';
          
          const configWithArbitrary = createConfigManager();
          const registryWithArbitrary = createToolRegistry(configWithArbitrary, logger);
          
          // Should succeed with true setting (same behavior in v0.1)
          expect(() => registryWithArbitrary.register(definition, handler, { isDynamic: true })).not.toThrow();
          expect(registryWithArbitrary.get('future-security-test-tool')).toBeDefined();
          
        } finally {
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
          if (originalAllowArbitrary !== undefined) {
            process.env['MCP_SECURITY_ALLOW_ARBITRARY_CODE_TOOLS'] = originalAllowArbitrary;
          } else {
            delete process.env['MCP_SECURITY_ALLOW_ARBITRARY_CODE_TOOLS'];
          }
        }
      });

      it('should validate allowArbitraryCodeTools as boolean in configuration', () => {
        // Test that the configuration validation properly handles allowArbitraryCodeTools
        const validConfig = {
          security: {
            dynamicRegistrationEnabled: true,
            allowArbitraryCodeTools: true
          }
        };
        
        const result = configManager.validate(validConfig);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
        
        // Test invalid configuration (non-boolean value)
        const invalidConfig = {
          security: {
            dynamicRegistrationEnabled: true,
            allowArbitraryCodeTools: 'yes' as any // should be boolean
          }
        };
        
        const invalidResult = configManager.validate(invalidConfig);
        expect(invalidResult.valid).toBe(false);
        expect(invalidResult.errors).toBeDefined();
        expect(invalidResult.errors?.some(e => 
          e.path === 'security.allowArbitraryCodeTools' && 
          e.message === 'Must be a boolean'
        )).toBe(true);
      });
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

    it('should handle case-sensitive tool name retrieval', () => {
      const handler: ToolHandler = async () => ({ result: 'test' });

      const lowerCaseDefinition: ToolDefinition = {
        name: 'case-sensitive-tool',
        description: 'Lowercase tool',
        inputSchema: { type: 'object', properties: {} }
      };

      toolRegistry.register(lowerCaseDefinition, handler);

      // Exact match should work
      expect(toolRegistry.get('case-sensitive-tool')).toBeDefined();
      
      // Different case should not match
      expect(toolRegistry.get('Case-Sensitive-Tool')).toBeUndefined();
      expect(toolRegistry.get('CASE-SENSITIVE-TOOL')).toBeUndefined();
      expect(toolRegistry.get('case-SENSITIVE-tool')).toBeUndefined();
    });

    it('should handle tool names with special characters', () => {
      const handler: ToolHandler = async () => ({ result: 'test' });

      const specialNames = [
        'tool-with-hyphens',
        'tool_with_underscores',
        'tool/with/slashes',
        'tool123',
        'a-very-long-tool-name-with-many-parts-separated-by-hyphens'
      ];

      specialNames.forEach(name => {
        const definition: ToolDefinition = {
          name,
          description: `Tool with name: ${name}`,
          inputSchema: { type: 'object', properties: {} }
        };
        toolRegistry.register(definition, handler);
      });

      // Verify all tools can be retrieved by their exact names
      specialNames.forEach(name => {
        const retrieved = toolRegistry.get(name);
        expect(retrieved).toBeDefined();
        expect(retrieved?.definition.name).toBe(name);
      });
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

    it('should precompile schemas at registration time and fail fast on invalid schemas', () => {
      // Test that schema compilation happens at registration time, not at call time
      const validDefinition: ToolDefinition = {
        name: 'precompile-test',
        description: 'A test tool for precompilation',
        inputSchema: {
          type: 'object',
          properties: {
            count: { type: 'number', minimum: 0 }
          },
          required: ['count']
        }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      // Registration should succeed and compile the schema
      expect(() => toolRegistry.register(validDefinition, handler)).not.toThrow();
      
      const registeredTool = toolRegistry.get('precompile-test');
      expect(registeredTool).toBeDefined();
      expect(typeof registeredTool?.validator).toBe('function');

      // Test that the precompiled validator works correctly
      const validator = registeredTool!.validator;
      
      // Valid input
      expect(validator({ count: 5 })).toBe(true);
      expect(validator.errors).toBeNull();
      
      // Invalid input (wrong type)
      expect(validator({ count: 'not-a-number' })).toBe(false);
      expect(validator.errors).toBeDefined();
      expect(validator.errors?.length).toBeGreaterThan(0);
      
      // Invalid input (violates minimum constraint)
      expect(validator({ count: -1 })).toBe(false);
      expect(validator.errors).toBeDefined();
      
      // Missing required field
      expect(validator({})).toBe(false);
      expect(validator.errors).toBeDefined();
    });

    it('should fail fast on invalid schema compilation at registration time', () => {
      // Test with an invalid JSON Schema that cannot be compiled
      const invalidSchemaDefinition: ToolDefinition = {
        name: 'invalid-schema-test',
        description: 'A test tool with invalid schema',
        inputSchema: {
          type: 'object',
          properties: {
            // Invalid schema: circular reference that Ajv cannot compile
            invalidRef: { $ref: '#/properties/invalidRef' }
          }
        }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      // Registration should fail immediately due to schema compilation error
      expect(() => toolRegistry.register(invalidSchemaDefinition, handler)).toThrow();
      
      // Tool should not be registered
      expect(toolRegistry.get('invalid-schema-test')).toBeUndefined();
    });

    it('should use only precompiled validators with no runtime compilation', () => {
      // This test verifies that validators are precompiled at registration time
      // and reused without any runtime compilation during validation
      const definition: ToolDefinition = {
        name: 'no-runtime-compilation-test',
        description: 'Test that no runtime compilation occurs',
        inputSchema: {
          type: 'object',
          properties: {
            value: { type: 'string', pattern: '^[a-z]+$' }
          },
          required: ['value']
        }
      };

      const handler: ToolHandler = async () => ({ result: 'test' });

      // Register the tool - this should compile the schema
      toolRegistry.register(definition, handler);
      
      const registeredTool = toolRegistry.get('no-runtime-compilation-test');
      expect(registeredTool).toBeDefined();
      
      const validator = registeredTool!.validator;
      expect(typeof validator).toBe('function');
      
      // The validator should be a compiled Ajv validator function
      // Multiple calls to the same validator should return the exact same function instance
      const validator2 = toolRegistry.get('no-runtime-compilation-test')!.validator;
      expect(validator).toBe(validator2); // Same function instance
      
      // Test multiple validations with the same precompiled validator
      // Each validation should use the same precompiled function
      expect(validator({ value: 'hello' })).toBe(true);
      expect(validator({ value: 'world' })).toBe(true);
      expect(validator({ value: 'INVALID' })).toBe(false); // uppercase fails pattern
      expect(validator({ value: 123 })).toBe(false); // wrong type
      expect(validator({})).toBe(false); // missing required field
      
      // Verify that the validator function has Ajv-specific properties
      // indicating it's a precompiled validator
      expect(validator).toHaveProperty('errors');
      expect(validator).toHaveProperty('schema');
      expect(validator).toHaveProperty('schemaEnv');
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

    it('should handle lexicographic ordering with special characters and numbers', () => {
      const tools = [
        { name: 'tool-99', description: 'Tool 99', inputSchema: { type: 'object', properties: {} } },
        { name: 'tool-10', description: 'Tool 10', inputSchema: { type: 'object', properties: {} } },
        { name: 'tool-2', description: 'Tool 2', inputSchema: { type: 'object', properties: {} } },
        { name: 'tool_underscore', description: 'Tool with underscore', inputSchema: { type: 'object', properties: {} } },
        { name: 'tool-hyphen', description: 'Tool with hyphen', inputSchema: { type: 'object', properties: {} } },
        { name: 'tool/slash', description: 'Tool with slash', inputSchema: { type: 'object', properties: {} } },
        { name: 'TOOL-UPPER', description: 'Tool uppercase', inputSchema: { type: 'object', properties: {} } },
        { name: 'tool-lower', description: 'Tool lowercase', inputSchema: { type: 'object', properties: {} } }
      ];

      const handler: ToolHandler = async () => ({ result: 'test' });

      tools.forEach(tool => toolRegistry.register(tool, handler));

      const listed = toolRegistry.list();
      expect(listed).toHaveLength(8);
      
      // Verify lexicographic ordering (case-sensitive, ASCII order)
      const expectedOrder = [
        'TOOL-UPPER',    // Uppercase comes before lowercase in ASCII
        'tool-10',       // String comparison: '1' < '2' < '9'
        'tool-2',
        'tool-99',
        'tool-hyphen',
        'tool-lower',
        'tool/slash',    // '/' comes after '-' in ASCII
        'tool_underscore' // '_' comes after '/' in ASCII
      ];
      
      const actualOrder = listed.map(t => t.name);
      expect(actualOrder).toEqual(expectedOrder);
    });

    it('should handle large number of tools and maintain ordering', () => {
      const handler: ToolHandler = async () => ({ result: 'test' });
      const toolCount = 100;
      const tools: ToolDefinition[] = [];

      // Create tools with names that will test ordering thoroughly
      for (let i = 0; i < toolCount; i++) {
        const paddedNumber = i.toString().padStart(3, '0');
        tools.push({
          name: `tool-${paddedNumber}`,
          description: `Tool number ${i}`,
          inputSchema: { type: 'object', properties: {} }
        });
      }

      // Register tools in random order to ensure sorting works
      const shuffledTools = [...tools].sort(() => Math.random() - 0.5);
      shuffledTools.forEach(tool => toolRegistry.register(tool, handler));

      const listed = toolRegistry.list();
      expect(listed).toHaveLength(toolCount);

      // Verify all tools are in correct lexicographic order
      const expectedNames = tools.map(t => t.name).sort();
      const actualNames = listed.map(t => t.name);
      expect(actualNames).toEqual(expectedNames);

      // Verify each tool is correctly ordered relative to its neighbors
      for (let i = 1; i < listed.length; i++) {
        expect(listed[i - 1].name.localeCompare(listed[i].name)).toBeLessThan(0);
      }
    });

    it('should maintain consistent ordering across multiple list calls', () => {
      const tools = [
        { name: 'gamma-tool', description: 'Gamma tool', inputSchema: { type: 'object', properties: {} } },
        { name: 'alpha-tool', description: 'Alpha tool', inputSchema: { type: 'object', properties: {} } },
        { name: 'delta-tool', description: 'Delta tool', inputSchema: { type: 'object', properties: {} } },
        { name: 'beta-tool', description: 'Beta tool', inputSchema: { type: 'object', properties: {} } }
      ];

      const handler: ToolHandler = async () => ({ result: 'test' });
      tools.forEach(tool => toolRegistry.register(tool, handler));

      // Call list multiple times and verify consistent ordering
      const list1 = toolRegistry.list();
      const list2 = toolRegistry.list();
      const list3 = toolRegistry.list();

      expect(list1.map(t => t.name)).toEqual(list2.map(t => t.name));
      expect(list2.map(t => t.name)).toEqual(list3.map(t => t.name));
      expect(list1.map(t => t.name)).toEqual(['alpha-tool', 'beta-tool', 'delta-tool', 'gamma-tool']);
    });

    it('should include version field when provided in tool definition', () => {
      const toolsWithVersions = [
        { 
          name: 'versioned-tool-1', 
          description: 'Tool with version', 
          inputSchema: { type: 'object', properties: {} },
          version: '1.0.0'
        },
        { 
          name: 'versioned-tool-2', 
          description: 'Tool with version', 
          inputSchema: { type: 'object', properties: {} },
          version: '2.1.0'
        },
        { 
          name: 'unversioned-tool', 
          description: 'Tool without version', 
          inputSchema: { type: 'object', properties: {} }
        }
      ];

      const handler: ToolHandler = async () => ({ result: 'test' });

      toolsWithVersions.forEach(tool => toolRegistry.register(tool, handler));

      const listed = toolRegistry.list();
      expect(listed).toHaveLength(3);
      
      // Find each tool and verify version handling
      const versionedTool1 = listed.find(t => t.name === 'versioned-tool-1');
      const versionedTool2 = listed.find(t => t.name === 'versioned-tool-2');
      const unversionedTool = listed.find(t => t.name === 'unversioned-tool');

      expect(versionedTool1?.version).toBe('1.0.0');
      expect(versionedTool2?.version).toBe('2.1.0');
      expect(unversionedTool?.version).toBeUndefined();
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

    it('should reject definitions with various non-object root schema types in validateDefinition', () => {
      const nonObjectTypes = [
        'string',
        'number', 
        'boolean',
        'array',
        'null'
      ];

      nonObjectTypes.forEach((type) => {
        const definition: ToolDefinition = {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: {
            type: type as any
          }
        };

        const result = toolRegistry.validateDefinition(definition);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors?.some(e => 
          e.path === 'inputSchema.type' && 
          e.message === 'Tool input schema must have type "object" at root level'
        )).toBe(true);
      });
    });

    it('should reject definition with missing type field in validateDefinition', () => {
      const definition: ToolDefinition = {
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: {
          properties: {
            message: { type: 'string' }
          }
          // missing 'type' field - should default to undefined which is not 'object'
        }
      };

      const result = toolRegistry.validateDefinition(definition);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => 
        e.path === 'inputSchema.type' && 
        e.message === 'Tool input schema must have type "object" at root level'
      )).toBe(true);
    });

    it('should accept valid object root schema in validateDefinition', () => {
      const definition: ToolDefinition = {
        name: 'valid-object-tool',
        description: 'A test tool with valid object schema',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            count: { type: 'number' }
          },
          required: ['message']
        }
      };

      const result = toolRegistry.validateDefinition(definition);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });
  });
});