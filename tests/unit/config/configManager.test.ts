/**
 * Unit tests for ConfigManager
 * Tests configuration loading with precedence: env vars > config file > defaults
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigManagerImpl, type ServerConfig } from '../../../src/config/configManager.js';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('ConfigManager', () => {
  let originalEnv: NodeJS.ProcessEnv;
  const mockFs = fs as any;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear environment variables that might affect tests
    const envVarsToDelete = [
      'MCP_CONFIG_FILE',
      'MCP_SERVER_NAME',
      'MCP_SERVER_VERSION',
      'MCP_SERVER_SHUTDOWN_TIMEOUT_MS',
      'MCP_TOOLS_DEFAULT_TIMEOUT_MS',
      'MCP_TOOLS_MAX_PAYLOAD_BYTES',
      'MCP_TOOLS_MAX_STATE_BYTES',
      'MCP_TOOLS_ADMIN_REGISTRATION_ENABLED',
      'MCP_TOOLS_ADMIN_POLICY_MODE',
      'MCP_TOOLS_ADMIN_POLICY_TOKEN_ENV_VAR',
      'MCP_RESOURCES_MAX_CONCURRENT_EXECUTIONS',
      'MCP_LOGGING_LEVEL',
      'MCP_LOGGING_REDACT_KEYS',
      'MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED',
      'MCP_SECURITY_ALLOW_ARBITRARY_CODE_TOOLS',
      'MCP_AACP_DEFAULT_TTL_MS',
    ];
    
    envVarsToDelete.forEach(key => {
      delete process.env[key];
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('env var precedence over config file', () => {
    it('should use environment variable when both env var and config file are present', () => {
      // Setup: config file exists with one value
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: {
          name: 'config-file-name',
          version: 'config-file-version',
        },
        tools: {
          defaultTimeoutMs: 20000,
          adminRegistrationEnabled: true,
        },
        logging: {
          level: 'debug',
        },
      }));

      // Setup: environment variables override some values
      process.env['MCP_SERVER_NAME'] = 'env-var-name';
      process.env['MCP_TOOLS_DEFAULT_TIMEOUT_MS'] = '25000';
      process.env['MCP_LOGGING_LEVEL'] = 'error';

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: env vars take precedence
      expect(config.server.name).toBe('env-var-name'); // env var wins
      expect(config.server.version).toBe('config-file-version'); // config file value (no env var)
      expect(config.tools.defaultTimeoutMs).toBe(25000); // env var wins
      expect(config.tools.adminRegistrationEnabled).toBe(true); // config file value (no env var)
      expect(config.logging.level).toBe('error'); // env var wins
    });

    it('should use environment variable for boolean values', () => {
      // Setup: config file with boolean values
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        tools: {
          adminRegistrationEnabled: true,
        },
        security: {
          dynamicRegistrationEnabled: true,
          allowArbitraryCodeTools: true,
        },
      }));

      // Setup: environment variables override boolean values
      process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'false';
      process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'false';
      process.env['MCP_SECURITY_ALLOW_ARBITRARY_CODE_TOOLS'] = 'false';

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: env vars take precedence for boolean values
      expect(config.tools.adminRegistrationEnabled).toBe(false);
      expect(config.security.dynamicRegistrationEnabled).toBe(false);
      expect(config.security.allowArbitraryCodeTools).toBe(false);
    });

    it('should use environment variable for numeric values', () => {
      // Setup: config file with numeric values
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: {
          shutdownTimeoutMs: 5000,
        },
        tools: {
          defaultTimeoutMs: 15000,
          maxPayloadBytes: 512000,
          maxStateBytes: 128000,
        },
        resources: {
          maxConcurrentExecutions: 5,
        },
        aacp: {
          defaultTtlMs: 43200000,
        },
      }));

      // Setup: environment variables override numeric values
      process.env['MCP_SERVER_SHUTDOWN_TIMEOUT_MS'] = '12000';
      process.env['MCP_TOOLS_DEFAULT_TIMEOUT_MS'] = '35000';
      process.env['MCP_TOOLS_MAX_PAYLOAD_BYTES'] = '2097152';
      process.env['MCP_TOOLS_MAX_STATE_BYTES'] = '524288';
      process.env['MCP_RESOURCES_MAX_CONCURRENT_EXECUTIONS'] = '20';
      process.env['MCP_AACP_DEFAULT_TTL_MS'] = '172800000';

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: env vars take precedence for numeric values
      expect(config.server.shutdownTimeoutMs).toBe(12000);
      expect(config.tools.defaultTimeoutMs).toBe(35000);
      expect(config.tools.maxPayloadBytes).toBe(2097152);
      expect(config.tools.maxStateBytes).toBe(524288);
      expect(config.resources.maxConcurrentExecutions).toBe(20);
      expect(config.aacp?.defaultTtlMs).toBe(172800000);
    });

    it('should use environment variable for admin policy values', () => {
      // Setup: config file with admin policy
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        tools: {
          adminPolicy: {
            mode: 'local_stdio_only',
            tokenEnvVar: 'CONFIG_TOKEN',
          },
        },
      }));

      // Setup: environment variables override admin policy
      process.env['MCP_TOOLS_ADMIN_POLICY_MODE'] = 'token';
      process.env['MCP_TOOLS_ADMIN_POLICY_TOKEN_ENV_VAR'] = 'ENV_TOKEN';

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: env vars take precedence for admin policy
      expect(config.tools.adminPolicy.mode).toBe('token');
      expect(config.tools.adminPolicy.tokenEnvVar).toBe('ENV_TOKEN');
    });

    it('should use environment variable for array values', () => {
      // Setup: config file with array values
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        logging: {
          redactKeys: ['config-key1', 'config-key2'],
        },
      }));

      // Setup: environment variable overrides array value
      process.env['MCP_LOGGING_REDACT_KEYS'] = 'env-key1,env-key2,env-key3';

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: env var takes precedence for array values
      expect(config.logging.redactKeys).toEqual(['env-key1', 'env-key2', 'env-key3']);
    });

    it('should handle partial environment variable overrides', () => {
      // Setup: config file with multiple values
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: {
          name: 'config-name',
          version: 'config-version',
          shutdownTimeoutMs: 8000,
        },
        tools: {
          defaultTimeoutMs: 20000,
          maxPayloadBytes: 1000000,
        },
      }));

      // Setup: environment variable overrides only some values
      process.env['MCP_SERVER_NAME'] = 'env-name';
      process.env['MCP_TOOLS_MAX_PAYLOAD_BYTES'] = '2000000';

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: mix of env vars and config file values
      expect(config.server.name).toBe('env-name'); // env var
      expect(config.server.version).toBe('config-version'); // config file
      expect(config.server.shutdownTimeoutMs).toBe(8000); // config file
      expect(config.tools.defaultTimeoutMs).toBe(20000); // config file
      expect(config.tools.maxPayloadBytes).toBe(2000000); // env var
    });

    it('should ignore invalid environment variable values and use config file values', () => {
      // Setup: config file with valid values
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: {
          shutdownTimeoutMs: 8000,
        },
        tools: {
          defaultTimeoutMs: 20000,
        },
      }));

      // Setup: environment variables with invalid numeric values
      process.env['MCP_SERVER_SHUTDOWN_TIMEOUT_MS'] = 'not-a-number';
      process.env['MCP_TOOLS_DEFAULT_TIMEOUT_MS'] = 'invalid';

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: invalid env vars ignored, config file values used
      expect(config.server.shutdownTimeoutMs).toBe(8000);
      expect(config.tools.defaultTimeoutMs).toBe(20000);
    });

    it('should use environment variables when config file does not exist', () => {
      // Setup: no config file
      mockFs.existsSync.mockReturnValue(false);

      // Setup: environment variables
      process.env['MCP_SERVER_NAME'] = 'env-only-name';
      process.env['MCP_TOOLS_DEFAULT_TIMEOUT_MS'] = '45000';

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: env vars override defaults (no config file)
      expect(config.server.name).toBe('env-only-name');
      expect(config.tools.defaultTimeoutMs).toBe(45000);
      // Other values should be defaults
      expect(config.server.version).toBe('0.1.0'); // default
      expect(config.tools.maxPayloadBytes).toBe(1048576); // default
    });
  });

  describe('config file precedence over defaults', () => {
    it('should use config file values when no environment variables are set', () => {
      // Setup: config file exists
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: {
          name: 'config-file-name',
          version: 'config-file-version',
        },
        tools: {
          defaultTimeoutMs: 25000,
          adminRegistrationEnabled: true,
        },
      }));

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: config file values override defaults
      expect(config.server.name).toBe('config-file-name');
      expect(config.server.version).toBe('config-file-version');
      expect(config.tools.defaultTimeoutMs).toBe(25000);
      expect(config.tools.adminRegistrationEnabled).toBe(true);
      // Values not in config file should use defaults
      expect(config.tools.maxPayloadBytes).toBe(1048576); // default
      expect(config.resources.maxConcurrentExecutions).toBe(10); // default
    });

    it('should use config file values for all server configuration options', () => {
      // Setup: config file with all server options
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: {
          name: 'custom-server-name',
          version: '2.0.0',
          shutdownTimeoutMs: 15000,
        },
      }));

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: all server config values from file
      expect(config.server.name).toBe('custom-server-name');
      expect(config.server.version).toBe('2.0.0');
      expect(config.server.shutdownTimeoutMs).toBe(15000);
      // Other sections should use defaults
      expect(config.tools.defaultTimeoutMs).toBe(30000); // default
      expect(config.logging.level).toBe('info'); // default
    });

    it('should use config file values for all tools configuration options', () => {
      // Setup: config file with all tools options
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        tools: {
          defaultTimeoutMs: 45000,
          maxPayloadBytes: 2097152,
          maxStateBytes: 524288,
          adminRegistrationEnabled: true,
          adminPolicy: {
            mode: 'local_stdio_only',
            tokenEnvVar: 'CUSTOM_TOKEN',
          },
        },
      }));

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: all tools config values from file
      expect(config.tools.defaultTimeoutMs).toBe(45000);
      expect(config.tools.maxPayloadBytes).toBe(2097152);
      expect(config.tools.maxStateBytes).toBe(524288);
      expect(config.tools.adminRegistrationEnabled).toBe(true);
      expect(config.tools.adminPolicy.mode).toBe('local_stdio_only');
      expect(config.tools.adminPolicy.tokenEnvVar).toBe('CUSTOM_TOKEN');
      // Other sections should use defaults
      expect(config.server.name).toBe('foundation-mcp-runtime'); // default
      expect(config.resources.maxConcurrentExecutions).toBe(10); // default
    });

    it('should use config file values for resources configuration', () => {
      // Setup: config file with resources options
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        resources: {
          maxConcurrentExecutions: 25,
        },
      }));

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: resources config values from file
      expect(config.resources.maxConcurrentExecutions).toBe(25);
      // Other sections should use defaults
      expect(config.server.name).toBe('foundation-mcp-runtime'); // default
      expect(config.tools.defaultTimeoutMs).toBe(30000); // default
    });

    it('should use config file values for logging configuration', () => {
      // Setup: config file with logging options
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        logging: {
          level: 'debug',
          redactKeys: ['custom-key1', 'custom-key2', 'custom-secret'],
        },
      }));

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: logging config values from file
      expect(config.logging.level).toBe('debug');
      expect(config.logging.redactKeys).toEqual(['custom-key1', 'custom-key2', 'custom-secret']);
      // Other sections should use defaults
      expect(config.server.name).toBe('foundation-mcp-runtime'); // default
      expect(config.tools.defaultTimeoutMs).toBe(30000); // default
    });

    it('should use config file values for security configuration', () => {
      // Setup: config file with security options
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        security: {
          dynamicRegistrationEnabled: true,
          allowArbitraryCodeTools: true,
        },
      }));

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: security config values from file
      expect(config.security.dynamicRegistrationEnabled).toBe(true);
      expect(config.security.allowArbitraryCodeTools).toBe(true);
      // Other sections should use defaults
      expect(config.server.name).toBe('foundation-mcp-runtime'); // default
      expect(config.tools.adminRegistrationEnabled).toBe(false); // default
    });

    it('should use config file values for AACP configuration', () => {
      // Setup: config file with AACP options
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        aacp: {
          defaultTtlMs: 172800000, // 48 hours
        },
      }));

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: AACP config values from file
      expect(config.aacp?.defaultTtlMs).toBe(172800000);
      // Other sections should use defaults
      expect(config.server.name).toBe('foundation-mcp-runtime'); // default
      expect(config.tools.defaultTimeoutMs).toBe(30000); // default
    });

    it('should use config file values for mixed configuration sections', () => {
      // Setup: config file with values from multiple sections
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: {
          name: 'mixed-config-server',
          shutdownTimeoutMs: 12000,
        },
        tools: {
          maxPayloadBytes: 3145728, // 3MB
          adminRegistrationEnabled: true,
        },
        logging: {
          level: 'warn',
        },
        security: {
          dynamicRegistrationEnabled: true,
        },
      }));

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: mixed config values from file
      expect(config.server.name).toBe('mixed-config-server');
      expect(config.server.shutdownTimeoutMs).toBe(12000);
      expect(config.tools.maxPayloadBytes).toBe(3145728);
      expect(config.tools.adminRegistrationEnabled).toBe(true);
      expect(config.logging.level).toBe('warn');
      expect(config.security.dynamicRegistrationEnabled).toBe(true);
      
      // Values not in config file should use defaults
      expect(config.server.version).toBe('0.1.0'); // default
      expect(config.tools.defaultTimeoutMs).toBe(30000); // default
      expect(config.tools.maxStateBytes).toBe(262144); // default
      expect(config.resources.maxConcurrentExecutions).toBe(10); // default
      expect(config.logging.redactKeys).toEqual([
        'token', 'key', 'secret', 'password', 'apiKey',
        'authorization', 'bearer', 'session', 'cookie'
      ]); // default
      expect(config.security.allowArbitraryCodeTools).toBe(false); // default
      expect(config.aacp?.defaultTtlMs).toBe(86400000); // default
    });

    it('should handle partial admin policy configuration from config file', () => {
      // Setup: config file with partial admin policy
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        tools: {
          adminPolicy: {
            mode: 'token',
            // tokenEnvVar not specified, should use default (undefined)
          },
        },
      }));

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: partial admin policy from file
      expect(config.tools.adminPolicy.mode).toBe('token');
      expect(config.tools.adminPolicy.tokenEnvVar).toBeUndefined();
      // Other values should use defaults
      expect(config.tools.adminRegistrationEnabled).toBe(false); // default
    });

    it('should handle empty config file and use all defaults', () => {
      // Setup: config file exists but is empty object
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({}));

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: all default values used
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
  });

  describe('validation and fail-fast behavior', () => {
    it('should fail fast with descriptive error for invalid config file values', () => {
      // Setup: config file with invalid values
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: {
          name: '', // invalid: empty string
          shutdownTimeoutMs: -1, // invalid: negative number
        },
        tools: {
          defaultTimeoutMs: 0, // invalid: zero
        },
        logging: {
          level: 'invalid-level', // invalid: not in allowed values
        },
      }));

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration:/);
    });

    it('should fail fast with descriptive error for invalid environment variable values after validation', () => {
      // Setup: no config file, but invalid env vars that pass parsing but fail validation
      mockFs.existsSync.mockReturnValue(false);
      
      // These will be parsed successfully but fail validation
      process.env['MCP_SERVER_NAME'] = ''; // empty string
      process.env['MCP_LOGGING_LEVEL'] = 'invalid-level';

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration.*server\.name.*Must be a non-empty string/);
    });

    it('should fail fast with descriptive error for invalid server configuration', () => {
      // Setup: config file with various invalid server values
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: {
          name: '', // invalid: empty string
          version: '', // invalid: empty string
          shutdownTimeoutMs: -5000, // invalid: negative number
        },
      }));

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration.*server\.name.*Must be a non-empty string.*server\.version.*Must be a non-empty string.*server\.shutdownTimeoutMs.*Must be a positive number/);
    });

    it('should fail fast with descriptive error for invalid tools configuration', () => {
      // Setup: config file with various invalid tools values
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        tools: {
          defaultTimeoutMs: 0, // invalid: zero
          maxPayloadBytes: -1000, // invalid: negative
          maxStateBytes: 0, // invalid: zero
          adminRegistrationEnabled: 'not-a-boolean', // invalid: not boolean
          adminPolicy: {
            mode: 'invalid-mode', // invalid: not in allowed values
          },
        },
      }));

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration.*tools\.defaultTimeoutMs.*Must be a positive number.*tools\.maxPayloadBytes.*Must be a positive number.*tools\.maxStateBytes.*Must be a positive number.*tools\.adminRegistrationEnabled.*Must be a boolean.*tools\.adminPolicy\.mode.*Must be one of: deny_all, local_stdio_only, token/);
    });

    it('should fail fast with descriptive error for invalid resources configuration', () => {
      // Setup: config file with invalid resources values
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        resources: {
          maxConcurrentExecutions: 0, // invalid: zero
        },
      }));

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration.*resources\.maxConcurrentExecutions.*Must be a positive number/);
    });

    it('should fail fast with descriptive error for invalid logging configuration', () => {
      // Setup: config file with invalid logging values
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        logging: {
          level: 'trace', // invalid: not in allowed values
          redactKeys: 'not-an-array', // invalid: not an array
        },
      }));

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration.*logging\.level.*Must be one of: debug, info, warn, error.*logging\.redactKeys.*Must be an array of strings/);
    });

    it('should fail fast with descriptive error for invalid redactKeys array elements', () => {
      // Setup: config file with invalid redactKeys array elements
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        logging: {
          redactKeys: ['valid-key', 123, 'another-valid-key', null], // invalid: non-string elements
        },
      }));

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration.*logging\.redactKeys.*All elements must be strings/);
    });

    it('should fail fast with descriptive error for invalid security configuration', () => {
      // Setup: config file with invalid security values
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        security: {
          dynamicRegistrationEnabled: 'yes', // invalid: not boolean
          allowArbitraryCodeTools: 1, // invalid: not boolean
        },
      }));

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration.*security\.dynamicRegistrationEnabled.*Must be a boolean.*security\.allowArbitraryCodeTools.*Must be a boolean/);
    });

    it('should fail fast with descriptive error for invalid AACP configuration', () => {
      // Setup: config file with invalid AACP values
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        aacp: {
          defaultTtlMs: -86400000, // invalid: negative number
        },
      }));

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration.*aacp\.defaultTtlMs.*Must be a positive number/);
    });

    it('should fail fast with multiple validation errors and descriptive messages', () => {
      // Setup: config file with multiple invalid values across different sections
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: {
          name: '', // invalid: empty string
          shutdownTimeoutMs: -1, // invalid: negative
        },
        tools: {
          defaultTimeoutMs: 0, // invalid: zero
          adminRegistrationEnabled: 'invalid', // invalid: not boolean
        },
        resources: {
          maxConcurrentExecutions: -5, // invalid: negative
        },
        logging: {
          level: 'verbose', // invalid: not in allowed values
        },
        security: {
          dynamicRegistrationEnabled: 'false', // invalid: string instead of boolean
        },
        aacp: {
          defaultTtlMs: 0, // invalid: zero
        },
      }));

      // Act & Assert
      const error = expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration:/);
      
      // Verify that the error contains all expected validation messages
      try {
        new ConfigManagerImpl();
      } catch (e) {
        const errorMessage = (e as Error).message;
        expect(errorMessage).toMatch(/server\.name.*Must be a non-empty string/);
        expect(errorMessage).toMatch(/server\.shutdownTimeoutMs.*Must be a positive number/);
        expect(errorMessage).toMatch(/tools\.defaultTimeoutMs.*Must be a positive number/);
        expect(errorMessage).toMatch(/tools\.adminRegistrationEnabled.*Must be a boolean/);
        expect(errorMessage).toMatch(/resources\.maxConcurrentExecutions.*Must be a positive number/);
        expect(errorMessage).toMatch(/logging\.level.*Must be one of: debug, info, warn, error/);
        expect(errorMessage).toMatch(/security\.dynamicRegistrationEnabled.*Must be a boolean/);
        expect(errorMessage).toMatch(/aacp\.defaultTtlMs.*Must be a positive number/);
      }
    });

    it('should fail fast when environment variables override with invalid values', () => {
      // Setup: valid config file but invalid env vars
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: {
          name: 'valid-name',
          version: '1.0.0',
          shutdownTimeoutMs: 10000,
        },
        tools: {
          defaultTimeoutMs: 30000,
        },
      }));

      // Setup: environment variables with invalid values that pass parsing but fail validation
      process.env['MCP_SERVER_NAME'] = ''; // empty string
      process.env['MCP_LOGGING_LEVEL'] = 'invalid-level';
      process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'maybe'; // invalid boolean

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration.*server\.name.*Must be a non-empty string/);
    });

    it('should provide specific error messages for admin policy mode validation', () => {
      // Setup: config file with invalid admin policy mode
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        tools: {
          adminPolicy: {
            mode: 'allow_all', // invalid: not in allowed values
          },
        },
      }));

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration.*tools\.adminPolicy\.mode.*Must be one of: deny_all, local_stdio_only, token/);
    });

    it('should validate boundary values correctly', () => {
      // Setup: config file with boundary values (some valid, some invalid)
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: {
          shutdownTimeoutMs: 1, // valid: positive number (minimum)
        },
        tools: {
          defaultTimeoutMs: 1, // valid: positive number (minimum)
          maxPayloadBytes: 1, // valid: positive number (minimum)
          maxStateBytes: 1, // valid: positive number (minimum)
        },
        resources: {
          maxConcurrentExecutions: 1, // valid: positive number (minimum)
        },
        aacp: {
          defaultTtlMs: 1, // valid: positive number (minimum)
        },
      }));

      // Act & Assert - should not throw since all values are valid (positive)
      expect(() => {
        new ConfigManagerImpl();
      }).not.toThrow();
    });

    it('should fail validation for zero and negative boundary values', () => {
      // Setup: config file with zero and negative boundary values
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: {
          shutdownTimeoutMs: 0, // invalid: zero
        },
        tools: {
          defaultTimeoutMs: -1, // invalid: negative
          maxPayloadBytes: 0, // invalid: zero
        },
        resources: {
          maxConcurrentExecutions: -10, // invalid: negative
        },
      }));

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Invalid configuration.*shutdownTimeoutMs.*Must be a positive number.*defaultTimeoutMs.*Must be a positive number.*maxPayloadBytes.*Must be a positive number.*maxConcurrentExecutions.*Must be a positive number/);
    });

    it('should validate that all logging levels are properly checked', () => {
      const validLevels = ['debug', 'info', 'warn', 'error'];
      const invalidLevels = ['trace', 'verbose', 'fatal', 'off', 'all', ''];

      for (const invalidLevel of invalidLevels) {
        // Setup: config file with invalid logging level
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify({
          logging: {
            level: invalidLevel,
          },
        }));

        // Act & Assert
        expect(() => {
          new ConfigManagerImpl();
        }).toThrow(new RegExp(`Invalid configuration.*logging\\.level.*Must be one of: ${validLevels.join(', ')}`));
      }
    });

    it('should validate that all admin policy modes are properly checked', () => {
      const validModes = ['deny_all', 'local_stdio_only', 'token'];
      const invalidModes = ['allow_all', 'permit_all', 'open', 'closed', ''];

      for (const invalidMode of invalidModes) {
        // Setup: config file with invalid admin policy mode
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify({
          tools: {
            adminPolicy: {
              mode: invalidMode,
            },
          },
        }));

        // Act & Assert
        expect(() => {
          new ConfigManagerImpl();
        }).toThrow(new RegExp(`Invalid configuration.*tools\\.adminPolicy\\.mode.*Must be one of: ${validModes.join(', ')}`));
      }
    });
  });

  describe('default values', () => {
    it('should use all default values when no config file or environment variables are present', () => {
      // Setup: no config file, no env vars
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: all default values
      expect(config.server.name).toBe('foundation-mcp-runtime');
      expect(config.server.version).toBe('0.1.0');
      expect(config.server.shutdownTimeoutMs).toBe(10000);
      expect(config.tools.defaultTimeoutMs).toBe(30000);
      expect(config.tools.maxPayloadBytes).toBe(1048576);
      expect(config.tools.maxStateBytes).toBe(262144);
      expect(config.tools.adminRegistrationEnabled).toBe(false);
      expect(config.tools.adminPolicy.mode).toBe('deny_all');
      expect(config.tools.adminPolicy.tokenEnvVar).toBeUndefined();
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
  });

  describe('isDynamicRegistrationEffective', () => {
    it('should return true only when both flags are true', () => {
      // Setup: both flags true via env vars
      mockFs.existsSync.mockReturnValue(false);
      process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'true';
      process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'true';

      // Act
      const configManager = new ConfigManagerImpl();

      // Assert
      expect(configManager.isDynamicRegistrationEffective()).toBe(true);
    });

    it('should return false when adminRegistrationEnabled is false', () => {
      // Setup: adminRegistrationEnabled false, dynamicRegistrationEnabled true
      mockFs.existsSync.mockReturnValue(false);
      process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'false';
      process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'true';

      // Act
      const configManager = new ConfigManagerImpl();

      // Assert
      expect(configManager.isDynamicRegistrationEffective()).toBe(false);
    });

    it('should return false when dynamicRegistrationEnabled is false', () => {
      // Setup: adminRegistrationEnabled true, dynamicRegistrationEnabled false
      mockFs.existsSync.mockReturnValue(false);
      process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] = 'true';
      process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] = 'false';

      // Act
      const configManager = new ConfigManagerImpl();

      // Assert
      expect(configManager.isDynamicRegistrationEffective()).toBe(false);
    });

    it('should return false when both flags are false', () => {
      // Setup: both flags false (defaults)
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const configManager = new ConfigManagerImpl();

      // Assert
      expect(configManager.isDynamicRegistrationEffective()).toBe(false);
    });
  });

  describe('config file loading errors', () => {
    it('should throw error when config file exists but cannot be read', () => {
      // Setup: config file exists but readFileSync throws
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Failed to load config file.*Permission denied/);
    });

    it('should throw error when config file contains invalid JSON', () => {
      // Setup: config file exists but contains invalid JSON
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{ invalid json }');

      // Act & Assert
      expect(() => {
        new ConfigManagerImpl();
      }).toThrow(/Failed to load config file.*Expected property name/);
    });

    it('should use custom config file path from environment variable', () => {
      // Setup: custom config file path
      process.env['MCP_CONFIG_FILE'] = '/custom/path/config.json';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        server: { name: 'custom-config' }
      }));

      // Act
      const configManager = new ConfigManagerImpl();
      const config = configManager.load();

      // Assert: custom config file was used
      expect(mockFs.existsSync).toHaveBeenCalledWith('/custom/path/config.json');
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/custom/path/config.json', 'utf8');
      expect(config.server.name).toBe('custom-config');
    });
  });
});