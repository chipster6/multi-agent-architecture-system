/**
 * Configuration module exports.
 * Provides configuration management interfaces and implementation.
 */

export {
  createConfigManager,
  ConfigManagerImpl,
} from './configManager.js';

export type {
  AdminPolicy,
  ServerConfig,
  ValidationResult,
  ConfigManager,
} from './configManager.js';