/**
 * Configuration management module for the MCP server.
 * Handles loading, validation, and access to server configuration
 * with environment variable precedence over config files over defaults.
 */

import * as fs from 'fs';

/**
 * Admin policy configuration for controlling administrative operations.
 */
export interface AdminPolicy {
  mode: 'deny_all' | 'local_stdio_only' | 'token';
  tokenEnvVar?: string;
}

/**
 * Complete server configuration interface.
 * Defines all configuration options with their types and default values.
 */
export interface ServerConfig {
  server: { 
    name: string; 
    version: string; 
    shutdownTimeoutMs: number; // default 10000
  };

  tools: {
    defaultTimeoutMs: number; // default 30000
    maxPayloadBytes: number; // default 1048576
    maxStateBytes: number; // default 262144 (256KB)
    adminRegistrationEnabled: boolean; // default false
    adminPolicy: AdminPolicy; // default { mode: 'deny_all' }
  };

  resources: {
    maxConcurrentExecutions: number; // default 10
  };

  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    redactKeys: string[]; // default denylist
  };

  security: {
    dynamicRegistrationEnabled: boolean; // default false
    allowArbitraryCodeTools: boolean; // default false - reserved for future use, not used in v0.1
  };

  aacp?: {
    defaultTtlMs: number; // default 86400000 (24 hours)
  };

  database?: {
    enabled: boolean;
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };

  embeddings?: {
    enabled: boolean;
    provider: string;
    model: string;
    dimensions: number;
  };
}

/**
 * Validation result interface for configuration validation.
 */
export interface ValidationResult {
  valid: boolean;
  errors?: Array<{ path: string; message: string }>;
}

/**
 * Configuration manager interface.
 */
export interface ConfigManager {
  load(): ServerConfig;
  validate(config: Partial<ServerConfig>): ValidationResult;
  get<K extends keyof ServerConfig>(key: K): ServerConfig[K];
  isDynamicRegistrationEffective(): boolean;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: ServerConfig = {
  server: {
    name: 'foundation-mcp-runtime',
    version: '0.1.0',
    shutdownTimeoutMs: 10000,
  },
  tools: {
    defaultTimeoutMs: 30000,
    maxPayloadBytes: 1048576, // 1MB
    maxStateBytes: 262144, // 256KB
    adminRegistrationEnabled: false,
    adminPolicy: { mode: 'deny_all' },
  },
  resources: {
    maxConcurrentExecutions: 10,
  },
  logging: {
    level: 'info',
    redactKeys: [
      'token',
      'key', 
      'secret',
      'password',
      'apiKey',
      'authorization',
      'bearer',
      'session',
      'cookie',
    ],
  },
  security: {
    dynamicRegistrationEnabled: false,
    allowArbitraryCodeTools: false, // reserved for future use, not used in v0.1
  },
  aacp: {
    defaultTtlMs: 86400000, // 24 hours
  },
  database: {
    enabled: false,
    host: 'localhost',
    port: 5432,
    name: 'mcp',
    user: 'mcp',
    password: 'mcp',
  },
  embeddings: {
    enabled: false,
    provider: 'gemini',
    model: 'gemini-embedding-001',
    dimensions: 3072,
  },
};

/**
 * Configuration manager implementation.
 * Provides configuration loading with environment variable precedence,
 * validation, and typed access to configuration values.
 */
export class ConfigManagerImpl implements ConfigManager {
  private readonly config: ServerConfig;

  constructor() {
    this.config = this.load();
  }

  /**
   * Load configuration with precedence: env vars > config file > defaults.
   * @returns Complete server configuration
   */
  load(): ServerConfig {
    // Start with defaults
    let config: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    // Load from config file (optional)
    config = this.loadFromConfigFile(config);

    // Override with environment variables
    config = this.loadFromEnvironment(config);

    // Validate the final configuration
    const validation = this.validate(config);
    if (!validation.valid) {
      const errorMessages = validation.errors?.map(e => `${e.path}: ${e.message}`).join(', ') ?? 'Unknown validation errors';
      throw new Error(`Invalid configuration: ${errorMessages}`);
    }

    return config;
  }

  /**
   * Validate configuration object.
   * @param config - Partial configuration to validate
   * @returns Validation result with errors if invalid
   */
  validate(config: Partial<ServerConfig>): ValidationResult {
    const errors: Array<{ path: string; message: string }> = [];

    // Validate server config
    if (config.server) {
      if (typeof config.server.name !== 'string' || config.server.name.length === 0) {
        errors.push({ path: 'server.name', message: 'Must be a non-empty string' });
      }
      if (typeof config.server.version !== 'string' || config.server.version.length === 0) {
        errors.push({ path: 'server.version', message: 'Must be a non-empty string' });
      }
      if (typeof config.server.shutdownTimeoutMs !== 'number' || config.server.shutdownTimeoutMs <= 0) {
        errors.push({ path: 'server.shutdownTimeoutMs', message: 'Must be a positive number' });
      }
    }

    // Validate tools config
    if (config.tools) {
      if (typeof config.tools.defaultTimeoutMs !== 'number' || config.tools.defaultTimeoutMs <= 0) {
        errors.push({ path: 'tools.defaultTimeoutMs', message: 'Must be a positive number' });
      }
      if (typeof config.tools.maxPayloadBytes !== 'number' || config.tools.maxPayloadBytes <= 0) {
        errors.push({ path: 'tools.maxPayloadBytes', message: 'Must be a positive number' });
      }
      if (typeof config.tools.maxStateBytes !== 'number' || config.tools.maxStateBytes <= 0) {
        errors.push({ path: 'tools.maxStateBytes', message: 'Must be a positive number' });
      }
      if (typeof config.tools.adminRegistrationEnabled !== 'boolean') {
        errors.push({ path: 'tools.adminRegistrationEnabled', message: 'Must be a boolean' });
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (config.tools.adminPolicy) {
        const validModes = ['deny_all', 'local_stdio_only', 'token'] as const;
        if (!validModes.includes(config.tools.adminPolicy.mode)) {
          errors.push({ path: 'tools.adminPolicy.mode', message: `Must be one of: ${validModes.join(', ')}` });
        }
      }
    }

    // Validate resources config
    if (config.resources) {
      if (typeof config.resources.maxConcurrentExecutions !== 'number' || config.resources.maxConcurrentExecutions <= 0) {
        errors.push({ path: 'resources.maxConcurrentExecutions', message: 'Must be a positive number' });
      }
    }

    // Validate logging config
    if (config.logging) {
      const validLevels = ['debug', 'info', 'warn', 'error'];
      if (!validLevels.includes(config.logging.level)) {
        errors.push({ path: 'logging.level', message: `Must be one of: ${validLevels.join(', ')}` });
      }
      if (!Array.isArray(config.logging.redactKeys)) {
        errors.push({ path: 'logging.redactKeys', message: 'Must be an array of strings' });
      } else if (!config.logging.redactKeys.every(key => typeof key === 'string')) {
        errors.push({ path: 'logging.redactKeys', message: 'All elements must be strings' });
      }
    }

    // Validate security config
    if (config.security) {
      if (typeof config.security.dynamicRegistrationEnabled !== 'boolean') {
        errors.push({ path: 'security.dynamicRegistrationEnabled', message: 'Must be a boolean' });
      }
      if (typeof config.security.allowArbitraryCodeTools !== 'boolean') {
        errors.push({ path: 'security.allowArbitraryCodeTools', message: 'Must be a boolean' });
      }
      // Note: allowArbitraryCodeTools is reserved for future use and not used in v0.1
    }

    // Validate AACP config (optional)
    if (config.aacp) {
      if (typeof config.aacp.defaultTtlMs !== 'number' || config.aacp.defaultTtlMs <= 0) {
        errors.push({ path: 'aacp.defaultTtlMs', message: 'Must be a positive number' });
      }
    }

    // Validate database config
    if (config.database) {
      if (typeof config.database.enabled !== 'boolean') {
        errors.push({ path: 'database.enabled', message: 'Must be a boolean' });
      }
      if (typeof config.database.host !== 'string' || config.database.host.length === 0) {
        errors.push({ path: 'database.host', message: 'Must be a non-empty string' });
      }
      if (typeof config.database.port !== 'number' || config.database.port <= 0) {
        errors.push({ path: 'database.port', message: 'Must be a positive number' });
      }
      if (typeof config.database.name !== 'string' || config.database.name.length === 0) {
        errors.push({ path: 'database.name', message: 'Must be a non-empty string' });
      }
      if (typeof config.database.user !== 'string' || config.database.user.length === 0) {
        errors.push({ path: 'database.user', message: 'Must be a non-empty string' });
      }
      if (typeof config.database.password !== 'string') {
        errors.push({ path: 'database.password', message: 'Must be a string' });
      }
    }

    // Validate embeddings config
    if (config.embeddings) {
      if (typeof config.embeddings.enabled !== 'boolean') {
        errors.push({ path: 'embeddings.enabled', message: 'Must be a boolean' });
      }
      if (config.embeddings.provider !== 'gemini') {
        errors.push({ path: 'embeddings.provider', message: 'Must be "gemini"' });
      }
      if (typeof config.embeddings.model !== 'string' || config.embeddings.model.length === 0) {
        errors.push({ path: 'embeddings.model', message: 'Must be a non-empty string' });
      }
      if (typeof config.embeddings.dimensions !== 'number' || config.embeddings.dimensions <= 0) {
        errors.push({ path: 'embeddings.dimensions', message: 'Must be a positive number' });
      }
    }

    if (errors.length === 0) {
      return { valid: true };
    } else {
      return { valid: false, errors };
    }
  }

  /**
   * Get a specific configuration value by key.
   * @param key - Configuration key
   * @returns Configuration value
   */
  get<K extends keyof ServerConfig>(key: K): ServerConfig[K] {
    return this.config[key];
  }

  /**
   * Check if dynamic registration is effectively enabled.
   * Requires both adminRegistrationEnabled AND dynamicRegistrationEnabled to be true.
   * @returns True if dynamic registration is effective
   */
  isDynamicRegistrationEffective(): boolean {
    return this.config.tools.adminRegistrationEnabled && this.config.security.dynamicRegistrationEnabled;
  }

  /**
   * Load configuration values from environment variables.
   * @param config - Base configuration to override
   * @returns Configuration with environment variable overrides
   */
  private loadFromEnvironment(config: ServerConfig): ServerConfig {
    const result = { ...config };

    // Server configuration
    if (process.env['MCP_SERVER_NAME'] !== undefined) {
      result.server.name = process.env['MCP_SERVER_NAME'];
    }
    if (process.env['MCP_SERVER_VERSION'] !== undefined) {
      result.server.version = process.env['MCP_SERVER_VERSION'];
    }
    if (process.env['MCP_SERVER_SHUTDOWN_TIMEOUT_MS']) {
      const timeout = parseInt(process.env['MCP_SERVER_SHUTDOWN_TIMEOUT_MS'], 10);
      if (!isNaN(timeout)) {
        result.server.shutdownTimeoutMs = timeout;
      }
    }

    // Tools configuration
    if (process.env['MCP_TOOLS_DEFAULT_TIMEOUT_MS']) {
      const timeout = parseInt(process.env['MCP_TOOLS_DEFAULT_TIMEOUT_MS'], 10);
      if (!isNaN(timeout)) {
        result.tools.defaultTimeoutMs = timeout;
      }
    }
    if (process.env['MCP_TOOLS_MAX_PAYLOAD_BYTES']) {
      const maxBytes = parseInt(process.env['MCP_TOOLS_MAX_PAYLOAD_BYTES'], 10);
      if (!isNaN(maxBytes)) {
        result.tools.maxPayloadBytes = maxBytes;
      }
    }
    if (process.env['MCP_TOOLS_MAX_STATE_BYTES']) {
      const maxBytes = parseInt(process.env['MCP_TOOLS_MAX_STATE_BYTES'], 10);
      if (!isNaN(maxBytes)) {
        result.tools.maxStateBytes = maxBytes;
      }
    }
    if (process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED']) {
      result.tools.adminRegistrationEnabled = process.env['MCP_TOOLS_ADMIN_REGISTRATION_ENABLED'] === 'true';
    }
    if (process.env['MCP_TOOLS_ADMIN_POLICY_MODE']) {
      const mode = process.env['MCP_TOOLS_ADMIN_POLICY_MODE'] as AdminPolicy['mode'];
      if (['deny_all', 'local_stdio_only', 'token'].includes(mode)) {
        result.tools.adminPolicy.mode = mode;
      }
    }
    if (process.env['MCP_TOOLS_ADMIN_POLICY_TOKEN_ENV_VAR']) {
      result.tools.adminPolicy.tokenEnvVar = process.env['MCP_TOOLS_ADMIN_POLICY_TOKEN_ENV_VAR'];
    }

    // Resources configuration
    if (process.env['MCP_RESOURCES_MAX_CONCURRENT_EXECUTIONS']) {
      const maxExec = parseInt(process.env['MCP_RESOURCES_MAX_CONCURRENT_EXECUTIONS'], 10);
      if (!isNaN(maxExec)) {
        result.resources.maxConcurrentExecutions = maxExec;
      }
    }

    // Logging configuration
    if (process.env['MCP_LOGGING_LEVEL'] !== undefined) {
      const level = process.env['MCP_LOGGING_LEVEL'] as ServerConfig['logging']['level'];
      if (['debug', 'info', 'warn', 'error'].includes(level)) {
        result.logging.level = level;
      }
    }
    if (process.env['MCP_LOGGING_REDACT_KEYS']) {
      result.logging.redactKeys = process.env['MCP_LOGGING_REDACT_KEYS'].split(',').map(key => key.trim());
    }

    // Security configuration
    if (process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED']) {
      result.security.dynamicRegistrationEnabled = process.env['MCP_SECURITY_DYNAMIC_REGISTRATION_ENABLED'] === 'true';
    }
    if (process.env['MCP_SECURITY_ALLOW_ARBITRARY_CODE_TOOLS']) {
      result.security.allowArbitraryCodeTools = process.env['MCP_SECURITY_ALLOW_ARBITRARY_CODE_TOOLS'] === 'true';
    }

    // AACP configuration
    if (process.env['MCP_AACP_DEFAULT_TTL_MS']) {
      const ttl = parseInt(process.env['MCP_AACP_DEFAULT_TTL_MS'], 10);
      if (!isNaN(ttl)) {
        if (!result.aacp) {
          result.aacp = { defaultTtlMs: ttl };
        } else {
          result.aacp.defaultTtlMs = ttl;
        }
      }
    }

    // Database configuration
    if (result.database) {
      if (process.env['MCP_DB_ENABLED']) {
        result.database.enabled = process.env['MCP_DB_ENABLED'] === 'true';
      }
      if (process.env['MCP_DB_HOST']) {
        result.database.host = process.env['MCP_DB_HOST'];
      }
      if (process.env['MCP_DB_PORT']) {
        const port = parseInt(process.env['MCP_DB_PORT'], 10);
        if (!isNaN(port)) {
          result.database.port = port;
        }
      }
      if (process.env['MCP_DB_NAME']) {
        result.database.name = process.env['MCP_DB_NAME'];
      }
      if (process.env['MCP_DB_USER']) {
        result.database.user = process.env['MCP_DB_USER'];
      }
      if (process.env['MCP_DB_PASSWORD']) {
        result.database.password = process.env['MCP_DB_PASSWORD'];
      }
    }

    // Embeddings configuration
    if (result.embeddings) {
      if (process.env['MCP_EMBEDDINGS_ENABLED']) {
        result.embeddings.enabled = process.env['MCP_EMBEDDINGS_ENABLED'] === 'true';
      }
      if (process.env['MCP_EMBEDDINGS_PROVIDER']) {
        const provider = process.env['MCP_EMBEDDINGS_PROVIDER'];
        if (provider === 'gemini') {
          result.embeddings.provider = 'gemini';
        }
      }
      if (process.env['MCP_EMBEDDINGS_MODEL']) {
        result.embeddings.model = process.env['MCP_EMBEDDINGS_MODEL'];
      }
      if (process.env['MCP_EMBEDDINGS_DIMENSIONS']) {
        const dims = parseInt(process.env['MCP_EMBEDDINGS_DIMENSIONS'], 10);
        if (!isNaN(dims)) {
          result.embeddings.dimensions = dims;
        }
      }
    }

    return result;
  }

  /**
   * Load configuration values from a JSON config file.
   * @param config - Base configuration to override
   * @returns Configuration with config file overrides
   */
  private loadFromConfigFile(config: ServerConfig): ServerConfig {
    const configPath = process.env['MCP_CONFIG_FILE'] ?? './mcp-config.json';
    
    try {
      // Check if config file exists
      if (!fs.existsSync(configPath)) {
        // Config file is optional, return unchanged config
        return config;
      }

      // Read and parse config file
      const configFileContent = fs.readFileSync(configPath, 'utf8');
      const fileConfig = JSON.parse(configFileContent) as Partial<ServerConfig>;

      // Deep merge config file values into base config
      return this.deepMerge(config, fileConfig);
    } catch (error) {
      // If config file exists but can't be read/parsed, that's an error
      if (error instanceof Error) {
        throw new Error(`Failed to load config file '${configPath}': ${error.message}`);
      }
      throw new Error(`Failed to load config file '${configPath}': Unknown error`);
    }
  }

  /**
   * Deep merge two configuration objects.
   * @param target - Target configuration object
   * @param source - Source configuration object to merge
   * @returns Merged configuration
   */
  private deepMerge(target: ServerConfig, source: Partial<ServerConfig>): ServerConfig {
    const result = { ...target };

    if (source.server) {
      result.server = { ...result.server, ...source.server };
    }
    if (source.tools) {
      result.tools = { ...result.tools, ...source.tools };
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (source.tools.adminPolicy) {
        result.tools.adminPolicy = { ...result.tools.adminPolicy, ...source.tools.adminPolicy };
      }
    }
    if (source.resources) {
      result.resources = { ...result.resources, ...source.resources };
    }
    if (source.logging) {
      result.logging = { ...result.logging, ...source.logging };
    }
    if (source.security) {
      result.security = { ...result.security, ...source.security };
    }
    if (source.aacp) {
      result.aacp = { ...result.aacp, ...source.aacp };
    }
    if (source.database) {
      result.database = { ...result.database, ...source.database };
    }
    if (source.embeddings) {
      result.embeddings = { ...result.embeddings, ...source.embeddings };
    }

    return result;
  }
}

/**
 * Create a new configuration manager instance.
 * @returns ConfigManager instance
 */
export function createConfigManager(): ConfigManager {
  return new ConfigManagerImpl();
}
