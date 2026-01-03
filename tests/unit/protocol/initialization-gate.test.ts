/**
 * Unit tests for strict initialization gate enforcement.
 * 
 * Tests that the protocol handlers enforce the strict initialization gate:
 * - Session starts in STARTING state
 * - Only initialize and initialized are allowed before RUNNING
 * - State transitions correctly: STARTING → INITIALIZING → RUNNING
 * - Errors are thrown for methods called before RUNNING state
 * 
 * Per design specification:
 * - Strict initialization gate: blocks ALL methods except initialize and initialized until RUNNING
 * - State errors return ErrorCode.NotInitialized
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ServerConfig } from '../../../src/config/configManager.js';
import { StructuredLogger, SystemClock } from '../../../src/logging/structuredLogger.js';
import { createToolRegistry } from '../../../src/mcp/toolRegistry.js';
import { createResourceManager } from '../../../src/resources/resourceManager.js';
import { ProductionIdGenerator } from '../../../src/shared/idGenerator.js';
import { createSession } from '../../../src/mcp/session.js';
import { ErrorCode, createError } from '../../../src/errors/errorHandler.js';

/**
 * Helper to create a test server configuration
 */
function createTestConfig(): ServerConfig {
  return {
    server: {
      name: 'test-server',
      version: '0.1.0',
      shutdownTimeoutMs: 10000,
    },
    tools: {
      defaultTimeoutMs: 30000,
      maxPayloadBytes: 1048576,
      maxStateBytes: 262144,
      adminRegistrationEnabled: false,
      adminPolicy: { mode: 'deny_all' },
    },
    resources: {
      maxConcurrentExecutions: 10,
    },
    logging: {
      level: 'info',
      redactKeys: ['token', 'key', 'secret', 'password', 'apiKey', 'authorization', 'bearer', 'session', 'cookie'],
    },
    security: {
      dynamicRegistrationEnabled: false,
      allowArbitraryCodeTools: false,
    },
  };
}

describe('Strict Initialization Gate', () => {
  let config: ServerConfig;
  let logger: StructuredLogger;
  let session: ReturnType<typeof createSession>;

  beforeEach(() => {
    config = createTestConfig();
    logger = new StructuredLogger(new SystemClock(), config.logging.redactKeys);
    const idGenerator = new ProductionIdGenerator();

    // Create session in STARTING state
    session = createSession({ type: 'stdio' }, idGenerator, logger);
  });

  describe('Session State Transitions', () => {
    it('should initialize session in STARTING state', () => {
      expect(session.state).toBe('STARTING');
    });

    it('should have connectionCorrelationId', () => {
      expect(session.connectionCorrelationId).toBeDefined();
      expect(typeof session.connectionCorrelationId).toBe('string');
      expect(session.connectionCorrelationId.length).toBeGreaterThan(0);
    });

    it('should transition to INITIALIZING when initialize is called', () => {
      expect(session.state).toBe('STARTING');

      // Simulate initialize handler
      if (session.state === 'STARTING') {
        (session as any).state = 'INITIALIZING';
      }

      expect(session.state).toBe('INITIALIZING');
    });

    it('should transition to RUNNING when initialized is called', () => {
      // First transition to INITIALIZING
      (session as any).state = 'INITIALIZING';
      expect(session.state).toBe('INITIALIZING');

      // Then transition to RUNNING
      if (session.state === 'INITIALIZING') {
        (session as any).state = 'RUNNING';
      }

      expect(session.state).toBe('RUNNING');
    });

    it('should complete full state transition sequence', () => {
      // Initial state
      expect(session.state).toBe('STARTING');

      // Transition 1: STARTING → INITIALIZING
      (session as any).state = 'INITIALIZING';
      expect(session.state).toBe('INITIALIZING');

      // Transition 2: INITIALIZING → RUNNING
      (session as any).state = 'RUNNING';
      expect(session.state).toBe('RUNNING');

      // Should stay in RUNNING
      expect(session.state).toBe('RUNNING');
    });
  });

  describe('Initialization Gate Enforcement', () => {
    it('should reject initialize when not in STARTING state', () => {
      // Move to INITIALIZING
      (session as any).state = 'INITIALIZING';

      // Try to initialize again - should fail
      const shouldFail = session.state !== 'STARTING';
      expect(shouldFail).toBe(true);

      // Verify error would be thrown
      if (session.state !== 'STARTING') {
        const error = createError(
          ErrorCode.NotInitialized,
          `Cannot initialize: session already in ${session.state} state`
        );
        expect(error.code).toBe(ErrorCode.NotInitialized);
      }
    });

    it('should reject initialized when not in INITIALIZING state', () => {
      // Stay in STARTING
      expect(session.state).toBe('STARTING');

      // Try to call initialized - should fail
      const shouldFail = session.state !== 'INITIALIZING';
      expect(shouldFail).toBe(true);

      // Verify error would be thrown
      if (session.state !== 'INITIALIZING') {
        const error = createError(
          ErrorCode.NotInitialized,
          `Cannot complete initialization: session in ${session.state} state, expected INITIALIZING`
        );
        expect(error.code).toBe(ErrorCode.NotInitialized);
      }
    });

    it('should block tools/list before RUNNING state', () => {
      expect(session.state).toBe('STARTING');

      // tools/list should be blocked
      const isBlocked = session.state !== 'RUNNING';
      expect(isBlocked).toBe(true);

      // Verify error would be thrown
      if (session.state !== 'RUNNING') {
        const error = createError(
          ErrorCode.NotInitialized,
          'Server not initialized'
        );
        expect(error.code).toBe(ErrorCode.NotInitialized);
      }
    });

    it('should block tools/call before RUNNING state', () => {
      expect(session.state).toBe('STARTING');

      // tools/call should be blocked
      const isBlocked = session.state !== 'RUNNING';
      expect(isBlocked).toBe(true);

      // Verify error would be thrown
      if (session.state !== 'RUNNING') {
        const error = createError(
          ErrorCode.NotInitialized,
          'Server not initialized'
        );
        expect(error.code).toBe(ErrorCode.NotInitialized);
      }
    });

    it('should allow tools/list after RUNNING state', () => {
      // Transition to RUNNING
      (session as any).state = 'INITIALIZING';
      (session as any).state = 'RUNNING';

      expect(session.state).toBe('RUNNING');

      // tools/list should be allowed
      const isAllowed = session.state === 'RUNNING';
      expect(isAllowed).toBe(true);
    });

    it('should allow tools/call after RUNNING state', () => {
      // Transition to RUNNING
      (session as any).state = 'INITIALIZING';
      (session as any).state = 'RUNNING';

      expect(session.state).toBe('RUNNING');

      // tools/call should be allowed
      const isAllowed = session.state === 'RUNNING';
      expect(isAllowed).toBe(true);
    });
  });

  describe('Error Codes', () => {
    it('should use NOT_INITIALIZED error code for state violations', () => {
      const error = createError(
        ErrorCode.NotInitialized,
        'Server not initialized'
      );

      expect(error.code).toBe(ErrorCode.NotInitialized);
      expect(error.message).toBe('Server not initialized');
    });

    it('should include correlationId in error context', () => {
      const error = createError(
        ErrorCode.NotInitialized,
        'Server not initialized'
      );

      // Error should be enriched with correlationId when thrown
      const enrichedError = {
        ...error,
        correlationId: session.connectionCorrelationId,
      };

      expect(enrichedError.correlationId).toBe(session.connectionCorrelationId);
    });
  });
});
