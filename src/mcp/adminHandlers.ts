/**
 * Admin tool handlers module for the MCP server.
 * Implements dynamic tool registration and management with security enforcement.
 */

import type { SessionContext } from './session.js';
import type { ToolRegistry } from './toolRegistry.js';
import type { ServerConfig } from '../config/configManager.js';
import { ErrorCode, createError } from '../errors/errorHandler.js';
import type { RequestContext } from './handlers.js';

/**
 * Closed union type for supported tool types.
 * Each type has a canonical schema that must be enforced.
 */
export type ToolType = 'echo' | 'health' | 'agentProxy';

/**
 * Canonical schemas for each tool type.
 * These schemas are enforced and cannot be overridden by callers.
 */
export const CANONICAL_TOOL_SCHEMAS: Record<ToolType, Record<string, unknown>> = {
  echo: {
    type: 'object',
    properties: {
      message: { type: 'string' }
    },
    required: ['message'],
    additionalProperties: false
  },
  health: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  agentProxy: {
    type: 'object',
    properties: {
      targetAgentId: { type: 'string' },
      message: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          payload: {}
        },
        required: ['type', 'payload'],
        additionalProperties: false
      }
    },
    required: ['targetAgentId', 'message'],
    additionalProperties: false
  }
};

/**
 * Admin tool registration request interface.
 */
export interface AdminRegisterToolRequest {
  name: string;
  description: string;
  toolType: ToolType;
  inputSchema?: Record<string, unknown>; // Will be validated against canonical schema
  version?: string;
}

/**
 * Admin tool unregistration request interface.
 */
export interface AdminUnregisterToolRequest {
  name: string;
}

/**
 * Enforces admin policy based on configuration and transport type.
 * 
 * @param adminPolicy - Admin policy configuration
 * @param transport - Transport information from request context
 * @throws Error with UNAUTHORIZED code if policy is violated
 */
export function enforceAdminPolicy(
  adminPolicy: ServerConfig['tools']['adminPolicy'],
  transport: RequestContext['transport']
): void {
  switch (adminPolicy.mode) {
    case 'deny_all':
      throw createError(
        ErrorCode.Unauthorized,
        'Administrative operations are disabled'
      );
    
    case 'local_stdio_only':
      if (transport.type !== 'stdio') {
        throw createError(
          ErrorCode.Unauthorized,
          'Administrative operations are only allowed via stdio transport'
        );
      }
      break;
    
    case 'token':
      // Token-based authentication not supported in v0.1
      throw createError(
        ErrorCode.Unauthorized,
        'Token-based admin authentication is not supported in v0.1'
      );
    
    default:
      throw createError(
        ErrorCode.Internal,
        `Unknown admin policy mode: ${(adminPolicy as { mode: string }).mode}`
      );
  }
}

/**
 * Validates that a provided schema matches the canonical schema for a tool type.
 * 
 * @param toolType - The tool type
 * @param providedSchema - Schema provided by the caller (optional)
 * @returns true if schemas match or no schema provided
 * @throws Error with INVALID_ARGUMENT if schemas don't match
 */
function validateCanonicalSchema(
  toolType: ToolType,
  providedSchema?: Record<string, unknown>
): void {
  const canonicalSchema = CANONICAL_TOOL_SCHEMAS[toolType];
  
  // If no schema provided, that's fine - we'll use the canonical one
  if (!providedSchema) {
    return;
  }
  
  // Compare provided schema with canonical schema (byte-for-byte match required)
  const canonicalJson = JSON.stringify(canonicalSchema);
  const providedJson = JSON.stringify(providedSchema);
  
  if (canonicalJson !== providedJson) {
    throw createError(
      ErrorCode.InvalidArgument,
      `Provided schema for toolType '${toolType}' does not match canonical schema. Expected: ${canonicalJson}, got: ${providedJson}`
    );
  }
}

/**
 * Predefined tool handlers for each tool type.
 */
const TOOL_HANDLERS: Record<ToolType, (args: Record<string, unknown>, context: unknown) => Promise<unknown>> = {
  echo: (args: Record<string, unknown>) => {
    const { message } = args as { message: string };
    return Promise.resolve({ echo: message, timestamp: new Date().toISOString() });
  },
  
  health: () => {
    // This would typically delegate to the health tool implementation
    // For now, return a simple health status
    return Promise.resolve({ status: 'healthy', timestamp: new Date().toISOString() });
  },
  
  agentProxy: (args: Record<string, unknown>) => {
    const { targetAgentId, message } = args as { 
      targetAgentId: string; 
      message: { type: string; payload: unknown } 
    };
    
    // This would typically delegate to the agent coordinator
    // For now, return a placeholder response
    return Promise.resolve({ 
      targetAgentId, 
      messageType: message.type,
      status: 'forwarded',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Handles the admin/registerTool request.
 * Registers a new dynamic tool with definition-only registration.
 * 
 * @param request - Tool registration request
 * @param session - Session context
 * @param toolRegistry - Tool registry instance
 * @param config - Server configuration
 * @param ctx - Request context for correlation and logging
 * @returns Success response or throws error
 */
export function handleAdminRegisterTool(
  request: AdminRegisterToolRequest,
  session: SessionContext,
  toolRegistry: ToolRegistry,
  config: ServerConfig,
  ctx: RequestContext
): { success: boolean; toolName: string } {
  // Enforce admin policy
  enforceAdminPolicy(config.tools.adminPolicy, ctx.transport);
  
  // Validate toolType
  if (!Object.keys(CANONICAL_TOOL_SCHEMAS).includes(request.toolType)) {
    throw createError(
      ErrorCode.InvalidArgument,
      `Unknown toolType '${request.toolType}'. Supported types: ${Object.keys(CANONICAL_TOOL_SCHEMAS).join(', ')}`
    );
  }
  
  // Validate canonical schema if provided
  validateCanonicalSchema(request.toolType, request.inputSchema);
  
  // Use canonical schema (ignore any provided schema)
  const canonicalSchema = CANONICAL_TOOL_SCHEMAS[request.toolType];
  
  // Create tool definition
  const toolDefinition = {
    name: request.name,
    description: request.description,
    inputSchema: canonicalSchema,
    ...(request.version && { version: request.version })
  };
  
  // Get predefined handler for this tool type
  const handler = TOOL_HANDLERS[request.toolType];
  
  // Register the tool as dynamic
  toolRegistry.register(toolDefinition, handler, { isDynamic: true });
  
  // Log at WARN level as required
  session.logger.warn(`Dynamic tool registered: ${request.name} (type: ${request.toolType})`, {
    toolName: request.name,
    toolType: request.toolType,
    correlationId: ctx.correlationId,
    ...(ctx.runId && { runId: ctx.runId })
  });
  
  return { success: true, toolName: request.name };
}

/**
 * Handles the admin/unregisterTool request.
 * Removes a tool from the registry.
 * 
 * @param request - Tool unregistration request
 * @param session - Session context
 * @param toolRegistry - Tool registry instance
 * @param config - Server configuration
 * @param ctx - Request context for correlation and logging
 * @returns Success response indicating whether tool was found and removed
 */
export function handleAdminUnregisterTool(
  request: AdminUnregisterToolRequest,
  session: SessionContext,
  toolRegistry: ToolRegistry,
  config: ServerConfig,
  ctx: RequestContext
): { success: boolean; found: boolean; toolName: string } {
  // Enforce admin policy
  enforceAdminPolicy(config.tools.adminPolicy, ctx.transport);
  
  // Attempt to unregister the tool
  const found = toolRegistry.unregister(request.name);
  
  // Log at WARN level as required
  session.logger.warn(`Tool unregistered: ${request.name}`, {
    toolName: request.name,
    found,
    correlationId: ctx.correlationId,
    ...(ctx.runId && { runId: ctx.runId })
  });
  
  return { success: true, found, toolName: request.name };
}

/**
 * Admin tool definitions for registration with the tool registry.
 * These tools are only registered when dynamic registration is effective.
 */
export const ADMIN_TOOL_DEFINITIONS = [
  {
    name: 'admin/registerTool',
    description: 'Register a new dynamic tool with predefined handler',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        description: { type: 'string', minLength: 1 },
        toolType: { 
          type: 'string', 
          enum: Object.keys(CANONICAL_TOOL_SCHEMAS) as ToolType[]
        },
        inputSchema: { 
          type: 'object',
          description: 'Optional schema that must match canonical schema for toolType'
        },
        version: { type: 'string' }
      },
      required: ['name', 'description', 'toolType'],
      additionalProperties: false
    } as const,
    handler: handleAdminRegisterTool
  },
  {
    name: 'admin/unregisterTool',
    description: 'Unregister a dynamic tool',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 }
      },
      required: ['name'],
      additionalProperties: false
    } as const,
    handler: handleAdminUnregisterTool
  }
] as const;