/**
 * Unit tests for StructuredLogger
 * 
 * Tests log output format, redaction correctness, sanitization,
 * copy-on-write semantics, child logger context inheritance,
 * and stderr output verification.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StructuredLogger, type Clock, type LogContext } from '../structuredLogger.js';

describe('StructuredLogger', () => {
  let mockClock: Clock;
  let originalStderrWrite: typeof process.stderr.write;
  let stderrOutput: string[];

  beforeEach(() => {
    // Create mock clock for deterministic timestamps
    mockClock = {
      now: vi.fn(() => '2024-01-15T10:30:00.000Z')
    };

    // Capture stderr output
    stderrOutput = [];
    originalStderrWrite = process.stderr.write;
    process.stderr.write = vi.fn((chunk: any) => {
      stderrOutput.push(chunk.toString());
      return true;
    });
  });

  afterEach(() => {
    // Restore original stderr.write
    process.stderr.write = originalStderrWrite;
    vi.clearAllMocks();
  });

  describe('Log Output Format', () => {
    it('should output JSON with timestamp, level, and message to stderr', () => {
      const logger = new StructuredLogger(mockClock);

      logger.info('Test message');

      expect(stderrOutput).toHaveLength(1);
      const logEntry = JSON.parse(stderrOutput[0]!);
      
      expect(logEntry).toEqual({
        timestamp: '2024-01-15T10:30:00.000Z',
        level: 'info',
        message: 'Test message'
      });
    });

    it('should support all log levels (debug, info, warn, error)', () => {
      const logger = new StructuredLogger(mockClock);

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(stderrOutput).toHaveLength(4);
      
      const levels = stderrOutput.map(output => JSON.parse(output).level);
      expect(levels).toEqual(['debug', 'info', 'warn', 'error']);
    });

    it('should include context fields in log output', () => {
      const logger = new StructuredLogger(mockClock);
      const context: LogContext = {
        correlationId: 'req-123',
        runId: 'run-456',
        durationMs: 150,
        customField: 'custom-value'
      };

      logger.info('Test message', context);

      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry).toEqual({
        timestamp: '2024-01-15T10:30:00.000Z',
        level: 'info',
        message: 'Test message',
        correlationId: 'req-123',
        runId: 'run-456',
        durationMs: 150,
        customField: 'custom-value'
      });
    });

    it('should include error objects in log output', () => {
      const logger = new StructuredLogger(mockClock);
      const error = {
        name: 'ValidationError',
        message: 'Invalid input',
        code: 'VALIDATION_FAILED',
        stack: 'Error: Invalid input\n    at test.js:1:1'
      };

      logger.error('Operation failed', { error });

      const logEntry = JSON.parse(stderrOutput[0]!);
      // Error stack should be sanitized (newlines escaped)
      expect(logEntry.error).toEqual({
        name: 'ValidationError',
        message: 'Invalid input',
        code: 'VALIDATION_FAILED',
        stack: 'Error: Invalid input\\n    at test.js:1:1'
      });
    });
  });

  describe('Redaction Correctness', () => {
    it('should redact default sensitive keys case-insensitively', () => {
      const logger = new StructuredLogger(mockClock);
      const sensitiveData = {
        token: 'secret-token',
        KEY: 'secret-key',
        Secret: 'secret-value',
        PASSWORD: 'secret-password',
        apiKey: 'secret-api-key',
        API_KEY: 'secret-api-key-2',
        authorization: 'Bearer token',
        BEARER: 'bearer-token',
        session: 'session-id',
        Cookie: 'cookie-value'
      };

      logger.info('Test message', sensitiveData);

      const logEntry = JSON.parse(stderrOutput[0]!);
      
      // All sensitive fields should be redacted
      expect(logEntry.token).toBe('[REDACTED]');
      expect(logEntry.KEY).toBe('[REDACTED]');
      expect(logEntry.Secret).toBe('[REDACTED]');
      expect(logEntry.PASSWORD).toBe('[REDACTED]');
      expect(logEntry.apiKey).toBe('[REDACTED]');
      expect(logEntry.API_KEY).toBe('[REDACTED]');
      expect(logEntry.authorization).toBe('[REDACTED]');
      expect(logEntry.BEARER).toBe('[REDACTED]');
      expect(logEntry.session).toBe('[REDACTED]');
      expect(logEntry.Cookie).toBe('[REDACTED]');
    });

    it('should redact custom sensitive keys', () => {
      const customRedactKeys = ['customSecret', 'internalToken'];
      const logger = new StructuredLogger(mockClock, customRedactKeys);
      
      const data = {
        customSecret: 'should-be-redacted',
        internalToken: 'should-be-redacted',
        normalField: 'should-not-be-redacted',
        token: 'should-be-redacted' // default key
      };

      logger.info('Test message', data);

      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry.customSecret).toBe('[REDACTED]');
      expect(logEntry.internalToken).toBe('[REDACTED]');
      expect(logEntry.normalField).toBe('should-not-be-redacted');
      expect(logEntry.token).toBe('[REDACTED]');
    });

    it('should redact nested objects and arrays recursively', () => {
      const logger = new StructuredLogger(mockClock);
      const nestedData = {
        user: {
          name: 'John Doe',
          password: 'secret-password',
          profile: {
            email: 'john@example.com',
            apiKey: 'secret-api-key'
          }
        },
        tokens: ['token1', 'token2'],
        metadata: {
          session: 'session-id',
          preferences: {
            secret: 'nested-secret'
          }
        }
      };

      logger.info('Test message', nestedData);

      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry.user.name).toBe('John Doe');
      expect(logEntry.user.password).toBe('[REDACTED]');
      expect(logEntry.user.profile.email).toBe('john@example.com');
      expect(logEntry.user.profile.apiKey).toBe('[REDACTED]');
      expect(logEntry.tokens).toEqual(['token1', 'token2']); // Array values not redacted by key name
      expect(logEntry.metadata.session).toBe('[REDACTED]');
      expect(logEntry.metadata.preferences.secret).toBe('[REDACTED]');
    });

    it('should handle circular references in redaction', () => {
      const logger = new StructuredLogger(mockClock);
      const circularObj: any = {
        name: 'test',
        password: 'secret'
      };
      circularObj.self = circularObj;

      logger.info('Test message', { data: circularObj });

      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry.data.name).toBe('test');
      expect(logEntry.data.password).toBe('[REDACTED]');
      expect(logEntry.data.self).toBe('[CIRCULAR]');
    });
  });

  describe('Sanitization', () => {
    it('should escape control characters in all string fields', () => {
      const logger = new StructuredLogger(mockClock);
      const dataWithControlChars = {
        contextMessage: 'Line 1\nLine 2\tTabbed',
        description: 'Bell\u0007Sound',
        content: 'Carriage\rReturn',
        nullChar: 'Null\u0000Character',
        formFeed: 'Form\u000CFeed'
      };

      logger.info('Test\nmessage\twith\rcontrol\u0007chars', dataWithControlChars);

      const logEntry = JSON.parse(stderrOutput[0]!);
      
      // Message should be sanitized
      expect(logEntry.message).toBe('Test\\nmessage\\twith\\rcontrol\\u0007chars');
      
      // Context fields should be sanitized
      expect(logEntry.contextMessage).toBe('Line 1\\nLine 2\\tTabbed');
      expect(logEntry.description).toBe('Bell\\u0007Sound');
      expect(logEntry.content).toBe('Carriage\\rReturn');
      expect(logEntry.nullChar).toBe('Null\\u0000Character');
      expect(logEntry.formFeed).toBe('Form\\u000cFeed');
    });

    it('should sanitize nested string values', () => {
      const logger = new StructuredLogger(mockClock);
      const nestedData = {
        user: {
          name: 'John\nDoe',
          bio: 'Developer\tand\rArchitect'
        },
        tags: ['tag1\n', 'tag2\t', 'tag3\r']
      };

      logger.info('Test message', nestedData);

      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry.user.name).toBe('John\\nDoe');
      expect(logEntry.user.bio).toBe('Developer\\tand\\rArchitect');
      expect(logEntry.tags).toEqual(['tag1\\n', 'tag2\\t', 'tag3\\r']);
    });

    it('should handle circular references in sanitization', () => {
      const logger = new StructuredLogger(mockClock);
      const circularObj: any = {
        name: 'test\nwith\tcontrol\rchars'
      };
      circularObj.self = circularObj;

      logger.info('Test message', { data: circularObj });

      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry.data.name).toBe('test\\nwith\\tcontrol\\rchars');
      expect(logEntry.data.self).toBe('[CIRCULAR]');
    });
  });

  describe('Copy-on-Write Semantics', () => {
    it('should not mutate original objects during redaction', () => {
      const logger = new StructuredLogger(mockClock);
      const originalData = {
        username: 'john',
        password: 'secret',
        nested: {
          token: 'secret-token',
          value: 'normal-value'
        }
      };
      const originalDataCopy = JSON.parse(JSON.stringify(originalData));

      logger.info('Test message', originalData);

      // Original object should remain unchanged
      expect(originalData).toEqual(originalDataCopy);
      expect(originalData.password).toBe('secret');
      expect(originalData.nested.token).toBe('secret-token');
    });

    it('should not mutate original objects during sanitization', () => {
      const logger = new StructuredLogger(mockClock);
      const originalData = {
        message: 'Line 1\nLine 2',
        nested: {
          content: 'Tab\tSeparated\rValues'
        }
      };
      const originalDataCopy = JSON.parse(JSON.stringify(originalData));

      logger.info('Test\nmessage', originalData);

      // Original object should remain unchanged
      expect(originalData).toEqual(originalDataCopy);
      expect(originalData.message).toBe('Line 1\nLine 2');
      expect(originalData.nested.content).toBe('Tab\tSeparated\rValues');
    });
  });

  describe('Child Logger Context Inheritance', () => {
    it('should create child logger with inherited context and clock', () => {
      const parentLogger = new StructuredLogger(mockClock);
      const childContext = {
        correlationId: 'req-123',
        agentId: 'requirements-analyzer'
      };

      const childLogger = parentLogger.child(childContext);

      childLogger.info('Child log message', { phase: 'strategic-design' });

      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry).toEqual({
        timestamp: '2024-01-15T10:30:00.000Z',
        level: 'info',
        message: 'Child log message',
        correlationId: 'req-123',
        agentId: 'requirements-analyzer',
        phase: 'strategic-design'
      });
    });

    it('should allow child context to override parent context', () => {
      const parentLogger = new StructuredLogger(mockClock);
      const childContext = {
        correlationId: 'req-123',
        runId: 'run-456'
      };

      const childLogger = parentLogger.child(childContext);

      // Child logger call with overriding context
      childLogger.info('Child log message', { 
        correlationId: 'req-789', // Override parent context
        newField: 'new-value'
      });

      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry.correlationId).toBe('req-789'); // Overridden value
      expect(logEntry.runId).toBe('run-456'); // Inherited value
      expect(logEntry.newField).toBe('new-value'); // New value
    });

    it('should inherit redact keys from parent logger', () => {
      const customRedactKeys = ['customSecret'];
      const parentLogger = new StructuredLogger(mockClock, customRedactKeys);
      const childLogger = parentLogger.child({ correlationId: 'req-123' });

      childLogger.info('Test message', {
        customSecret: 'should-be-redacted',
        password: 'should-also-be-redacted'
      });

      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry.customSecret).toBe('[REDACTED]');
      expect(logEntry.password).toBe('[REDACTED]');
    });

    it('should create child logger without context', () => {
      const parentLogger = new StructuredLogger(mockClock);
      const childLogger = parentLogger.child();

      childLogger.info('Child log message');

      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry).toEqual({
        timestamp: '2024-01-15T10:30:00.000Z',
        level: 'info',
        message: 'Child log message'
      });
    });
  });

  describe('Stderr Output Verification', () => {
    it('should output logs to stderr only, not stdout', () => {
      const logger = new StructuredLogger(mockClock);
      const originalStdoutWrite = process.stdout.write;
      const stdoutOutput: string[] = [];
      
      process.stdout.write = vi.fn((chunk: any) => {
        stdoutOutput.push(chunk.toString());
        return true;
      });

      try {
        logger.info('Test message');

        // Should have output to stderr
        expect(stderrOutput).toHaveLength(1);
        
        // Should NOT have output to stdout
        expect(stdoutOutput).toHaveLength(0);
      } finally {
        process.stdout.write = originalStdoutWrite;
      }
    });

    it('should output valid JSON that can be parsed', () => {
      const logger = new StructuredLogger(mockClock);

      logger.info('Test message', { 
        correlationId: 'req-123',
        data: { nested: 'value' }
      });

      expect(stderrOutput).toHaveLength(1);
      
      // Should be valid JSON
      expect(() => JSON.parse(stderrOutput[0]!)).not.toThrow();
      
      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry.jsonrpc).toBeUndefined(); // Should not be JSON-RPC format
      expect(logEntry.timestamp).toBeDefined();
      expect(logEntry.level).toBeDefined();
      expect(logEntry.message).toBeDefined();
    });
  });

  describe('Clock Integration', () => {
    it('should use injected clock for timestamp generation', () => {
      const customClock: Clock = {
        now: vi.fn(() => '2025-12-31T23:59:59.999Z')
      };

      const logger = new StructuredLogger(customClock);

      logger.info('Test message');

      expect(customClock.now).toHaveBeenCalledTimes(1);
      
      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry.timestamp).toBe('2025-12-31T23:59:59.999Z');
    });

    it('should call clock for each log entry', () => {
      const logger = new StructuredLogger(mockClock);

      logger.info('First message');
      logger.warn('Second message');
      logger.error('Third message');

      expect(mockClock.now).toHaveBeenCalledTimes(3);
      expect(stderrOutput).toHaveLength(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined values', () => {
      const logger = new StructuredLogger(mockClock);

      logger.info('Test message', {
        nullValue: null,
        undefinedValue: undefined,
        emptyString: '',
        zeroNumber: 0,
        falseBoolean: false
      });

      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry.nullValue).toBe(null);
      expect(logEntry.undefinedValue).toBeUndefined();
      expect(logEntry.emptyString).toBe('');
      expect(logEntry.zeroNumber).toBe(0);
      expect(logEntry.falseBoolean).toBe(false);
    });

    it('should handle empty context objects', () => {
      const logger = new StructuredLogger(mockClock);

      logger.info('Test message', {});

      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry).toEqual({
        timestamp: '2024-01-15T10:30:00.000Z',
        level: 'info',
        message: 'Test message'
      });
    });

    it('should handle very large objects', () => {
      const logger = new StructuredLogger(mockClock);
      const largeObject: Record<string, any> = {};
      
      // Create a large object with many properties
      for (let i = 0; i < 1000; i++) {
        largeObject[`field${i}`] = `value${i}`;
      }
      largeObject['password'] = 'should-be-redacted';

      logger.info('Test message', largeObject);

      const logEntry = JSON.parse(stderrOutput[0]!);
      expect(logEntry.field0).toBe('value0');
      expect(logEntry.field999).toBe('value999');
      expect(logEntry.password).toBe('[REDACTED]');
    });
  });
});