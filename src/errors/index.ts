/**
 * Error handling module exports.
 * Provides all error codes, types, and helper functions for error handling.
 */

export {
  ErrorCode,
  ToolCompletionOutcome,
  JSON_RPC_ERROR_CODES,
  createError,
  toJsonRpcError,
  toToolError,
} from './errorHandler.js';

export type { StructuredError } from './errorHandler.js';
