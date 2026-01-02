/**
 * Tool Registry Core for the MCP server.
 * Provides registration, validation, and management of MCP tools with JSON Schema validation.
 */

import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { ErrorCode, createError } from '../errors/errorHandler.js';
import { type ValidationResult, type ConfigManager } from '../config/configManager.js';
import { type StructuredLogger } from '../logging/structuredLogger.js';

/**
 * Tool definition interface per MCP specification.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema object
}

/**
 * Tool context interface with cooperative cancellation support.
 */
export interface ToolContext {
  runId: string;
  correlationId: string;
  logger: StructuredLogger;
  abortSignal: AbortSignal; // cooperative cancellation
}

/**
 * Tool handler function interface.
 */
export interface ToolHandler {
  (args: Record<string, unknown>, context: ToolContext): Promise<unknown>;
}

/**
 * Registered tool interface with compiled validator.
 */
export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  validator: ValidateFunction; // compiled at registration time
  isDynamic: boolean; // tracks if tool was dynamically registered
}

/**
 * Tool registry interface for managing MCP tools.
 */
export interface ToolRegistry {
  register(definition: ToolDefinition, handler: ToolHandler, opts?: { isDynamic?: boolean }): void;
  unregister(name: string): boolean;
  get(name: string): RegisteredTool | undefined;
  list(): ToolDefinition[]; // lexicographically sorted by name
  validateDefinition(definition: ToolDefinition, opts?: { isDynamic?: boolean }): ValidationResult;
}

/**
 * Tool registry implementation with Ajv schema validation.
 */
export class ToolRegistryImpl implements ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly ajv: Ajv;
  private readonly config: ConfigManager;
  private readonly logger: StructuredLogger;

  constructor(config: ConfigManager, logger: StructuredLogger) {
    this.config = config;
    this.logger = logger;
    this.ajv = new Ajv({
      strict: true,
      allErrors: true,
      verbose: true,
    });
  }

  /**
   * Register a tool with the registry.
   * @param definition - Tool definition with name, description, and input schema
   * @param handler - Tool handler function
   * @param opts - Registration options
   * @throws Error if tool name already exists or validation fails
   */
  register(definition: ToolDefinition, handler: ToolHandler, opts?: { isDynamic?: boolean }): void {
    const isDynamic = opts?.isDynamic ?? false;

    // Check for duplicate names
    if (this.tools.has(definition.name)) {
      throw createError(
        ErrorCode.InvalidArgument,
        `Tool with name '${definition.name}' is already registered`
      );
    }

    // Validate the definition
    const validation = this.validateDefinition(definition, { isDynamic });
    if (!validation.valid) {
      const errorMessages = validation.errors?.map(e => `${e.path}: ${e.message}`).join(', ') ?? 'Unknown validation errors';
      throw createError(
        ErrorCode.InvalidArgument,
        `Invalid tool definition: ${errorMessages}`
      );
    }

    // Check dynamic registration permissions
    if (isDynamic && !this.config.isDynamicRegistrationEffective()) {
      throw createError(
        ErrorCode.Unauthorized,
        'Dynamic tool registration is not enabled'
      );
    }

    // Note: config.security.allowArbitraryCodeTools is reserved for future use and not used in v0.1

    // Compile the JSON Schema validator
    let validator: ValidateFunction;
    try {
      validator = this.ajv.compile(definition.inputSchema);
    } catch (error) {
      throw createError(
        ErrorCode.InvalidArgument,
        `Failed to compile input schema for tool '${definition.name}': ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Register the tool
    const registeredTool: RegisteredTool = {
      definition,
      handler,
      validator,
      isDynamic,
    };

    this.tools.set(definition.name, registeredTool);

    // Log dynamic registrations at WARN level
    if (isDynamic) {
      this.logger.warn(`Dynamic tool registered: ${definition.name}`, {
        toolName: definition.name,
        isDynamic: true,
      });
    }
  }

  /**
   * Unregister a tool from the registry.
   * @param name - Tool name to unregister
   * @returns True if tool was found and removed, false otherwise
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get a registered tool by name.
   * @param name - Tool name to retrieve
   * @returns Registered tool or undefined if not found
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools sorted lexicographically by name.
   * @returns Array of tool definitions sorted by name
   */
  list(): ToolDefinition[] {
    const toolNames = Array.from(this.tools.keys()).sort();
    return toolNames.map(name => {
      const tool = this.tools.get(name)!;
      return tool.definition;
    });
  }

  /**
   * Validate a tool definition.
   * @param definition - Tool definition to validate
   * @param _opts - Validation options (currently unused)
   * @returns Validation result with errors if invalid
   */
  validateDefinition(definition: ToolDefinition, _opts?: { isDynamic?: boolean }): ValidationResult {
    const errors: Array<{ path: string; message: string }> = [];

    // Validate name
    if (typeof definition.name !== 'string' || definition.name.length === 0) {
      errors.push({ path: 'name', message: 'Must be a non-empty string' });
    } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(definition.name)) {
      errors.push({ path: 'name', message: 'Must start with a letter and contain only letters, numbers, underscores, and hyphens' });
    }

    // Validate description
    if (typeof definition.description !== 'string' || definition.description.length === 0) {
      errors.push({ path: 'description', message: 'Must be a non-empty string' });
    }

    // Validate inputSchema
    if (!definition.inputSchema) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition
      errors.push({ path: 'inputSchema', message: 'Must be a valid JSON Schema object' });
    } else {
      // Enforce object-root constraint for tool schemas
      const schemaType = definition.inputSchema['type'] as string;
      if (schemaType !== 'object') { // eslint-disable-line @typescript-eslint/no-unnecessary-condition
        errors.push({ path: 'inputSchema.type', message: 'Tool input schema must have type "object" at root level' });
      }

      // Validate that it's a valid JSON Schema by attempting to compile it
      try {
        this.ajv.compile(definition.inputSchema);
      } catch (error) {
        errors.push({ 
          path: 'inputSchema', 
          message: `Invalid JSON Schema: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (errors.length > 0) {
      return { valid: false, errors };
    }
    return { valid: true };
  }
}

/**
 * Create a new tool registry instance.
 * @param config - Configuration manager for security settings
 * @param logger - Structured logger for logging dynamic registrations
 * @returns ToolRegistry instance
 */
export function createToolRegistry(config: ConfigManager, logger: StructuredLogger): ToolRegistry {
  return new ToolRegistryImpl(config, logger);
}