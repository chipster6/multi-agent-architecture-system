/**
 * Protocol handlers module for the MCP server.
 * Implements the MCP protocol lifecycle including initialization,
 * tool listing, and tool invocation with proper state management.
 */

import type { SessionContext } from './session.js';
import type { StructuredLogger } from '../logging/structuredLogger.js';
import type { ServerConfig } from '../config/configManager.js';
import { ErrorCode, createError, toJsonRpcError, JSON_RPC_ERROR_CODES } from '../errors/errorHandler.js';

/**
 * Request context interface for protocol handlers.
 * Contains correlation IDs, transport info, and logging context.
 */
export interface RequestContext {
  correlationId: string;
  runId?: string; // set for tools/call only
  transport: { type: 'stdio' | 'sse' | 'http' };
  connectionCorrelationId: string; // always present
  logger: StructuredLogger;
}

/**
 * Initialize result interface per MCP specification.
 */
export interface InitializeResult {
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  capabilities: { tools?: Record<string, unknown> };
}

/**
 * Initialize parameters interface.
 */
export interface InitializeParams {
  protocolVersion: string;
  clientInfo?: { name?: string; version?: string };
  capabilities?: Record<string, unknown>;
}

/**
 * Handles the initialize request.
 * Transitions session state from STARTING to INITIALIZING.
 * Returns server information and capabilities.
 * 
 * @param params - Initialize parameters from client
 * @param session - Session context for this connection
 * @param config - Server configuration
 * @returns InitializeResult with server info and capabilities
 * 
 * @throws Error if session is not in STARTING state
 */
export function handleInitialize(
  params: InitializeParams,
  session: SessionContext,
  config: ServerConfig
): InitializeResult {
  // Transition state from STARTING to INITIALIZING
  if (session.state !== 'STARTING') {
    throw createError(
      ErrorCode.NotInitialized,
      `Cannot initialize: session already in ${session.state} state`
    );
  }

  // Update session state to INITIALIZING
  (session as any).state = 'INITIALIZING';

  session.logger.info('Client initializing', {
    clientInfo: params.clientInfo,
    protocolVersion: params.protocolVersion,
  });

  return {
    protocolVersion: '2024-11-05',
    serverInfo: {
      name: config.server.name,
      version: config.server.version,
    },
    capabilities: {
      tools: {},
    },
  };
}

/**
 * Handles the initialized notification.
 * Transitions session state from INITIALIZING to RUNNING.
 * After this, all MCP methods are allowed.
 * 
 * @param session - Session context for this connection
 * 
 * @throws Error if session is not in INITIALIZING state
 */
export function handleInitialized(session: SessionContext): void {
  // Transition state from INITIALIZING to RUNNING
  if (session.state !== 'INITIALIZING') {
    throw createError(
      ErrorCode.NotInitialized,
      `Cannot complete initialization: session in ${session.state} state, expected INITIALIZING`
    );
  }

  // Update session state to RUNNING
  (session as any).state = 'RUNNING';

  session.logger.info('Protocol initialization complete, session RUNNING');
}

/**
 * Enforces the strict initialization gate.
 * Blocks all methods except initialize and initialized before RUNNING state.
 * 
 * @param session - Session context for this connection
 * @param methodName - Name of the method being called
 * @returns JSON-RPC error response if gate is violated, undefined if allowed
 */
export function enforceInitializationGate(
  session: SessionContext,
  methodName: string
): ReturnType<typeof toJsonRpcError> | undefined {
  // Allow initialize and initialized at any state
  if (methodName === 'initialize' || methodName === 'initialized') {
    return undefined;
  }

  // Block all other methods before RUNNING
  if (session.state !== 'RUNNING') {
    const error = createError(
      ErrorCode.NotInitialized,
      'Server not initialized'
    );

    return toJsonRpcError(
      JSON_RPC_ERROR_CODES.NOT_INITIALIZED,
      'Not initialized',
      {
        code: error.code,
        message: error.message,
        correlationId: session.connectionCorrelationId,
      },
      undefined // id will be set by caller if available
    );
  }

  return undefined;
}

/**
 * Marks a session as closed.
 * Prevents further responses from being written to this connection.
 * 
 * @param session - Session context to close
 */
export function closeSession(session: SessionContext): void {
  (session as any).state = 'CLOSED';
  session.logger.info('Session closed');
}

/**
 * Checks if a session is closed.
 * 
 * @param session - Session context to check
 * @returns true if session is in CLOSED state
 */
export function isSessionClosed(session: SessionContext): boolean {
  return session.state === 'CLOSED';
}

/**
 * Tools list result interface per MCP specification.
 */
export interface ToolsListResult {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    version?: string;
  }>;
}

/**
 * Handles the tools/list request.
 * Returns all registered tools from the ToolRegistry.
 * Excludes admin tools when dynamic registration is not effective.
 * 
 * @param session - Session context for this connection
 * @param toolRegistry - Tool registry to get tools from
 * @param config - Server configuration for admin policy checks
 * @returns ToolsListResult with all available tools
 */
export function handleToolsList(
  session: SessionContext,
  toolRegistry: any, // TODO: Import proper type when available
  config: ServerConfig
): ToolsListResult {
  // Get all registered tools from registry (already sorted lexicographically)
  const allTools = toolRegistry.list();
  
  // Check if dynamic registration is effective
  const isDynamicRegistrationEffective = 
    config.tools.adminRegistrationEnabled && config.security.dynamicRegistrationEnabled;
  
  // Filter out admin tools if dynamic registration is not effective
  const filteredTools = allTools.filter((tool: any) => {
    // If tool is marked as admin tool and dynamic registration is not effective, exclude it
    if (tool.isAdminTool && !isDynamicRegistrationEffective) {
      return false;
    }
    return true;
  });
  
  // Map to MCP tools/list response format
  const tools = filteredTools.map((tool: any) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.version && { version: tool.version }),
  }));
  
  session.logger.debug('Returning tools list', {
    toolCount: tools.length,
    toolNames: tools.map((t: any) => t.name),
  });
  
  return { tools };
}
