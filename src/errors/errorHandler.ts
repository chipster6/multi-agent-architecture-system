/**
 * Error handling module for the MCP server.
 * Provides structured error definitions, error codes, and helper functions
 * for creating and formatting errors in both tool and protocol contexts.
 */

/**
 * Enumeration of all error codes used throughout the MCP server.
 * These codes are used in StructuredError objects and JSON-RPC error responses.
 * 
 * Each error code represents a specific category of failure with defined semantics:
 * 
 * @example
 * ```typescript
 * // Creating a structured error
 * const error = createError(
 *   ErrorCode.InvalidArgument,
 *   'Tool arguments must be an object',
 *   { received: 'string' }
 * );
 * ```
 */
export enum ErrorCode {
  /** 
   * Invalid or malformed arguments provided to a tool or method.
   * Used when input validation fails or required parameters are missing.
   * 
   * @example Tool arguments not an object, missing required fields, invalid schema
   */
  InvalidArgument = 'INVALID_ARGUMENT',
  
  /** 
   * Requested resource, tool, or agent was not found.
   * Used when attempting to access non-existent entities.
   * 
   * @example Unknown tool name, unregistered agent ID, missing resource
   */
  NotFound = 'NOT_FOUND',
  
  /** 
   * Operation exceeded the configured timeout limit.
   * Used when tool execution or agent communication times out.
   * 
   * @example Tool execution exceeds defaultTimeoutMs, agent response timeout
   */
  Timeout = 'TIMEOUT',
  
  /** 
   * System resource limits exceeded (concurrency, payload size, memory).
   * Used when the server cannot accept more work due to resource constraints.
   * 
   * @example Max concurrent executions reached, payload too large, memory exhausted
   */
  ResourceExhausted = 'RESOURCE_EXHAUSTED',
  
  /** 
   * Internal server error or unexpected system failure.
   * Used when the server encounters an unexpected condition.
   * 
   * @example Unhandled exceptions, system failures, serialization errors
   */
  Internal = 'INTERNAL',
  
  /** 
   * Access denied due to insufficient permissions or authentication failure.
   * Used when admin operations are attempted without proper authorization.
   * 
   * @example Admin policy violations, invalid tokens, unauthorized transport
   */
  Unauthorized = 'UNAUTHORIZED',
  
  /** 
   * Server not properly initialized or in wrong state for the operation.
   * Used when protocol lifecycle requirements are not met.
   * 
   * @example Tools called before initialize/initialized sequence complete
   */
  NotInitialized = 'NOT_INITIALIZED',
}

/**
 * Enumeration of tool completion outcomes for structured logging and monitoring.
 * Used to track and log the final state of tool invocations across different scenarios.
 * 
 * These outcomes enable comprehensive observability of tool execution patterns,
 * timeout behavior, and system health monitoring.
 * 
 * @example
 * ```typescript
 * // Logging a tool completion
 * logger.info('Tool execution completed', {
 *   runId: 'run-123',
 *   toolName: 'analyze-requirements',
 *   outcome: ToolCompletionOutcome.Success,
 *   durationMs: 1500
 * });
 * ```
 */
export enum ToolCompletionOutcome {
  /** 
   * Tool executed successfully and returned a valid result.
   * The most common outcome for properly functioning tools.
   */
  Success = 'success',
  
  /** 
   * Tool handler threw an error or returned an error result.
   * Includes validation failures, business logic errors, and handled exceptions.
   */
  ToolError = 'tool_error',
  
  /** 
   * Tool execution exceeded the configured timeout limit.
   * Server returned TIMEOUT error to client, but handler may still be running.
   */
  Timeout = 'timeout',
  
  /** 
   * Tool handler completed after the timeout was already returned to client.
   * Handler finished work but response was not sent (logged for monitoring).
   */
  LateCompleted = 'late_completed',
  
  /** 
   * Tool handler was cancelled via AbortSignal and threw cancellation error.
   * Indicates proper cooperative cancellation behavior.
   */
  Aborted = 'aborted',
  
  /** 
   * Tool handler completed normally after client disconnected.
   * Handler finished work but client was no longer connected to receive response.
   */
  DisconnectedCompleted = 'disconnected_completed',
  
  /** 
   * Protocol-level error occurred (invalid request format, state violations).
   * Distinct from tool-level errors, indicates MCP protocol issues.
   */
  ProtocolError = 'protocol_error',
}

/**
 * Structured error object used throughout the system for consistent error handling.
 * Provides comprehensive error information with optional correlation and run IDs
 * for distributed tracing and debugging.
 * 
 * This interface standardizes error representation across all system components,
 * enabling consistent error handling, logging, and client communication.
 * 
 * @example
 * ```typescript
 * // Tool validation error
 * const error: StructuredError = {
 *   code: ErrorCode.InvalidArgument,
 *   message: 'Tool arguments must be an object',
 *   details: { 
 *     received: typeof arguments,
 *     expected: 'object',
 *     toolName: 'analyze-requirements'
 *   },
 *   runId: 'run-abc123',
 *   correlationId: 'req-def456'
 * };
 * 
 * // Resource exhaustion error
 * const resourceError: StructuredError = {
 *   code: ErrorCode.ResourceExhausted,
 *   message: 'Maximum concurrent executions reached',
 *   details: {
 *     current: 10,
 *     maximum: 10,
 *     reason: 'concurrency_limit'
 *   },
 *   correlationId: 'req-789'
 * };
 * ```
 */
export interface StructuredError {
  /** 
   * Error code categorizing the type of failure.
   * Used for programmatic error handling and client decision making.
   */
  code: ErrorCode;
  
  /** 
   * Human-readable error message describing what went wrong.
   * Should be clear and actionable for developers and operators.
   */
  message: string;
  
  /** 
   * Optional additional context about the error.
   * Can include validation details, system state, or debugging information.
   * 
   * @example { received: 'string', expected: 'object', field: 'arguments' }
   */
  details?: Record<string, unknown>;
  
  /** 
   * Optional run ID for tool invocations.
   * Links the error to a specific tool execution for tracing.
   * Only present for tool-related errors, not protocol errors.
   */
  runId?: string;
  
  /** 
   * Optional correlation ID for request tracking.
   * Links the error to a specific client request or operation chain.
   * Present for both tool errors and protocol errors.
   */
  correlationId?: string;
}

/**
 * JSON-RPC error code constants per JSON-RPC 2.0 specification.
 * 
 * These codes are used in JSON-RPC error responses to indicate protocol-level
 * failures. They follow the standard JSON-RPC 2.0 error code ranges:
 * - -32700 to -32000: Reserved for pre-defined errors
 * - -32099 to -32000: Server error range (implementation-defined)
 * 
 * @see https://www.jsonrpc.org/specification#error_object
 * 
 * @example
 * ```typescript
 * // Creating a JSON-RPC error response
 * const errorResponse = {
 *   jsonrpc: '2.0',
 *   error: {
 *     code: JSON_RPC_ERROR_CODES.INVALID_PARAMS,
 *     message: 'Invalid method parameter(s)',
 *     data: { correlationId: 'req-123' }
 *   },
 *   id: request.id
 * };
 * ```
 */
export const JSON_RPC_ERROR_CODES = {
  /** 
   * Parse error (-32700): Invalid JSON was received by the server.
   * An error occurred on the server while parsing the JSON text.
   * Response includes id: null since request ID cannot be determined.
   */
  PARSE_ERROR: -32700,
  
  /** 
   * Invalid Request (-32600): The JSON sent is not a valid Request object.
   * Missing required fields, wrong types, or malformed request structure.
   */
  INVALID_REQUEST: -32600,
  
  /** 
   * Method not found (-32601): The method does not exist or is not available.
   * Used when client calls an unknown or unsupported MCP method.
   */
  METHOD_NOT_FOUND: -32601,
  
  /** 
   * Invalid params (-32602): Invalid method parameter(s).
   * Used when method parameters don't match the expected schema or format.
   */
  INVALID_PARAMS: -32602,
  
  /** 
   * Internal error (-32603): Internal JSON-RPC error.
   * Used for server-side errors that don't fit other categories.
   */
  INTERNAL_ERROR: -32603,
  
  /** 
   * Not initialized (-32002): Server not initialized.
   * MCP-specific error for operations attempted before initialization complete.
   * Used when tools/call or other methods are called before RUNNING state.
   */
  NOT_INITIALIZED: -32002,
} as const;

/**
 * Factory function to create a StructuredError with consistent formatting.
 * 
 * This is the preferred way to create StructuredError objects throughout the system,
 * ensuring consistent structure and enabling future enhancements like automatic
 * correlation ID injection or error tracking.
 * 
 * @param code - The error code categorizing the failure type
 * @param message - Human-readable error message describing what went wrong
 * @param details - Optional additional context about the error
 * @returns A new StructuredError object ready for logging or client response
 * 
 * @example
 * ```typescript
 * // Simple error
 * const error = createError(
 *   ErrorCode.NotFound,
 *   'Tool "unknown-tool" not found'
 * );
 * 
 * // Error with details
 * const validationError = createError(
 *   ErrorCode.InvalidArgument,
 *   'Tool arguments validation failed',
 *   {
 *     field: 'arguments.projectData',
 *     received: 'string',
 *     expected: 'object',
 *     toolName: 'analyze-requirements'
 *   }
 * );
 * 
 * // Resource exhaustion with metrics
 * const resourceError = createError(
 *   ErrorCode.ResourceExhausted,
 *   'Maximum concurrent executions reached',
 *   {
 *     current: 10,
 *     maximum: 10,
 *     queueLength: 5,
 *     suggestion: 'Retry with exponential backoff'
 *   }
 * );
 * ```
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
 * 
 * Creates properly formatted JSON-RPC 2.0 error responses for protocol-level
 * and state errors. Handles ID management according to JSON-RPC specification
 * (null for parse errors, original request ID otherwise).
 * 
 * Used for protocol-level errors like parse failures, invalid requests,
 * method not found, and state violations (not initialized).
 * 
 * @param code - JSON-RPC error code from JSON_RPC_ERROR_CODES
 * @param message - Human-readable error message
 * @param data - Optional error data (typically a StructuredError with correlationId)
 * @param id - JSON-RPC request ID (null for parse errors, original ID otherwise)
 * @returns A complete JSON-RPC 2.0 error response object
 * 
 * @example
 * ```typescript
 * // Parse error (id is null)
 * const parseError = toJsonRpcError(
 *   JSON_RPC_ERROR_CODES.PARSE_ERROR,
 *   'Invalid JSON',
 *   { correlationId: session.connectionCorrelationId },
 *   null
 * );
 * 
 * // Method not found (preserve request ID)
 * const methodError = toJsonRpcError(
 *   JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
 *   'Method "unknown-method" not found',
 *   { correlationId: 'req-123', method: 'unknown-method' },
 *   request.id
 * );
 * 
 * // State error with StructuredError data
 * const stateError = createError(
 *   ErrorCode.NotInitialized,
 *   'Server not initialized',
 *   { state: 'STARTING', correlationId: 'req-456' }
 * );
 * const response = toJsonRpcError(
 *   JSON_RPC_ERROR_CODES.NOT_INITIALIZED,
 *   'Not initialized',
 *   stateError,
 *   request.id
 * );
 * ```
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
 * Helper function to wrap a StructuredError for MCP tools/call error responses.
 * 
 * Converts StructuredError objects into the MCP tools/call error format with
 * proper correlation and run ID enrichment. Ensures consistent error response
 * structure for all tool-related failures.
 * 
 * The function enriches the error with context information and formats it
 * according to MCP specification requirements for tool error responses.
 * 
 * @param error - The StructuredError to wrap (from createError or validation)
 * @param ctx - Request context containing correlation and optional run IDs
 * @returns A properly formatted MCP tools/call error response
 * 
 * @example
 * ```typescript
 * // Tool validation error
 * const validationError = createError(
 *   ErrorCode.InvalidArgument,
 *   'Tool arguments must be an object',
 *   { received: 'string', expected: 'object' }
 * );
 * 
 * const toolResponse = toToolError(validationError, {
 *   correlationId: 'req-123',
 *   runId: 'run-456'
 * });
 * // Returns:
 * // {
 * //   content: [{ 
 * //     type: 'text', 
 * //     text: '{"code":"INVALID_ARGUMENT","message":"Tool arguments must be an object","details":{"received":"string","expected":"object"},"correlationId":"req-123","runId":"run-456"}'
 * //   }],
 * //   isError: true
 * // }
 * 
 * // Resource exhaustion error (no runId for rejected calls)
 * const resourceError = createError(
 *   ErrorCode.ResourceExhausted,
 *   'Maximum concurrent executions reached'
 * );
 * 
 * const rejectionResponse = toToolError(resourceError, {
 *   correlationId: 'req-789'
 *   // runId omitted for pre-execution rejections
 * });
 * ```
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
