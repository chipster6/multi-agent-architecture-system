import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConfigManagerImpl,
  createConfigManager,
  type ServerConfig,
  type AdminPolicy,
  type ValidationResult,
} from '../../../src/config/configManager';

describe('ConfigManager', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('createConfigManager()', () => {
    it('should create a ConfigManager instance', () => {
      const manager = createConfigManager();
      expect(manager).toBeDefined();
      expect(typeof manager.load).toBe('function');
      expect(typeof manager.validate).toBe('function');
      expect(typeof manager.get).toBe('function');
      expect(typeof manager.isDynamicRegistrationEffective).toBe('function');
    });
  });

  describe('Default Configuration', () => {
    it('should load default configuration when no env vars or config file', () => {
      // Clear all MCP-related env vars
      Object.keys(process.env).forEach(key => {
        if (key.startsWith('MCP_')) {
          delete process.env[key];
        }
      });

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      expect(config.server.name).toBe('foundation-mcp-runtime');
      expect(config.server.version).toBe('0.1.0');
      expect(config.server.shutdownTimeoutMs).toBe(10000);
      expect(config.tools.defaultTimeoutMs).toBe(30000);
      expect(config.tools.maxPayloadBytes).toBe(1048576);
      expect(config.tools.maxStateBytes).toBe(262144);
      expect(config.tools.adminRegistrationEnabled).toBe(false);
      expect(config.tools.adminPolicy.mode).toBe('deny_all');
      expect(config.resources.maxConcurrentExecutions).toBe(10);
      expect(config.logging.level).toBe('info');
      expect(config.logging.redactKeys).toEqual([
        'token', 'key', 'secret', 'password', 'apiKey',
        'authorization', 'bearer', 'session', 'cookie'
      ]);
      expect(config.security.dynamicRegistrationEnabled).toBe(false);
      expect(config.security.allowArbitraryCodeTools).toBe(false);
      expect(config.aacp?.defaultTtlMs).toBe(86400000);
    });

    it('should have all required default values', () => {
      const manager = new ConfigManagerImpl();
      const config = manager.load();

      // Verify all required fields are present
      expect(config.server).toBeDefined();
      expect(config.tools).toBeDefined();
      expect(config.resources).toBeDefined();
      expect(config.logging).toBeDefined();
      expect(config.security).toBeDefined();
      expect(config.aacp).toBeDefined();

      // Verify specific defaults match requirements
      expect(config.tools.defaultTimeoutMs).toBe(30000);
      expect(config.tools.maxPayloadBytes).toBe(1048576);
      expect(config.resources.maxConcurrentExecutions).toBe(10);
    });
  });

  describe('Environment Variable Precedence', () => {
    it('should override server config with environment variables', () => {
      process.env['MCP_SERVER_NAME'] = 'custom-server';
      process.env['MCP_SERVER_VERSION'] = '2.0.0';
      process.env['MCP_SERVER_SHUTDOWN_TIMEOUT_MS'] = '15000';

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      expect(config.server.name).toBe('custom-server');
      expect(config.server.version).toBe('2.0.0');
      expect(config.server.shutdownTimeoutMs).toBe(15000);
    });

    it('should override tools config with environment variables', () => {
      process.env['MCP_TOOLS_DEFAULT_TIMEOUT_MS'] = '45000';
      process.env['MCP_TOOLS_MAX_PAYLOAD_BYTES'] = '2097152';
      process.env['MCP_TOOLS_MAX_STATE_BYTES'] = '524288';
      process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'true';
      process.env['MCP_TOOLS_ADMIN_POLICY_MODE'] = 'local_stdio_only';
      process.env['MCP_TOOLS_ADMIN_POLICY_TOKEN_ENV_VAR'] = 'CUSTOM_TOKEN';

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      expect(config.tools.defaultTimeoutMs).toBe(45000);
      expect(config.tools.maxPayloadBytes).toBe(2097152);
      expect(config.tools.maxStateBytes).toBe(524288);
      expect(config.tools.adminRegistrationEnabled).toBe(true);
      expect(config.tools.adminPolicy.mode).toBe('local_stdio_only');
      expect(config.tools.adminPolicy.tokenEnvVar).toBe('CUSTOM_TOKEN');
    });

    it('should override resources config with environment variables', () => {
      process.env['MCP_RESOURCES_MAX_CONCURRENT_EXECUTIONS'] = '20';

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      expect(config.resources.maxConcurrentExecutions).toBe(20);
    });

    it('should override logging config with environment variables', () => {
      process.env['MCP_LOGGING_LEVEL'] = 'debug';
      process.env['MCP_LOGGING_REDACT_KEYS'] = 'custom1,custom2,custom3';

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      expect(config.logging.level).toBe('debug');
      expect(config.logging.redactKeys).toEqual(['custom1', 'custom2', 'custom3']);
    });

    it('should override security config with environment variables', () => {
      process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'true';
      process.env['MCP_SECURITY_ALLOW_ARBITRARY_CODE_TOOLS'] = 'true';

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      expect(config.security.dynamicRegistrationEnabled).toBe(true);
      expect(config.security.allowArbitraryCodeTools).toBe(true);
    });

    it('should override AACP config with environment variables', () => {
      process.env['MCP_AACP_DEFAULT_TTL_MS'] = '172800000'; // 48 hours

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      expect(config.aacp?.defaultTtlMs).toBe(172800000);
    });

    it('should ignore invalid numeric environment variables', () => {
      process.env['MCP_TOOLS_DEFAULT_TIMEOUT_MS'] = 'invalid';
      process.env['MCP_RESOURCES_MAX_CONCURRENT_EXECUTIONS'] = 'not-a-number';

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      // Should fall back to defaults
      expect(config.tools.defaultTimeoutMs).toBe(30000);
      expect(config.resources.maxConcurrentExecutions).toBe(10);
    });

    it('should ignore invalid boolean environment variables', () => {
      process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'maybe';
      process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'yes';

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      // Should fall back to defaults (false)
      expect(config.tools.adminRegistrationEnabled).toBe(false);
      expect(config.security.dynamicRegistrationEnabled).toBe(false);
    });

    it('should ignore invalid enum environment variables', () => {
      process.env['MCP_LOGGING_LEVEL'] = 'verbose';
      process.env['MCP_TOOLS_ADMIN_POLICY_MODE'] = 'allow_all';

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      // Should fall back to defaults
      expect(config.logging.level).toBe('info');
      expect(config.tools.adminPolicy.mode).toBe('deny_all');
    });
  });

  describe('Configuration Validation', () => {
    let manager: ConfigManagerImpl;

    beforeEach(() => {
      manager = new ConfigManagerImpl();
    });

    it('should validate valid configuration', () => {
      const validConfig: ServerConfig = {
        server: {
          name: 'test-server',
          version: '1.0.0',
          shutdownTimeoutMs: 5000,
        },
        tools: {
          defaultTimeoutMs: 30000,
          maxPayloadBytes: 1048576,
          maxStateBytes: 262144,
          adminRegistrationEnabled: true,
          adminPolicy: { mode: 'local_stdio_only' },
        },
        resources: {
          maxConcurrentExecutions: 5,
        },
        logging: {
          level: 'warn',
          redactKeys: ['password', 'token'],
        },
        security: {
          dynamicRegistrationEnabled: true,
          allowArbitraryCodeTools: false,
        },
        aacp: {
          defaultTtlMs: 3600000,
        },
      };

      const result = manager.validate(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should fail validation with descriptive errors for invalid server config', () => {
      const invalidConfig = {
        server: {
          name: '',
          version: '',
          shutdownTimeoutMs: -1,
        },
      };

      const result = manager.validate(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors?.[0]).toEqual({
        path: 'server.name',
        message: 'Must be a non-empty string',
      });
      expect(result.errors?.[1]).toEqual({
        path: 'server.version',
        message: 'Must be a non-empty string',
      });
      expect(result.errors?.[2]).toEqual({
        path: 'server.shutdownTimeoutMs',
        message: 'Must be a positive number',
      });
    });

    it('should fail validation with descriptive errors for invalid tools config', () => {
      const invalidConfig = {
        tools: {
          defaultTimeoutMs: 0,
          maxPayloadBytes: -1,
          maxStateBytes: 0,
          adminRegistrationEnabled: 'yes' as any,
          adminPolicy: { mode: 'invalid_mode' as any },
        },
      };

      const result = manager.validate(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
      
      const errorPaths = result.errors?.map(e => e.path) ?? [];
      expect(errorPaths).toContain('tools.defaultTimeoutMs');
      expect(errorPaths).toContain('tools.maxPayloadBytes');
      expect(errorPaths).toContain('tools.maxStateBytes');
      expect(errorPaths).toContain('tools.adminRegistrationEnabled');
      expect(errorPaths).toContain('tools.adminPolicy.mode');
    });

    it('should fail validation with descriptive errors for invalid resources config', () => {
      const invalidConfig = {
        resources: {
          maxConcurrentExecutions: 0,
        },
      };

      const result = manager.validate(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toEqual({
        path: 'resources.maxConcurrentExecutions',
        message: 'Must be a positive number',
      });
    });

    it('should fail validation with descriptive errors for invalid logging config', () => {
      const invalidConfig = {
        logging: {
          level: 'verbose' as any,
          redactKeys: 'not-an-array' as any,
        },
      };

      const result = manager.validate(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
      
      const errorPaths = result.errors?.map(e => e.path) ?? [];
      expect(errorPaths).toContain('logging.level');
      expect(errorPaths).toContain('logging.redactKeys');
    });

    it('should fail validation for redactKeys with non-string elements', () => {
      const invalidConfig = {
        logging: {
          level: 'info' as const,
          redactKeys: ['valid', 123, null] as any,
        },
      };

      const result = manager.validate(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => 
        e.path === 'logging.redactKeys' && 
        e.message === 'All elements must be strings'
      )).toBe(true);
    });

    it('should fail validation with descriptive errors for invalid security config', () => {
      const invalidConfig = {
        security: {
          dynamicRegistrationEnabled: 'true' as any,
          allowArbitraryCodeTools: 'false' as any,
        },
      };

      const result = manager.validate(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
      
      const errorPaths = result.errors?.map(e => e.path) ?? [];
      expect(errorPaths).toContain('security.dynamicRegistrationEnabled');
      expect(errorPaths).toContain('security.allowArbitraryCodeTools');
    });

    it('should fail validation with descriptive errors for invalid AACP config', () => {
      const invalidConfig = {
        aacp: {
          defaultTtlMs: -1,
        },
      };

      const result = manager.validate(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toEqual({
        path: 'aacp.defaultTtlMs',
        message: 'Must be a positive number',
      });
    });

    it('should validate partial configuration objects', () => {
      const partialConfig = {
        tools: {
          defaultTimeoutMs: 45000,
          maxPayloadBytes: 2097152,
          maxStateBytes: 524288,
          adminRegistrationEnabled: true,
          adminPolicy: { mode: 'token' as const },
        },
      };

      const result = manager.validate(partialConfig);
      expect(result.valid).toBe(true);
    });
  });

  describe('Fail-Fast Behavior', () => {
    it('should throw error on invalid configuration during load', () => {
      // Set invalid environment variable
      process.env['MCP_LOGGING_LEVEL'] = 'invalid-level';
      
      // Mock the validation to return invalid
      const mockValidate = vi.fn().mockReturnValue({
        valid: false,
        errors: [{ path: 'logging.level', message: 'Invalid level' }],
      });

      // Create a spy on the prototype method
      const validateSpy = vi.spyOn(ConfigManagerImpl.prototype, 'validate');
      validateSpy.mockImplementation(mockValidate);

      expect(() => {
        new ConfigManagerImpl();
      }).toThrow('Invalid configuration: logging.level: Invalid level');

      validateSpy.mockRestore();
    });

    it('should provide descriptive error messages on validation failure', () => {
      process.env['MCP_TOOLS_DEFAULT_TIMEOUT_MS'] = '-1';
      process.env['MCP_RESOURCES_MAX_CONCURRENT_EXECUTIONS'] = '0';

      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration:/);
    });
  });

  describe('get() method', () => {
    let manager: ConfigManagerImpl;

    beforeEach(() => {
      manager = new ConfigManagerImpl();
    });

    it('should return server configuration', () => {
      const serverConfig = manager.get('server');
      expect(serverConfig).toBeDefined();
      expect(serverConfig.name).toBe('foundation-mcp-runtime');
      expect(serverConfig.version).toBe('0.1.0');
    });

    it('should return tools configuration', () => {
      const toolsConfig = manager.get('tools');
      expect(toolsConfig).toBeDefined();
      expect(toolsConfig.defaultTimeoutMs).toBe(30000);
      expect(toolsConfig.maxPayloadBytes).toBe(1048576);
    });

    it('should return resources configuration', () => {
      const resourcesConfig = manager.get('resources');
      expect(resourcesConfig).toBeDefined();
      expect(resourcesConfig.maxConcurrentExecutions).toBe(10);
    });

    it('should return logging configuration', () => {
      const loggingConfig = manager.get('logging');
      expect(loggingConfig).toBeDefined();
      expect(loggingConfig.level).toBe('info');
      expect(Array.isArray(loggingConfig.redactKeys)).toBe(true);
    });

    it('should return security configuration', () => {
      const securityConfig = manager.get('security');
      expect(securityConfig).toBeDefined();
      expect(securityConfig.dynamicRegistrationEnabled).toBe(false);
      expect(securityConfig.allowArbitraryCodeTools).toBe(false);
    });

    it('should return AACP configuration', () => {
      const aacpConfig = manager.get('aacp');
      expect(aacpConfig).toBeDefined();
      expect(aacpConfig?.defaultTtlMs).toBe(86400000);
    });
  });

  describe('isDynamicRegistrationEffective()', () => {
    it('should return true when BOTH flags are true', () => {
      process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'true';
      process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'true';

      const manager = new ConfigManagerImpl();
      expect(manager.isDynamicRegistrationEffective()).toBe(true);
    });

    it('should return false when adminRegistrationEnabled is false', () => {
      process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'false';
      process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'true';

      const manager = new ConfigManagerImpl();
      expect(manager.isDynamicRegistrationEffective()).toBe(false);
    });

    it('should return false when dynamicRegistrationEnabled is false', () => {
      process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'true';
      process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'false';

      const manager = new ConfigManagerImpl();
      expect(manager.isDynamicRegistrationEffective()).toBe(false);
    });

    it('should return false when both flags are false', () => {
      process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'false';
      process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'false';

      const manager = new ConfigManagerImpl();
      expect(manager.isDynamicRegistrationEffective()).toBe(false);
    });

    it('should return false by default (both flags default to false)', () => {
      // Clear environment variables to use defaults
      Object.keys(process.env).forEach(key => {
        if (key.startsWith('MCP_')) {
          delete process.env[key];
        }
      });

      const manager = new ConfigManagerImpl();
      expect(manager.isDynamicRegistrationEffective()).toBe(false);
    });
  });

  describe('Admin Policy Configuration', () => {
    it('should support deny_all admin policy mode', () => {
      process.env['MCP_TOOLS_ADMIN_POLICY_MODE'] = 'deny_all';

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      expect(config.tools.adminPolicy.mode).toBe('deny_all');
    });

    it('should support local_stdio_only admin policy mode', () => {
      process.env['MCP_TOOLS_ADMIN_POLICY_MODE'] = 'local_stdio_only';

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      expect(config.tools.adminPolicy.mode).toBe('local_stdio_only');
    });

    it('should support token admin policy mode', () => {
      process.env['MCP_TOOLS_ADMIN_POLICY_MODE'] = 'token';
      process.env['MCP_TOOLS_ADMIN_POLICY_TOKEN_ENV_VAR'] = 'AUTH_TOKEN';

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      expect(config.tools.adminPolicy.mode).toBe('token');
      expect(config.tools.adminPolicy.tokenEnvVar).toBe('AUTH_TOKEN');
    });

    it('should validate admin policy mode values', () => {
      const invalidConfig = {
        tools: {
          defaultTimeoutMs: 30000,
          maxPayloadBytes: 1048576,
          maxStateBytes: 262144,
          adminRegistrationEnabled: true,
          adminPolicy: { mode: 'invalid_mode' as any },
        },
      };

      const manager = new ConfigManagerImpl();
      const result = manager.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => 
        e.path === 'tools.adminPolicy.mode' && 
        e.message.includes('deny_all, local_stdio_only, token')
      )).toBe(true);
    });
  });

  describe('Configuration Precedence Integration', () => {
    it('should demonstrate complete precedence: env vars > defaults', () => {
      // Set environment variables that override defaults
      process.env['MCP_SERVER_NAME'] = 'env-override-server';
      process.env['MCP_TOOLS_DEFAULT_TIMEOUT_MS'] = '60000';
      process.env['MCP_LOGGING_LEVEL'] = 'debug';

      const manager = new ConfigManagerImpl();
      const config = manager.load();

      // Environment variables should override defaults
      expect(config.server.name).toBe('env-override-server');
      expect(config.tools.defaultTimeoutMs).toBe(60000);
      expect(config.logging.level).toBe('debug');

      // Non-overridden values should remain as defaults
      expect(config.server.version).toBe('0.1.0');
      expect(config.resources.maxConcurrentExecutions).toBe(10);
    });
  });
});