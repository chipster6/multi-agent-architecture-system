/**
 * Integration tests for MCP protocol error handling.
 * 
 * Tests JSON-RPC 2.0 error responses for various protocol violations
 * including parse errors, invalid requests, method not found, and
 * invalid parameters as specified in the requirements.
 * 
 * Requirements tested:
 * - 6.1: Protocol error handling
 * - 6.2: Error response format
 * - 6.4: Correlation ID handling
 * - 8.3: Integration test coverage
 * 
 * Updated with Context7 consultation findings:
 * - Strict JSON-RPC 2.0 compliance validation
 * - Proper id handling per specification
 * - connectionCorrelationId fallback for parse errors
 * - Direct protocol handler testing approach
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSession } from '../../src/mcp/session.js';
import { 
  handleParseError,
  handleInvalidRequest,
  handleMethodNotFound,
  handleInvalidParams
} from '../../src/mcp/handlers.js';
import { createConfigManager } from '../../src/config/configManager.js';
import { StructuredLogger, SystemClock } from '../../src/logging/structuredLogger.js';
import { ProductionIdGenerator } from '../../src/shared/idGenerator.js';
import type { SessionContext } from '../../src/mcp/session.js';
import type { ServerConfig } from '../../src/config/configManager.js';

describe('Protocol Error Integration Tests', () => {
  let session: SessionContext;
  let config: ServerConfig;
  let logger: StructuredLogger;
  let idGenerator: ProductionIdGenerator;

  beforeEach(() => {
    // Initialize test components
    const configManager = createConfigManager();
    config = configManager.load();
    logger = new StructuredLogger(new SystemClock(), config.logging.redactKeys);
    idGenerator = new ProductionIdGenerator();

    // Create a fresh session for each test
    session = createSession(
      { type: 'stdio' },
      idGenerator,
      logger
    );

    // Clear any remaining mocks to prevent test interference
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any resources
    vi.clearAllMocks();
  });

  describe('Parse Error (-32700)', () => {
    it('should return parse error with id: null', () => {
      // Call parse error handler
      const result = handleParseError(session);

      // Validate JSON-RPC 2.0 compliance for parse error
      expect(result.jsonrpc).toBe('2.0');
      expect(result.id).toBe(null); // Parse errors always have id: null per JSON-RPC 2.0 spec
      expect(result.error).toBeDefined();
      expect(result.result).toBeUndefined();

      // Validate error structure
      expect(result.error!.code).toBe(-32700);
      expect(result.error!.message).toBe('Parse error');
      expect(typeof result.error!.message).toBe('string');
      expect(result.error!.message.length).toBeGreaterThan(0);
    });

    it('should include connectionCorrelationId in error.data.correlationId for parse errors', () => {
      // Call parse error handler
      const result = handleParseError(session);

      // Validate error data structure
      expect(result.error!.data).toBeDefined();
      const errorData = result.error!.data as any;

      // Parse errors use connectionCorrelationId since request correlation cannot be derived
      expect(errorData.correlationId).toBeDefined();
      expect(typeof errorData.correlationId).toBe('string');
      expect(errorData.correlationId.length).toBeGreaterThan(0);
      expect(errorData.correlationId).toBe(session.connectionCorrelationId);

      // Verify structured error data format
      expect(errorData.code).toBe('PARSE_ERROR');
      expect(errorData.message).toBeDefined();
      expect(typeof errorData.message).toBe('string');
    });

    it('should maintain consistent error structure across multiple parse errors', () => {
      // Generate multiple parse errors from the same session
      const error1 = handleParseError(session);
      const error2 = handleParseError(session);
      const error3 = handleParseError(session);

      // All should have the same structure and connectionCorrelationId
      const errors = [error1, error2, error3];
      
      errors.forEach((error, index) => {
        expect(error.jsonrpc).toBe('2.0');
        expect(error.id).toBe(null);
        expect(error.error!.code).toBe(-32700);
        expect(error.error!.message).toBe('Parse error');
        
        const errorData = error.error!.data as any;
        expect(errorData.correlationId).toBe(session.connectionCorrelationId);
        expect(errorData.code).toBe('PARSE_ERROR');
      });

      // All should have the same connectionCorrelationId
      const correlationIds = errors.map(e => (e.error!.data as any).correlationId);
      expect(new Set(correlationIds).size).toBe(1); // All should be the same
    });

    it('should validate parse error response is JSON serializable', () => {
      const result = handleParseError(session);

      // Should be able to serialize the entire response
      expect(() => JSON.stringify(result)).not.toThrow();

      // Verify serialized structure
      const serialized = JSON.stringify(result);
      const parsed = JSON.parse(serialized);
      
      expect(parsed.jsonrpc).toBe('2.0');
      expect(parsed.id).toBe(null);
      expect(parsed.error.code).toBe(-32700);
      expect(parsed.error.message).toBe('Parse error');
      expect(parsed.error.data.correlationId).toBe(session.connectionCorrelationId);
    });
  });

  describe('Invalid Request (-32600)', () => {
    it('should return invalid request error with id: null when id is bad/missing', () => {
      // Test with undefined id (missing)
      const resultUndefined = handleInvalidRequest(session, undefined);
      
      expect(resultUndefined.jsonrpc).toBe('2.0');
      expect(resultUndefined.id).toBe(null); // Bad/missing id returns null per JSON-RPC 2.0 spec
      expect(resultUndefined.error).toBeDefined();
      expect(resultUndefined.error!.code).toBe(-32600);
      expect(resultUndefined.error!.message).toBe('Invalid Request');

      // Test with null id (explicitly null)
      const resultNull = handleInvalidRequest(session, null);
      
      expect(resultNull.jsonrpc).toBe('2.0');
      expect(resultNull.id).toBe(null);
      expect(resultNull.error!.code).toBe(-32600);
      expect(resultNull.error!.message).toBe('Invalid Request');
    });

    it('should return invalid request error with original id when id is valid', () => {
      // Test with string id
      const resultString = handleInvalidRequest(session, 'test-id-123');
      
      expect(resultString.jsonrpc).toBe('2.0');
      expect(resultString.id).toBe('test-id-123');
      expect(resultString.error!.code).toBe(-32600);
      expect(resultString.error!.message).toBe('Invalid Request');

      // Test with numeric id
      const resultNumber = handleInvalidRequest(session, 42);
      
      expect(resultNumber.jsonrpc).toBe('2.0');
      expect(resultNumber.id).toBe(42);
      expect(resultNumber.error!.code).toBe(-32600);
      expect(resultNumber.error!.message).toBe('Invalid Request');
    });

    it('should include correlationId in error data for invalid request', () => {
      const result = handleInvalidRequest(session, 'test-id');

      expect(result.error!.data).toBeDefined();
      const errorData = result.error!.data as any;
      
      expect(errorData.correlationId).toBeDefined();
      expect(typeof errorData.correlationId).toBe('string');
      expect(errorData.correlationId).toBe(session.connectionCorrelationId);
      expect(errorData.code).toBe('INVALID_REQUEST');
      expect(errorData.message).toBeDefined();
    });

    it('should handle various invalid id types correctly', () => {
      // Test with object id (invalid per JSON-RPC 2.0)
      const resultObject = handleInvalidRequest(session, { invalid: 'id' } as any);
      expect(resultObject.id).toBe(null); // Invalid id types should return null

      // Test with array id (invalid per JSON-RPC 2.0)
      const resultArray = handleInvalidRequest(session, ['invalid', 'id'] as any);
      expect(resultArray.id).toBe(null); // Invalid id types should return null

      // Test with boolean id (invalid per JSON-RPC 2.0)
      const resultBoolean = handleInvalidRequest(session, true as any);
      expect(resultBoolean.id).toBe(null); // Invalid id types should return null
    });
  });

  describe('Method Not Found (-32601)', () => {
    it('should return method not found error with request id', () => {
      const methodName = 'unknown/method';
      const requestId = 'test-request-123';

      const result = handleMethodNotFound(session, methodName, requestId);

      expect(result.jsonrpc).toBe('2.0');
      expect(result.id).toBe(requestId); // Should preserve original request id
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(-32601);
      expect(result.error!.message).toBe(`Method not found: ${methodName}`);
    });

    it('should include method name in error message', () => {
      const testCases = [
        'tools/unknown',
        'resources/missing',
        'prompts/notfound',
        'admin/invalid',
        'completely/unknown/method'
      ];

      testCases.forEach((methodName, index) => {
        const result = handleMethodNotFound(session, methodName, index);
        
        expect(result.error!.message).toBe(`Method not found: ${methodName}`);
        expect(result.error!.message).toContain(methodName);
        expect(result.id).toBe(index);
      });
    });

    it('should handle different id types for method not found', () => {
      const methodName = 'unknown/method';

      // Test with string id
      const resultString = handleMethodNotFound(session, methodName, 'string-id');
      expect(resultString.id).toBe('string-id');
      expect(resultString.error!.code).toBe(-32601);

      // Test with numeric id
      const resultNumber = handleMethodNotFound(session, methodName, 999);
      expect(resultNumber.id).toBe(999);
      expect(resultNumber.error!.code).toBe(-32601);

      // Test with null id
      const resultNull = handleMethodNotFound(session, methodName, null);
      expect(resultNull.id).toBe(null);
      expect(resultNull.error!.code).toBe(-32601);
    });

    it('should include correlationId in method not found error data', () => {
      const result = handleMethodNotFound(session, 'unknown/method', 'test-id');

      expect(result.error!.data).toBeDefined();
      const errorData = result.error!.data as any;
      
      expect(errorData.correlationId).toBeDefined();
      expect(errorData.correlationId).toBe(session.connectionCorrelationId);
      expect(errorData.code).toBe('METHOD_NOT_FOUND');
      expect(errorData.message).toBeDefined();
      expect(errorData.message).toContain('unknown/method');
    });

    it('should handle special characters in method names', () => {
      const specialMethodNames = [
        'method/with-dashes',
        'method_with_underscores',
        'method.with.dots',
        'method123/with456/numbers',
        'method/with/many/slashes'
      ];

      specialMethodNames.forEach((methodName, index) => {
        const result = handleMethodNotFound(session, methodName, index);
        
        expect(result.error!.message).toBe(`Method not found: ${methodName}`);
        expect(result.error!.code).toBe(-32601);
        expect(result.id).toBe(index);
      });
    });
  });

  describe('Invalid Params (-32602)', () => {
    it('should return invalid params error for tools/call shape violations', () => {
      const requestId = 'test-request-456';

      const result = handleInvalidParams(session, requestId);

      expect(result.jsonrpc).toBe('2.0');
      expect(result.id).toBe(requestId); // Should preserve original request id
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(-32602);
      expect(result.error!.message).toBe('Invalid params');
    });

    it('should handle different id types for invalid params', () => {
      // Test with string id
      const resultString = handleInvalidParams(session, 'param-error-string');
      expect(resultString.id).toBe('param-error-string');
      expect(resultString.error!.code).toBe(-32602);

      // Test with numeric id
      const resultNumber = handleInvalidParams(session, 789);
      expect(resultNumber.id).toBe(789);
      expect(resultNumber.error!.code).toBe(-32602);

      // Test with null id
      const resultNull = handleInvalidParams(session, null);
      expect(resultNull.id).toBe(null);
      expect(resultNull.error!.code).toBe(-32602);
    });

    it('should include correlationId in invalid params error data', () => {
      const result = handleInvalidParams(session, 'test-id');

      expect(result.error!.data).toBeDefined();
      const errorData = result.error!.data as any;
      
      expect(errorData.correlationId).toBeDefined();
      expect(errorData.correlationId).toBe(session.connectionCorrelationId);
      expect(errorData.code).toBe('INVALID_PARAMS');
      expect(errorData.message).toBeDefined();
    });

    it('should maintain consistent error structure for invalid params', () => {
      const testIds = ['id1', 'id2', 'id3', 42, null];
      
      testIds.forEach(id => {
        const result = handleInvalidParams(session, id);
        
        expect(result.jsonrpc).toBe('2.0');
        expect(result.id).toBe(id);
        expect(result.error!.code).toBe(-32602);
        expect(result.error!.message).toBe('Invalid params');
        
        const errorData = result.error!.data as any;
        expect(errorData.correlationId).toBe(session.connectionCorrelationId);
        expect(errorData.code).toBe('INVALID_PARAMS');
      });
    });
  });

  describe('JSON-RPC 2.0 Compliance Validation', () => {
    it('should validate all error responses have required JSON-RPC 2.0 fields', () => {
      const testCases = [
        () => handleParseError(session),
        () => handleInvalidRequest(session, 'test-id'),
        () => handleMethodNotFound(session, 'unknown/method', 'test-id'),
        () => handleInvalidParams(session, 'test-id')
      ];

      testCases.forEach((testCase, index) => {
        const result = testCase();
        
        // Required fields per JSON-RPC 2.0 spec
        expect(result.jsonrpc).toBe('2.0');
        expect(result).toHaveProperty('id');
        expect(result.error).toBeDefined();
        expect(result.result).toBeUndefined(); // Error responses must not have result
        
        // Error object structure
        expect(typeof result.error!.code).toBe('number');
        expect(typeof result.error!.message).toBe('string');
        expect(result.error!.message.length).toBeGreaterThan(0);
        expect(result.error!.data).toBeDefined();
      });
    });

    it('should validate error codes are in correct ranges per JSON-RPC 2.0 spec', () => {
      const parseError = handleParseError(session);
      const invalidRequest = handleInvalidRequest(session, 'test');
      const methodNotFound = handleMethodNotFound(session, 'unknown', 'test');
      const invalidParams = handleInvalidParams(session, 'test');

      // Predefined error codes per JSON-RPC 2.0 specification
      expect(parseError.error!.code).toBe(-32700);
      expect(invalidRequest.error!.code).toBe(-32600);
      expect(methodNotFound.error!.code).toBe(-32601);
      expect(invalidParams.error!.code).toBe(-32602);

      // All should be in the reserved range -32768 to -32000
      const errorCodes = [
        parseError.error!.code,
        invalidRequest.error!.code,
        methodNotFound.error!.code,
        invalidParams.error!.code
      ];

      errorCodes.forEach(code => {
        expect(code).toBeGreaterThanOrEqual(-32768);
        expect(code).toBeLessThanOrEqual(-32000);
      });
    });

    it('should validate all error responses are JSON serializable', () => {
      const errors = [
        handleParseError(session),
        handleInvalidRequest(session, 'test-id'),
        handleMethodNotFound(session, 'unknown/method', 'test-id'),
        handleInvalidParams(session, 'test-id')
      ];

      errors.forEach((error, index) => {
        // Should serialize without throwing
        expect(() => JSON.stringify(error)).not.toThrow();
        
        // Should round-trip correctly
        const serialized = JSON.stringify(error);
        const parsed = JSON.parse(serialized);
        
        expect(parsed.jsonrpc).toBe('2.0');
        expect(parsed).toHaveProperty('id');
        expect(parsed.error).toBeDefined();
        expect(parsed.error.code).toBe(error.error!.code);
        expect(parsed.error.message).toBe(error.error!.message);
        expect(parsed.error.data).toBeDefined();
      });
    });

    it('should validate error data contains proper correlation information', () => {
      const errors = [
        handleParseError(session),
        handleInvalidRequest(session, 'test-id'),
        handleMethodNotFound(session, 'unknown/method', 'test-id'),
        handleInvalidParams(session, 'test-id')
      ];

      errors.forEach(error => {
        const errorData = error.error!.data as any;
        
        // All errors should have correlationId
        expect(errorData.correlationId).toBeDefined();
        expect(typeof errorData.correlationId).toBe('string');
        expect(errorData.correlationId.length).toBeGreaterThan(0);
        expect(errorData.correlationId).toBe(session.connectionCorrelationId);
        
        // All errors should have structured error code
        expect(errorData.code).toBeDefined();
        expect(typeof errorData.code).toBe('string');
        expect(errorData.code.length).toBeGreaterThan(0);
        
        // All errors should have descriptive message
        expect(errorData.message).toBeDefined();
        expect(typeof errorData.message).toBe('string');
        expect(errorData.message.length).toBeGreaterThan(0);
        
        // runId should NOT be present in protocol errors (only in tool errors)
        expect(errorData.runId).toBeUndefined();
      });
    });
  });

  describe('Error Response Consistency', () => {
    it('should maintain consistent error structure across different sessions', () => {
      // Create multiple sessions
      const session1 = createSession({ type: 'stdio' }, idGenerator, logger);
      const session2 = createSession({ type: 'stdio' }, idGenerator, logger);
      const session3 = createSession({ type: 'stdio' }, idGenerator, logger);

      const sessions = [session1, session2, session3];
      
      sessions.forEach((testSession, index) => {
        const parseError = handleParseError(testSession);
        const invalidRequest = handleInvalidRequest(testSession, `test-${index}`);
        
        // Structure should be consistent
        expect(parseError.jsonrpc).toBe('2.0');
        expect(parseError.id).toBe(null);
        expect(parseError.error!.code).toBe(-32700);
        
        expect(invalidRequest.jsonrpc).toBe('2.0');
        expect(invalidRequest.id).toBe(`test-${index}`);
        expect(invalidRequest.error!.code).toBe(-32600);
        
        // Each session should have its own connectionCorrelationId
        const parseErrorData = parseError.error!.data as any;
        const invalidRequestData = invalidRequest.error!.data as any;
        
        expect(parseErrorData.correlationId).toBe(testSession.connectionCorrelationId);
        expect(invalidRequestData.correlationId).toBe(testSession.connectionCorrelationId);
        
        // Different sessions should have different connectionCorrelationIds
        if (index > 0) {
          const prevSession = sessions[index - 1];
          expect(testSession.connectionCorrelationId).not.toBe(prevSession.connectionCorrelationId);
        }
      });
    });

    it('should handle edge cases in error parameters gracefully', () => {
      // Test with empty method name
      const emptyMethodResult = handleMethodNotFound(session, '', 'test-id');
      expect(emptyMethodResult.error!.message).toBe('Method not found: ');
      expect(emptyMethodResult.error!.code).toBe(-32601);

      // Test with very long method name
      const longMethodName = 'a'.repeat(1000);
      const longMethodResult = handleMethodNotFound(session, longMethodName, 'test-id');
      expect(longMethodResult.error!.message).toBe(`Method not found: ${longMethodName}`);
      expect(longMethodResult.error!.code).toBe(-32601);

      // Test with special Unicode characters in method name
      const unicodeMethodName = 'method/with/unicode/🚀/characters';
      const unicodeResult = handleMethodNotFound(session, unicodeMethodName, 'test-id');
      expect(unicodeResult.error!.message).toBe(`Method not found: ${unicodeMethodName}`);
      expect(unicodeResult.error!.code).toBe(-32601);
    });
  });
});