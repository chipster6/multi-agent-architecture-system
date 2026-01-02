/**
 * Error handling module for the MCP server.
 * Provides structured error definitions, error codes, and helper functions
 * for creating and formatting errors in both tool and protocol contexts.
 */

/**
 * Enumeration of all error codes used throughout the MCP server.
 * These codes are used in StructuredError objects and JSON-RPC error responses.
 */
export enum ErrorCode {
  InvalidArgument = 'INVALID_ARGUMENT',
  NotFound = 'NOT_FOUND',
  Timeout = 'TIMEOUT',
  ResourceExhausted = 'RESOURCE_EXHAUSTED',
  Internal = 'INTERNAL',
  Unauthorized = 'UNAUTHORIZED',
  NotInitialized = 'NOT_INITIALIZED',
}

/**
 * Enumeration of tool completion outcomes.
 * Used to track and log the final state of tool invocations.
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
 * Structured error object used throughout the system.
 * Provides consistent error representation with optional correlation and run IDs.
 */
export interface StructuredError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  runId?: string;
  correlationId?: string;
}

/**
 * JSON-RPC error code constants per JSON-RPC 2.0 specification.
 */
export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  NOT_INITIALIZED: -32002,
} as const;

/**
 * Factory function to create a StructuredError.
 * @param code - The error code
 * @param message - Human-readable error message
 * @param details - Optional error details
 * @returns A new StructuredError object
 */
export function createError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): StructuredError {
  return {
    code,
    message,
    ...(details && { details }),
  };
}

/**
 * Helper function to convert a StructuredError to a JSON-RPC error response.
 * Used for protocol-level and state errors.
 * @param code - JSON-RPC error code
 * @param message - Error message
 * @param data - Optional error data (typically a StructuredError)
 * @param id - JSON-RPC request ID (can be null for parse errors)
 * @returns A JSON-RPC error response object
 */
export function toJsonRpcError(
  code: number,
  message: string,
  data?: unknown,
  id?: string | number | null
): {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
} {
  const error: {
    code: number;
    message: string;
    data?: unknown;
  } = {
    code,
    message,
  };

  if (data !== undefined) {
    error.data = data;
  }

  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error,
  };
}

/**
 * Helper function to convert a StructuredError to a tool error response.
 * Used for tools/call error responses.
 * @param error - The StructuredError to wrap
 * @param ctx - Request context with correlation and run IDs
 * @returns A tools/call error response object
 */
export function toToolError(
  error: StructuredError,
  ctx: {
    correlationId: string;
    runId?: string;
  }
): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  const enrichedError: StructuredError = {
    ...error,
    correlationId: ctx.correlationId,
  };

  if (ctx.runId !== undefined) {
    enrichedError.runId = ctx.runId;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(enrichedError),
      },
    ],
    isError: true,
  };
}
