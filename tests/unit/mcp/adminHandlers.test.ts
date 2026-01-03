/**
 * Unit tests for admin tool handlers.
 * Tests dynamic tool registration, unregistration, and security enforcement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleAdminRegisterTool,
  handleAdminUnregisterTool,
  enforceAdminPolicy,
  CANONICAL_TOOL_SCHEMAS,
  ADMIN_TOOL_DEFINITIONS,
  type ToolType,
  type AdminRegisterToolRequest,
  type AdminUnregisterToolRequest
} from '../../../src/mcp/adminHandlers.js';
import { ErrorCode } from '../../../src/errors/errorHandler.js';
import type { SessionContext } from '../../../src/mcp/session.js';
import type { ToolRegistry } from '../../../src/mcp/toolRegistry.js';
import type { ServerConfig } from '../../../src/config/configManager.js';
import type { RequestContext } from '../../../src/mcp/handlers.js';

// Mock implementations
const createMockSession = (): SessionContext => ({
  connectionCorrelationId: 'test-connection-123',
  state: 'RUNNING',
  transport: { type: 'stdio' },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    redact: vi.fn(),
    sanitize: vi.fn()
  } as any
});

const createMockToolRegistry = (): ToolRegistry => ({
  register: vi.fn(),
  unregister: vi.fn().mockReturnValue(true),
  get: vi.fn(),
  list: vi.fn().mockReturnValue([]),
  validateDefinition: vi.fn().mockReturnValue({ valid: true })
});

const createMockConfig = (
  adminPolicy: ServerConfig['tools']['adminPolicy'] = { mode: 'local_stdio_only' },
  adminRegistrationEnabled = true,
  dynamicRegistrationEnabled = true
): ServerConfig => ({
  server: { name: 'test-server', version: '1.0.0', shutdownTimeoutMs: 10000 },
  tools: {
    defaultTimeoutMs: 30000,
    maxPayloadBytes: 1048576,
    maxStateBytes: 262144,
    adminRegistrationEnabled,
    adminPolicy
  },
  resources: { maxConcurrentExecutions: 10 },
  logging: { level: 'info', redactKeys: [] },
  security: { dynamicRegistrationEnabled, allowArbitraryCodeTools: false }
});

const createMockRequestContext = (transport: RequestContext['transport'] = { type: 'stdio' }): RequestContext => ({
  correlationId: 'test-correlation-123',
  runId: 'test-run-456',
  transport,
  connectionCorrelationId: 'test-connection-123',
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as any
});

describe('adminHandlers', () => {
  let mockSession: SessionContext;
  let mockToolRegistry: ToolRegistry;
  let mockConfig: ServerConfig;
  let mockRequestContext: RequestContext;

  beforeEach(() => {
    mockSession = createMockSession();
    mockToolRegistry = createMockToolRegistry();
    mockConfig = createMockConfig();
    mockRequestContext = createMockRequestContext();
    vi.clearAllMocks();
  });

  describe('CANONICAL_TOOL_SCHEMAS', () => {
    it('should define schemas for all supported tool types', () => {
      expect(CANONICAL_TOOL_SCHEMAS).toHaveProperty('echo');
      expect(CANONICAL_TOOL_SCHEMAS).toHaveProperty('health');
      expect(CANONICAL_TOOL_SCHEMAS).toHaveProperty('agentProxy');
    });

    it('should have valid JSON Schema structure for each tool type', () => {
      Object.entries(CANONICAL_TOOL_SCHEMAS).forEach(([toolType, schema]) => {
        expect(schema).toHaveProperty('type', 'object');
        expect(schema).toHaveProperty('properties');
        expect(schema).toHaveProperty('additionalProperties', false);
      });
    });

    it('should define echo schema correctly', () => {
      const echoSchema = CANONICAL_TOOL_SCHEMAS.echo;
      expect(echoSchema.properties).toHaveProperty('message');
      expect((echoSchema.properties as any).message).toEqual({ type: 'string' });
      expect(echoSchema.required).toEqual(['message']);
    });

    it('should define health schema correctly', () => {
      const healthSchema = CANONICAL_TOOL_SCHEMAS.health;
      expect(healthSchema.properties).toEqual({});
      expect(healthSchema.required).toBeUndefined();
    });

    it('should define agentProxy schema correctly', () => {
      const agentProxySchema = CANONICAL_TOOL_SCHEMAS.agentProxy;
      expect(agentProxySchema.properties).toHaveProperty('targetAgentId');
      expect(agentProxySchema.properties).toHaveProperty('message');
      expect(agentProxySchema.required).toEqual(['targetAgentId', 'message']);
    });
  });

  describe('enforceAdminPolicy', () => {
    it('should throw UNAUTHORIZED for deny_all policy', () => {
      const config = createMockConfig({ mode: 'deny_all' });
      
      expect(() => {
        enforceAdminPolicy(config.tools.adminPolicy, { type: 'stdio' });
      }).toThrow();
      
      try {
        enforceAdminPolicy(config.tools.adminPolicy, { type: 'stdio' });
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.Unauthorized);
        expect(error.message).toContain('Administrative operations are disabled');
      }
    });

    it('should allow stdio transport for local_stdio_only policy', () => {
      const config = createMockConfig({ mode: 'local_stdio_only' });
      
      expect(() => {
        enforceAdminPolicy(config.tools.adminPolicy, { type: 'stdio' });
      }).not.toThrow();
    });

    it('should reject non-stdio transport for local_stdio_only policy', () => {
      const config = createMockConfig({ mode: 'local_stdio_only' });
      
      expect(() => {
        enforceAdminPolicy(config.tools.adminPolicy, { type: 'http' });
      }).toThrow();
      
      try {
        enforceAdminPolicy(config.tools.adminPolicy, { type: 'http' });
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.Unauthorized);
        expect(error.message).toContain('only allowed via stdio transport');
      }
    });

    it('should reject token policy (not supported in v0.1)', () => {
      const config = createMockConfig({ mode: 'token', tokenEnvVar: 'ADMIN_TOKEN' });
      
      expect(() => {
        enforceAdminPolicy(config.tools.adminPolicy, { type: 'stdio' });
      }).toThrow();
      
      try {
        enforceAdminPolicy(config.tools.adminPolicy, { type: 'stdio' });
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.Unauthorized);
        expect(error.message).toContain('not supported in v0.1');
      }
    });

    it('should throw INTERNAL for unknown policy mode', () => {
      const config = createMockConfig({ mode: 'unknown' as any });
      
      expect(() => {
        enforceAdminPolicy(config.tools.adminPolicy, { type: 'stdio' });
      }).toThrow();
      
      try {
        enforceAdminPolicy(config.tools.adminPolicy, { type: 'stdio' });
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.Internal);
        expect(error.message).toContain('Unknown admin policy mode');
      }
    });
  });

  describe('handleAdminRegisterTool', () => {
    const validRequest: AdminRegisterToolRequest = {
      name: 'test-echo',
      description: 'Test echo tool',
      toolType: 'echo'
    };

    it('should successfully register a valid tool', () => {
      const result = handleAdminRegisterTool(
        validRequest,
        mockSession,
        mockToolRegistry,
        mockConfig,
        mockRequestContext
      );

      expect(result).toEqual({
        success: true,
        toolName: 'test-echo'
      });

      expect(mockToolRegistry.register).toHaveBeenCalledWith(
        {
          name: 'test-echo',
          description: 'Test echo tool',
          inputSchema: CANONICAL_TOOL_SCHEMAS.echo
        },
        expect.any(Function),
        { isDynamic: true }
      );

      expect(mockSession.logger.warn).toHaveBeenCalledWith(
        'Dynamic tool registered: test-echo (type: echo)',
        expect.objectContaining({
          toolName: 'test-echo',
          toolType: 'echo'
        })
      );
    });

    it('should register tool with version when provided', () => {
      const requestWithVersion = { ...validRequest, version: '1.2.3' };
      
      handleAdminRegisterTool(
        requestWithVersion,
        mockSession,
        mockToolRegistry,
        mockConfig,
        mockRequestContext
      );

      expect(mockToolRegistry.register).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '1.2.3'
        }),
        expect.any(Function),
        { isDynamic: true }
      );
    });

    it('should enforce admin policy', () => {
      const denyAllConfig = createMockConfig({ mode: 'deny_all' });
      
      expect(() => {
        handleAdminRegisterTool(
          validRequest,
          mockSession,
          mockToolRegistry,
          denyAllConfig,
          mockRequestContext
        );
      }).toThrow();
    });

    it('should reject unknown tool types', () => {
      const invalidRequest = {
        ...validRequest,
        toolType: 'unknown' as ToolType
      };

      expect(() => {
        handleAdminRegisterTool(
          invalidRequest,
          mockSession,
          mockToolRegistry,
          mockConfig,
          mockRequestContext
        );
      }).toThrow();
      
      try {
        handleAdminRegisterTool(
          invalidRequest,
          mockSession,
          mockToolRegistry,
          mockConfig,
          mockRequestContext
        );
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.InvalidArgument);
        expect(error.message).toContain('Unknown toolType');
      }
    });

    it('should accept matching canonical schema', () => {
      const requestWithSchema = {
        ...validRequest,
        inputSchema: CANONICAL_TOOL_SCHEMAS.echo
      };

      const result = handleAdminRegisterTool(
        requestWithSchema,
        mockSession,
        mockToolRegistry,
        mockConfig,
        mockRequestContext
      );

      expect(result.success).toBe(true);
    });

    it('should reject non-matching schema', () => {
      const requestWithBadSchema = {
        ...validRequest,
        inputSchema: {
          type: 'object',
          properties: {
            wrongField: { type: 'string' }
          },
          required: ['wrongField'],
          additionalProperties: false
        }
      };

      expect(() => {
        handleAdminRegisterTool(
          requestWithBadSchema,
          mockSession,
          mockToolRegistry,
          mockConfig,
          mockRequestContext
        );
      }).toThrow();
      
      try {
        handleAdminRegisterTool(
          requestWithBadSchema,
          mockSession,
          mockToolRegistry,
          mockConfig,
          mockRequestContext
        );
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.InvalidArgument);
        expect(error.message).toContain('does not match canonical schema');
      }
    });

    it('should test all tool types', () => {
      const toolTypes: ToolType[] = ['echo', 'health', 'agentProxy'];
      
      for (const toolType of toolTypes) {
        const request = {
          name: `test-${toolType}`,
          description: `Test ${toolType} tool`,
          toolType
        };
        
        const result = handleAdminRegisterTool(
          request,
          mockSession,
          mockToolRegistry,
          mockConfig,
          mockRequestContext
        );
        
        expect(result.success).toBe(true);
        expect(result.toolName).toBe(`test-${toolType}`);
      }
    });
  });

  describe('handleAdminUnregisterTool', () => {
    const validRequest: AdminUnregisterToolRequest = {
      name: 'test-tool'
    };

    it('should successfully unregister an existing tool', () => {
      vi.mocked(mockToolRegistry.unregister).mockReturnValue(true);
      
      const result = handleAdminUnregisterTool(
        validRequest,
        mockSession,
        mockToolRegistry,
        mockConfig,
        mockRequestContext
      );

      expect(result).toEqual({
        success: true,
        found: true,
        toolName: 'test-tool'
      });

      expect(mockToolRegistry.unregister).toHaveBeenCalledWith('test-tool');
      expect(mockSession.logger.warn).toHaveBeenCalledWith(
        'Tool unregistered: test-tool',
        expect.objectContaining({
          toolName: 'test-tool',
          found: true
        })
      );
    });

    it('should handle unregistering non-existent tool', () => {
      vi.mocked(mockToolRegistry.unregister).mockReturnValue(false);
      
      const result = handleAdminUnregisterTool(
        validRequest,
        mockSession,
        mockToolRegistry,
        mockConfig,
        mockRequestContext
      );

      expect(result).toEqual({
        success: true,
        found: false,
        toolName: 'test-tool'
      });

      expect(mockSession.logger.warn).toHaveBeenCalledWith(
        'Tool unregistered: test-tool',
        expect.objectContaining({
          found: false
        })
      );
    });

    it('should enforce admin policy', () => {
      const denyAllConfig = createMockConfig({ mode: 'deny_all' });
      
      expect(() => {
        handleAdminUnregisterTool(
          validRequest,
          mockSession,
          mockToolRegistry,
          denyAllConfig,
          mockRequestContext
        );
      }).toThrow();
    });
  });

  describe('ADMIN_TOOL_DEFINITIONS', () => {
    it('should define admin/registerTool and admin/unregisterTool', () => {
      expect(ADMIN_TOOL_DEFINITIONS).toHaveLength(2);
      
      const toolNames = ADMIN_TOOL_DEFINITIONS.map(def => def.name);
      expect(toolNames).toContain('admin/registerTool');
      expect(toolNames).toContain('admin/unregisterTool');
    });

    it('should have valid schemas for admin tools', () => {
      ADMIN_TOOL_DEFINITIONS.forEach(toolDef => {
        expect(toolDef.inputSchema).toHaveProperty('type', 'object');
        expect(toolDef.inputSchema).toHaveProperty('properties');
        expect(toolDef.inputSchema).toHaveProperty('required');
        expect(toolDef.inputSchema).toHaveProperty('additionalProperties', false);
      });
    });

    it('should define registerTool schema correctly', () => {
      const registerTool = ADMIN_TOOL_DEFINITIONS.find(def => def.name === 'admin/registerTool');
      expect(registerTool).toBeDefined();
      
      const schema = registerTool!.inputSchema;
      expect(schema.properties).toHaveProperty('name');
      expect(schema.properties).toHaveProperty('description');
      expect(schema.properties).toHaveProperty('toolType');
      expect(schema.required).toEqual(['name', 'description', 'toolType']);
      
      // Check toolType enum
      const toolTypeProperty = (schema.properties as any).toolType;
      expect(toolTypeProperty.enum).toEqual(['echo', 'health', 'agentProxy']);
    });

    it('should define unregisterTool schema correctly', () => {
      const unregisterTool = ADMIN_TOOL_DEFINITIONS.find(def => def.name === 'admin/unregisterTool');
      expect(unregisterTool).toBeDefined();
      
      const schema = unregisterTool!.inputSchema;
      expect(schema.properties).toHaveProperty('name');
      expect(schema.required).toEqual(['name']);
    });
  });

  describe('Tool handlers integration', () => {
    it('should execute echo tool handler correctly', () => {
      const request: AdminRegisterToolRequest = {
        name: 'test-echo',
        description: 'Test echo tool',
        toolType: 'echo'
      };

      handleAdminRegisterTool(
        request,
        mockSession,
        mockToolRegistry,
        mockConfig,
        mockRequestContext
      );

      // Get the registered handler
      const registerCall = vi.mocked(mockToolRegistry.register).mock.calls[0];
      const handler = registerCall[1];

      // Test the handler
      const result = handler({ message: 'test message' }, {});
      expect(result).resolves.toHaveProperty('echo', 'test message');
      expect(result).resolves.toHaveProperty('timestamp');
    });

    it('should execute health tool handler correctly', () => {
      const request: AdminRegisterToolRequest = {
        name: 'test-health',
        description: 'Test health tool',
        toolType: 'health'
      };

      handleAdminRegisterTool(
        request,
        mockSession,
        mockToolRegistry,
        mockConfig,
        mockRequestContext
      );

      // Get the registered handler
      const registerCall = vi.mocked(mockToolRegistry.register).mock.calls[0];
      const handler = registerCall[1];

      // Test the handler
      const result = handler({}, {});
      expect(result).resolves.toHaveProperty('status', 'healthy');
      expect(result).resolves.toHaveProperty('timestamp');
    });

    it('should execute agentProxy tool handler correctly', () => {
      const request: AdminRegisterToolRequest = {
        name: 'test-agent-proxy',
        description: 'Test agent proxy tool',
        toolType: 'agentProxy'
      };

      handleAdminRegisterTool(
        request,
        mockSession,
        mockToolRegistry,
        mockConfig,
        mockRequestContext
      );

      // Get the registered handler
      const registerCall = vi.mocked(mockToolRegistry.register).mock.calls[0];
      const handler = registerCall[1];

      // Test the handler
      const args = {
        targetAgentId: 'test-agent',
        message: { type: 'test', payload: { data: 'test' } }
      };
      
      const result = handler(args, {});
      expect(result).resolves.toHaveProperty('targetAgentId', 'test-agent');
      expect(result).resolves.toHaveProperty('messageType', 'test');
      expect(result).resolves.toHaveProperty('status', 'forwarded');
      expect(result).resolves.toHaveProperty('timestamp');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty tool name', async () => {
      const request = {
        name: '',
        description: 'Test tool',
        toolType: 'echo' as ToolType
      };

      // This should be caught by the input schema validation in the actual MCP call
      // But we can test that our handler would work if it got through
      const result = await handleAdminRegisterTool(
        request,
        mockSession,
        mockToolRegistry,
        mockConfig,
        mockRequestContext
      );
      expect(result).toBeDefined();
    });

    it('should handle registry registration failure', () => {
      vi.mocked(mockToolRegistry.register).mockImplementation(() => {
        throw new Error('Registration failed');
      });

      expect(() => {
        handleAdminRegisterTool(
          {
            name: 'test-tool',
            description: 'Test tool',
            toolType: 'echo'
          },
          mockSession,
          mockToolRegistry,
          mockConfig,
          mockRequestContext
        );
      }).toThrow('Registration failed');
    });

    it('should handle different transport types in request context', () => {
      const httpContext = createMockRequestContext({ type: 'http' });
      const sseContext = createMockRequestContext({ type: 'sse' });

      // Should work with local_stdio_only policy and stdio transport
      const result = handleAdminRegisterTool(
        {
          name: 'test-tool',
          description: 'Test tool',
          toolType: 'echo'
        },
        mockSession,
        mockToolRegistry,
        mockConfig,
        mockRequestContext // stdio transport
      );
      expect(result).toBeDefined();

      // Should fail with local_stdio_only policy and non-stdio transport
      expect(() => {
        handleAdminRegisterTool(
          {
            name: 'test-tool',
            description: 'Test tool',
            toolType: 'echo'
          },
          mockSession,
          mockToolRegistry,
          mockConfig,
          httpContext
        );
      }).toThrow();

      expect(() => {
        handleAdminRegisterTool(
          {
            name: 'test-tool',
            description: 'Test tool',
            toolType: 'echo'
          },
          mockSession,
          mockToolRegistry,
          mockConfig,
          sseContext
        );
      }).toThrow();
    });
  });
});