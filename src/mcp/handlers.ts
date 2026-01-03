/**
 * Protocol handlers module for the MCP server.
 * Implements the MCP protocol lifecycle including initialization,
 * tool listing, and tool invocation with proper state management.
 */

import type { SessionContext, SessionState } from './session.js';
import type { StructuredLogger } from '../logging/structuredLogger.js';
import type { ServerConfig } from '../config/configManager.js';
import type { ToolRegistry } from './toolRegistry.js';
import type { StructuredError } from '../errors/errorHandler.js';
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
  (session as SessionContext & { state: SessionState }).state = 'INITIALIZING';

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
  (session as SessionContext & { state: SessionState }).state = 'RUNNING';

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
  (session as SessionContext & { state: SessionState }).state = 'CLOSED';
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
  toolRegistry: ToolRegistry, // Fixed type
  config: ServerConfig
): ToolsListResult {
  // Get all registered tools from registry (already sorted lexicographically)
  const allTools = toolRegistry.list();
  
  // Check if dynamic registration is effective
  const isDynamicRegistrationEffective = 
    config.tools.adminRegistrationEnabled && config.security.dynamicRegistrationEnabled;
  
  // Filter out admin tools if dynamic registration is not effective
  const filteredTools = allTools.filter((tool) => {
    // If tool is marked as admin tool and dynamic registration is not effective, exclude it
    if ('isAdminTool' in tool && tool.isAdminTool && !isDynamicRegistrationEffective) {
      return false;
    }
    return true;
  });
  
  // Map to MCP tools/list response format
  const tools = filteredTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.version ? { version: tool.version } : {}),
  }));
  
  session.logger.debug('Returning tools list', {
    toolCount: tools.length,
    toolNames: tools.map((t: { name: string }) => t.name),
  });
  
  return { tools };
}

/**
 * Handles JSON parse errors (-32700).
 * Returns a JSON-RPC error response with id: null since request couldn't be parsed.
 * 
 * @param session - Session context for this connection
 * @returns JSON-RPC error response for parse error
 */
export function handleParseError(session: SessionContext): ReturnType<typeof toJsonRpcError> {
  return toJsonRpcError(
    JSON_RPC_ERROR_CODES.PARSE_ERROR,
    'Parse error',
    {
      code: 'PARSE_ERROR',
      message: 'Invalid JSON',
      correlationId: session.connectionCorrelationId,
    },
    null // Parse errors always have id: null
  );
}

/**
 * Handles invalid JSON-RPC request structure (-32600).
 * Returns a JSON-RPC error response with id: null since request structure is invalid.
 * 
 * @param session - Session context for this connection
 * @returns JSON-RPC error response for invalid request
 */
export function handleInvalidRequest(session: SessionContext): ReturnType<typeof toJsonRpcError> {
  return toJsonRpcError(
    JSON_RPC_ERROR_CODES.INVALID_REQUEST,
    'Invalid Request',
    {
      code: 'INVALID_REQUEST',
      message: 'Invalid JSON-RPC request structure',
      correlationId: session.connectionCorrelationId,
    },
    null // Invalid requests have id: null
  );
}

/**
 * Tool result wrapper interface for MCP tool responses.
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

/**
 * Wraps a successful tool result in MCP format.
 * Converts any result type to a structured tool response.
 * Handles serialization errors by returning error responses.
 * 
 * @param result - The result data from tool execution
 * @param ctx - Request context with correlation IDs
 * @returns Wrapped tool result with content array
 */
export function wrapResult(result: unknown, ctx: RequestContext): ToolResult {
  try {
    // For simple primitive types, return them directly as expected by tests
    if (result === null || typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: false,
      };
    }

    // For arrays and objects, return them directly as expected by tests
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      isError: false,
    };
  } catch (_error) {
    // Handle serialization errors (circular references, BigInt, etc.)
    const errorData = {
      code: ErrorCode.Internal,
      message: 'Result not serializable',
      details: { reason: 'result_not_serializable' },
      correlationId: ctx.correlationId,
      ...(ctx.runId && { runId: ctx.runId }),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(errorData) }],
      isError: true,
    };
  }
}

/**
 * Wraps a tool error in MCP format.
 * Converts StructuredError to a tool error response.
 * 
 * @param error - The structured error from tool execution
 * @param ctx - Request context with correlation IDs
 * @returns Wrapped tool error with content array
 */
export function wrapToolError(error: StructuredError, ctx: RequestContext): ToolResult {
  const errorData = {
    code: error.code,
    message: error.message,
    ...(error.details && { details: error.details }),
    correlationId: ctx.correlationId,
    ...(ctx.runId && { runId: ctx.runId }),
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(errorData) }],
    isError: true,
  };
}

/**
 * Tool completion outcome enumeration.
 * Tracks different ways a tool invocation can complete.
 */
export enum ToolCompletionOutcome {
  Success = 'success',
  ToolError = 'tool_error',
  Timeout = 'timeout',
  LateCompleted = 'late_completed',
  Aborted = 'aborted',
  DisconnectedCompleted = 'disconnected_completed',
  ProtocolError = 'protocol_error',
}

/**
 * Tool completion record interface for structured logging.
 */
export interface ToolCompletionRecord {
  runId: string;
  correlationId: string;
  toolName: string;
  durationMs: number;
  outcome: ToolCompletionOutcome;
  errorCode?: ErrorCode;
  payloadBytes?: number;
}

/**
 * Logs tool completion with structured data.
 * Records tool execution metrics and outcomes for monitoring.
 * 
 * @param logger - Structured logger instance
 * @param record - Tool completion record with metrics
 * @param level - Log level (defaults to 'info')
 */
export function logToolCompletion(
  logger: StructuredLogger,
  record: ToolCompletionRecord,
  level: 'debug' | 'info' | 'warn' | 'error' = 'info'
): void {
  const logData = {
    runId: record.runId,
    correlationId: record.correlationId,
    toolName: record.toolName,
    durationMs: record.durationMs,
    outcome: record.outcome,
    ...(record.errorCode && { errorCode: record.errorCode }),
    ...(record.payloadBytes && { payloadBytes: record.payloadBytes }),
  };

  // Apply redaction and sanitization to the log data
  const sanitizedData = logger.sanitize(logger.redact(logData)) as Record<string, unknown>;
  
  logger[level](`Tool invocation completed: ${record.toolName}`, sanitizedData);
}

/**
 * Logs late tool completion with warning level.
 * Used when a tool completes after its response has already been sent.
 * 
 * @param logger - Structured logger instance
 * @param runId - Tool execution run ID
 * @param correlationId - Request correlation ID
 * @param toolName - Name of the tool that completed late
 * @param durationMs - Total execution duration in milliseconds
 * @param errorCode - Optional error code if tool failed
 * @param payloadBytes - Optional payload size in bytes
 */
export function logLateToolCompletion(
  logger: StructuredLogger,
  runId: string,
  correlationId: string,
  toolName: string,
  durationMs: number,
  errorCode?: ErrorCode,
  payloadBytes?: number
): void {
  logToolCompletion(
    logger,
    {
      runId,
      correlationId,
      toolName,
      durationMs,
      outcome: ToolCompletionOutcome.LateCompleted,
      ...(errorCode && { errorCode }),
      ...(payloadBytes && { payloadBytes }),
    },
    'warn'
  );
}

/**
 * Logs disconnect-triggered tool completion.
 * Used when a tool completes after the client has disconnected.
 * Only allows disconnect-triggered outcomes.
 * 
 * @param logger - Structured logger instance
 * @param runId - Tool execution run ID
 * @param correlationId - Request correlation ID
 * @param toolName - Name of the tool that completed
 * @param durationMs - Total execution duration in milliseconds
 * @param outcome - Disconnect-triggered completion outcome
 * @param errorCode - Optional error code if tool failed
 * @param payloadBytes - Optional payload size in bytes
 */
export function logDisconnectTriggeredCompletion(
  logger: StructuredLogger,
  runId: string,
  correlationId: string,
  toolName: string,
  durationMs: number,
  outcome: ToolCompletionOutcome,
  errorCode?: ErrorCode,
  payloadBytes?: number
): void {
  // Validate that only disconnect-triggered outcomes are allowed
  const validOutcomes = [
    ToolCompletionOutcome.DisconnectedCompleted,
    ToolCompletionOutcome.Aborted,
    ToolCompletionOutcome.LateCompleted,
  ];

  if (!validOutcomes.includes(outcome)) {
    throw new Error(`Invalid disconnect-triggered outcome: ${outcome}. Must be one of: ${validOutcomes.join(', ')}`);
  }

  logToolCompletion(
    logger,
    {
      runId,
      correlationId,
      toolName,
      durationMs,
      outcome,
      ...(errorCode && { errorCode }),
      ...(payloadBytes && { payloadBytes }),
    },
    'warn'
  );
}

/**
 * Handles method not found errors (-32601).
 * Returns a JSON-RPC error response when a requested method doesn't exist.
 * 
 * @param session - Session context for this connection
 * @param methodName - Name of the method that was not found
 * @param requestId - Optional request ID from the original request
 * @returns JSON-RPC error response for method not found
 */
export function handleMethodNotFound(
  session: SessionContext,
  methodName: string,
  requestId?: string | number | null
): ReturnType<typeof toJsonRpcError> {
  return toJsonRpcError(
    JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
    `Method not found: ${methodName}`,
    {
      code: 'METHOD_NOT_FOUND',
      message: `Unknown method: ${methodName}`,
      correlationId: session.connectionCorrelationId,
    },
    requestId ?? null
  );
}

/**
 * Handles invalid method parameters errors (-32602).
 * Returns a JSON-RPC error response when method parameters are invalid.
 * 
 * @param session - Session context for this connection
 * @param details - Optional details about the parameter validation error
 * @param requestId - Optional request ID from the original request
 * @returns JSON-RPC error response for invalid parameters
 */
export function handleInvalidParams(
  session: SessionContext,
  details?: string,
  requestId?: string | number | null
): ReturnType<typeof toJsonRpcError> {
  const message = details !== undefined ? `Invalid params: ${details}` : 'Invalid params';
  const dataMessage = details ?? 'Invalid method parameters';
  
  return toJsonRpcError(
    JSON_RPC_ERROR_CODES.INVALID_PARAMS,
    message,
    {
      code: 'INVALID_PARAMS',
      message: dataMessage,
      correlationId: session.connectionCorrelationId,
    },
    requestId ?? null
  );
}
