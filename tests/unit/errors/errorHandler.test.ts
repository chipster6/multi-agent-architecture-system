import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  ToolCompletionOutcome,
  createError,
  toJsonRpcError,
  toToolError,
  JSON_RPC_ERROR_CODES,
  StructuredError,
} from '../../../src/errors/errorHandler';

describe('ErrorCode enum', () => {
  it('should define all required error codes', () => {
    expect(ErrorCode.InvalidArgument).toBe('INVALID_ARGUMENT');
    expect(ErrorCode.NotFound).toBe('NOT_FOUND');
    expect(ErrorCode.Timeout).toBe('TIMEOUT');
    expect(ErrorCode.ResourceExhausted).toBe('RESOURCE_EXHAUSTED');
    expect(ErrorCode.Internal).toBe('INTERNAL');
    expect(ErrorCode.Unauthorized).toBe('UNAUTHORIZED');
    expect(ErrorCode.NotInitialized).toBe('NOT_INITIALIZED');
  });

  it('should have exactly 7 error codes', () => {
    const codes = Object.values(ErrorCode);
    expect(codes).toHaveLength(7);
  });
});

describe('ToolCompletionOutcome enum', () => {
  it('should define all required completion outcomes', () => {
    expect(ToolCompletionOutcome.Success).toBe('success');
    expect(ToolCompletionOutcome.ToolError).toBe('tool_error');
    expect(ToolCompletionOutcome.Timeout).toBe('timeout');
    expect(ToolCompletionOutcome.LateCompleted).toBe('late_completed');
    expect(ToolCompletionOutcome.Aborted).toBe('aborted');
    expect(ToolCompletionOutcome.DisconnectedCompleted).toBe('disconnected_completed');
    expect(ToolCompletionOutcome.ProtocolError).toBe('protocol_error');
  });

  it('should have exactly 7 completion outcomes', () => {
    const outcomes = Object.values(ToolCompletionOutcome);
    expect(outcomes).toHaveLength(7);
  });
});

describe('JSON_RPC_ERROR_CODES constants', () => {
  it('should define all required JSON-RPC error codes', () => {
    expect(JSON_RPC_ERROR_CODES.PARSE_ERROR).toBe(-32700);
    expect(JSON_RPC_ERROR_CODES.INVALID_REQUEST).toBe(-32600);
    expect(JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND).toBe(-32601);
    expect(JSON_RPC_ERROR_CODES.INVALID_PARAMS).toBe(-32602);
    expect(JSON_RPC_ERROR_CODES.INTERNAL_ERROR).toBe(-32603);
    expect(JSON_RPC_ERROR_CODES.NOT_INITIALIZED).toBe(-32002);
  });

  it('should have exactly 6 JSON-RPC error codes', () => {
    const codes = Object.values(JSON_RPC_ERROR_CODES);
    expect(codes).toHaveLength(6);
  });
});

describe('createError()', () => {
  it('should create a StructuredError with code and message', () => {
    const error = createError(ErrorCode.InvalidArgument, 'Invalid input');
    expect(error).toEqual({
      code: ErrorCode.InvalidArgument,
      message: 'Invalid input',
    });
  });

  it('should create a StructuredError with details', () => {
    const details = { field: 'name', reason: 'required' };
    const error = createError(ErrorCode.InvalidArgument, 'Invalid input', details);
    expect(error).toEqual({
      code: ErrorCode.InvalidArgument,
      message: 'Invalid input',
      details,
    });
  });

  it('should not include details property if not provided', () => {
    const error = createError(ErrorCode.NotFound, 'Tool not found');
    expect(error).not.toHaveProperty('details');
  });

  it('should create errors with all error codes', () => {
    const codes = Object.values(ErrorCode);
    codes.forEach((code) => {
      const error = createError(code, 'Test message');
      expect(error.code).toBe(code);
      expect(error.message).toBe('Test message');
    });
  });

  it('should not include runId or correlationId by default', () => {
    const error = createError(ErrorCode.Internal, 'Internal error');
    expect(error).not.toHaveProperty('runId');
    expect(error).not.toHaveProperty('correlationId');
  });
});

describe('toJsonRpcError()', () => {
  it('should create a JSON-RPC error response with id', () => {
    const response = toJsonRpcError(
      JSON_RPC_ERROR_CODES.INVALID_PARAMS,
      'Invalid parameters',
      undefined,
      '123'
    );
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: '123',
      error: {
        code: JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        message: 'Invalid parameters',
      },
    });
  });

  it('should create a JSON-RPC error response with null id for parse errors', () => {
    const response = toJsonRpcError(
      JSON_RPC_ERROR_CODES.PARSE_ERROR,
      'Parse error',
      undefined,
      null
    );
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: JSON_RPC_ERROR_CODES.PARSE_ERROR,
        message: 'Parse error',
      },
    });
  });

  it('should default id to null if not provided', () => {
    const response = toJsonRpcError(
      JSON_RPC_ERROR_CODES.INVALID_REQUEST,
      'Invalid request'
    );
    expect(response.id).toBeNull();
  });

  it('should include data in error response when provided', () => {
    const data = { code: 'NOT_INITIALIZED', message: 'Server not initialized' };
    const response = toJsonRpcError(
      JSON_RPC_ERROR_CODES.NOT_INITIALIZED,
      'Not initialized',
      data,
      '456'
    );
    expect(response.error.data).toEqual(data);
  });

  it('should not include data property if not provided', () => {
    const response = toJsonRpcError(
      JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
      'Method not found',
      undefined,
      '789'
    );
    expect(response.error).not.toHaveProperty('data');
  });

  it('should handle numeric id', () => {
    const response = toJsonRpcError(
      JSON_RPC_ERROR_CODES.INVALID_PARAMS,
      'Invalid parameters',
      undefined,
      42
    );
    expect(response.id).toBe(42);
  });

  it('should always return jsonrpc version 2.0', () => {
    const response = toJsonRpcError(
      JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
      'Internal error'
    );
    expect(response.jsonrpc).toBe('2.0');
  });
});

describe('toToolError()', () => {
  it('should create a tool error response with correlationId', () => {
    const error = createError(ErrorCode.NotFound, 'Tool not found');
    const response = toToolError(error, {
      correlationId: 'corr-123',
    });

    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe('text');

    const parsedError = JSON.parse(response.content[0].text);
    expect(parsedError.code).toBe(ErrorCode.NotFound);
    expect(parsedError.message).toBe('Tool not found');
    expect(parsedError.correlationId).toBe('corr-123');
  });

  it('should include runId when provided', () => {
    const error = createError(ErrorCode.Timeout, 'Tool timeout');
    const response = toToolError(error, {
      correlationId: 'corr-456',
      runId: 'run-789',
    });

    const parsedError = JSON.parse(response.content[0].text);
    expect(parsedError.runId).toBe('run-789');
    expect(parsedError.correlationId).toBe('corr-456');
  });

  it('should not include runId when not provided', () => {
    const error = createError(ErrorCode.InvalidArgument, 'Invalid argument');
    const response = toToolError(error, {
      correlationId: 'corr-abc',
    });

    const parsedError = JSON.parse(response.content[0].text);
    expect(parsedError).not.toHaveProperty('runId');
  });

  it('should preserve error details', () => {
    const details = { field: 'arguments', reason: 'not_serializable' };
    const error = createError(ErrorCode.InvalidArgument, 'Invalid argument', details);
    const response = toToolError(error, {
      correlationId: 'corr-def',
    });

    const parsedError = JSON.parse(response.content[0].text);
    expect(parsedError.details).toEqual(details);
  });

  it('should return valid JSON in content', () => {
    const error = createError(ErrorCode.ResourceExhausted, 'Resource exhausted');
    const response = toToolError(error, {
      correlationId: 'corr-xyz',
    });

    expect(() => JSON.parse(response.content[0].text)).not.toThrow();
  });

  it('should always set isError to true', () => {
    const error = createError(ErrorCode.Internal, 'Internal error');
    const response = toToolError(error, {
      correlationId: 'corr-123',
    });

    expect(response.isError).toBe(true);
  });

  it('should always have exactly one content item', () => {
    const error = createError(ErrorCode.Unauthorized, 'Unauthorized');
    const response = toToolError(error, {
      correlationId: 'corr-456',
    });

    expect(response.content).toHaveLength(1);
  });

  it('should always use text type for content', () => {
    const error = createError(ErrorCode.NotFound, 'Not found');
    const response = toToolError(error, {
      correlationId: 'corr-789',
    });

    expect(response.content[0].type).toBe('text');
  });
});

describe('Error integration', () => {
  it('should create and wrap an error end-to-end', () => {
    const error = createError(
      ErrorCode.InvalidArgument,
      'Schema validation failed',
      { validationErrors: ['field required'] }
    );

    const response = toToolError(error, {
      correlationId: 'corr-integration',
      runId: 'run-integration',
    });

    expect(response.isError).toBe(true);
    const parsedError = JSON.parse(response.content[0].text);
    expect(parsedError.code).toBe(ErrorCode.InvalidArgument);
    expect(parsedError.message).toBe('Schema validation failed');
    expect(parsedError.details.validationErrors).toEqual(['field required']);
    expect(parsedError.correlationId).toBe('corr-integration');
    expect(parsedError.runId).toBe('run-integration');
  });

  it('should handle all error codes in tool error wrapping', () => {
    const codes = Object.values(ErrorCode);
    codes.forEach((code) => {
      const error = createError(code, `Error: ${code}`);
      const response = toToolError(error, {
        correlationId: 'corr-test',
      });

      const parsedError = JSON.parse(response.content[0].text);
      expect(parsedError.code).toBe(code);
    });
  });
});
