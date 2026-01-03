/**
 * Unit tests for protocol handlers module.
 * Tests the MCP protocol lifecycle including initialization,
 * state transitions, and initialization gate enforcement.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleInitialize,
  handleInitialized,
  enforceInitializationGate,
  closeSession,
  isSessionClosed,
  type InitializeParams,
  type RequestContext,
} from '../../../src/mcp/handlers.js';
import { createSession, type SessionContext } from '../../../src/mcp/session.js';
import { StructuredLogger, SystemClock } from '../../../src/logging/structuredLogger.js';
import { DeterministicIdGenerator } from '../../../src/shared/idGenerator.js';
import type { ServerConfig } from '../../../src/config/configManager.js';
import { ErrorCode, JSON_RPC_ERROR_CODES } from '../../../src/errors/errorHandler.js';

describe('Protocol Handlers - Lifecycle State Machine', () => {
  let session: SessionContext;
  let parentLogger: StructuredLogger;
  let idGenerator: DeterministicIdGenerator;
  let config: ServerConfig;

  beforeEach(() => {
    parentLogger = new StructuredLogger(new SystemClock());
    idGenerator = new DeterministicIdGenerator();
    session = createSession({ type: 'stdio' }, idGenerator, parentLogger);

    config = {
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
        redactKeys: ['token', 'key', 'secret', 'password'],
      },
      security: {
        dynamicRegistrationEnabled: false,
        allowArbitraryCodeTools: false,
      },
    };
  });

  describe('handleInitialize', () => {
    it('should transition session state from STARTING to INITIALIZING', () => {
      expect(session.state).toBe('STARTING');

      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
      };

      handleInitialize(params, session, config);

      expect(session.state).toBe('INITIALIZING');
    });

    it('should return InitializeResult with server info', () => {
      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
      };

      const result = handleInitialize(params, session, config);

      expect(result).toHaveProperty('protocolVersion');
      expect(result).toHaveProperty('serverInfo');
      expect(result).toHaveProperty('capabilities');
      expect(result.serverInfo.name).toBe('test-server');
      expect(result.serverInfo.version).toBe('0.1.0');
    });

    it('should include tools capability in response', () => {
      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
      };

      const result = handleInitialize(params, session, config);

      expect(result.capabilities).toHaveProperty('tools');
      expect(typeof result.capabilities.tools).toBe('object');
    });

    it('should throw error if session is not in STARTING state', () => {
      // Manually transition to INITIALIZING
      (session as any).state = 'INITIALIZING';

      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
      };

      expect(() => handleInitialize(params, session, config)).toThrow();
    });

    it('should throw error if session is already RUNNING', () => {
      // Manually transition to RUNNING
      (session as any).state = 'RUNNING';

      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
      };

      expect(() => handleInitialize(params, session, config)).toThrow();
    });

    it('should throw error if session is CLOSED', () => {
      // Manually transition to CLOSED
      (session as any).state = 'CLOSED';

      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
      };

      expect(() => handleInitialize(params, session, config)).toThrow();
    });

    it('should accept client info in params', () => {
      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      };

      const result = handleInitialize(params, session, config);

      expect(result).toBeDefined();
      expect(session.state).toBe('INITIALIZING');
    });

    it('should accept capabilities in params', () => {
      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
      };

      const result = handleInitialize(params, session, config);

      expect(result).toBeDefined();
      expect(session.state).toBe('INITIALIZING');
    });

    it('should use config values for server info', () => {
      const customConfig: ServerConfig = {
        ...config,
        server: {
          name: 'custom-server',
          version: '2.0.0',
          shutdownTimeoutMs: 5000,
        },
      };

      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
      };

      const result = handleInitialize(params, session, customConfig);

      expect(result.serverInfo.name).toBe('custom-server');
      expect(result.serverInfo.version).toBe('2.0.0');
    });
  });

  describe('handleInitialized', () => {
    it('should transition session state from INITIALIZING to RUNNING', () => {
      // First initialize
      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
      };
      handleInitialize(params, session, config);
      expect(session.state).toBe('INITIALIZING');

      // Then call initialized
      handleInitialized(session);

      expect(session.state).toBe('RUNNING');
    });

    it('should throw error if session is not in INITIALIZING state', () => {
      // Session is in STARTING state
      expect(session.state).toBe('STARTING');

      expect(() => handleInitialized(session)).toThrow();
    });

    it('should throw error if session is already RUNNING', () => {
      // Manually transition to RUNNING
      (session as any).state = 'RUNNING';

      expect(() => handleInitialized(session)).toThrow();
    });

    it('should throw error if session is CLOSED', () => {
      // Manually transition to CLOSED
      (session as any).state = 'CLOSED';

      expect(() => handleInitialized(session)).toThrow();
    });

    it('should complete the full initialization sequence', () => {
      // Start in STARTING
      expect(session.state).toBe('STARTING');

      // Initialize
      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
      };
      handleInitialize(params, session, config);
      expect(session.state).toBe('INITIALIZING');

      // Initialized
      handleInitialized(session);
      expect(session.state).toBe('RUNNING');
    });
  });

  describe('enforceInitializationGate', () => {
    it('should allow initialize method at any state', () => {
      const states: Array<SessionContext['state']> = ['STARTING', 'INITIALIZING', 'RUNNING', 'CLOSED'];

      for (const state of states) {
        (session as any).state = state;
        const result = enforceInitializationGate(session, 'initialize');
        expect(result).toBeUndefined();
      }
    });

    it('should allow initialized method at any state', () => {
      const states: Array<SessionContext['state']> = ['STARTING', 'INITIALIZING', 'RUNNING', 'CLOSED'];

      for (const state of states) {
        (session as any).state = state;
        const result = enforceInitializationGate(session, 'initialized');
        expect(result).toBeUndefined();
      }
    });

    it('should block tools/list before RUNNING', () => {
      (session as any).state = 'STARTING';
      const result = enforceInitializationGate(session, 'tools/list');

      expect(result).toBeDefined();
      expect(result?.error.code).toBe(JSON_RPC_ERROR_CODES.NOT_INITIALIZED);
      expect(result?.error.message).toBe('Not initialized');
    });

    it('should block tools/call before RUNNING', () => {
      (session as any).state = 'INITIALIZING';
      const result = enforceInitializationGate(session, 'tools/call');

      expect(result).toBeDefined();
      expect(result?.error.code).toBe(JSON_RPC_ERROR_CODES.NOT_INITIALIZED);
    });

    it('should allow tools/list when RUNNING', () => {
      (session as any).state = 'RUNNING';
      const result = enforceInitializationGate(session, 'tools/list');

      expect(result).toBeUndefined();
    });

    it('should allow tools/call when RUNNING', () => {
      (session as any).state = 'RUNNING';
      const result = enforceInitializationGate(session, 'tools/call');

      expect(result).toBeUndefined();
    });

    it('should include connectionCorrelationId in error data', () => {
      (session as any).state = 'STARTING';
      const result = enforceInitializationGate(session, 'tools/list');

      expect(result?.error.data).toBeDefined();
      expect(result?.error.data.correlationId).toBe(session.connectionCorrelationId);
    });

    it('should return JSON-RPC error format', () => {
      (session as any).state = 'STARTING';
      const result = enforceInitializationGate(session, 'tools/list');

      expect(result).toHaveProperty('jsonrpc');
      expect(result?.jsonrpc).toBe('2.0');
      expect(result).toHaveProperty('error');
      expect(result?.error).toHaveProperty('code');
      expect(result?.error).toHaveProperty('message');
      expect(result?.error).toHaveProperty('data');
    });

    it('should block arbitrary methods before RUNNING', () => {
      (session as any).state = 'STARTING';

      const methods = ['resources/read', 'resources/list', 'custom/method'];
      for (const method of methods) {
        const result = enforceInitializationGate(session, method);
        expect(result).toBeDefined();
        expect(result?.error.code).toBe(JSON_RPC_ERROR_CODES.NOT_INITIALIZED);
      }
    });

    it('should allow arbitrary methods when RUNNING', () => {
      (session as any).state = 'RUNNING';

      const methods = ['resources/read', 'resources/list', 'custom/method'];
      for (const method of methods) {
        const result = enforceInitializationGate(session, method);
        expect(result).toBeUndefined();
      }
    });

    it('should block methods when CLOSED', () => {
      (session as any).state = 'CLOSED';
      const result = enforceInitializationGate(session, 'tools/list');

      expect(result).toBeDefined();
      expect(result?.error.code).toBe(JSON_RPC_ERROR_CODES.NOT_INITIALIZED);
    });
  });

  describe('closeSession', () => {
    it('should transition session state to CLOSED', () => {
      (session as any).state = 'RUNNING';
      expect(session.state).toBe('RUNNING');

      closeSession(session);

      expect(session.state).toBe('CLOSED');
    });

    it('should work from any state', () => {
      const states: Array<SessionContext['state']> = ['STARTING', 'INITIALIZING', 'RUNNING'];

      for (const state of states) {
        const newSession = createSession({ type: 'stdio' }, idGenerator, parentLogger);
        (newSession as any).state = state;

        closeSession(newSession);

        expect(newSession.state).toBe('CLOSED');
      }
    });

    it('should be idempotent', () => {
      (session as any).state = 'RUNNING';

      closeSession(session);
      expect(session.state).toBe('CLOSED');

      closeSession(session);
      expect(session.state).toBe('CLOSED');
    });
  });

  describe('isSessionClosed', () => {
    it('should return true when session is CLOSED', () => {
      (session as any).state = 'CLOSED';
      expect(isSessionClosed(session)).toBe(true);
    });

    it('should return false when session is STARTING', () => {
      (session as any).state = 'STARTING';
      expect(isSessionClosed(session)).toBe(false);
    });

    it('should return false when session is INITIALIZING', () => {
      (session as any).state = 'INITIALIZING';
      expect(isSessionClosed(session)).toBe(false);
    });

    it('should return false when session is RUNNING', () => {
      (session as any).state = 'RUNNING';
      expect(isSessionClosed(session)).toBe(false);
    });
  });

  describe('State Machine Transitions', () => {
    it('should follow correct state transition sequence', () => {
      // STARTING -> INITIALIZING
      expect(session.state).toBe('STARTING');

      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
      };
      handleInitialize(params, session, config);
      expect(session.state).toBe('INITIALIZING');

      // INITIALIZING -> RUNNING
      handleInitialized(session);
      expect(session.state).toBe('RUNNING');

      // RUNNING -> CLOSED
      closeSession(session);
      expect(session.state).toBe('CLOSED');
    });

    it('should prevent invalid state transitions', () => {
      // Try to go directly from STARTING to RUNNING
      expect(() => handleInitialized(session)).toThrow();

      // Try to initialize twice
      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
      };
      handleInitialize(params, session, config);
      expect(() => handleInitialize(params, session, config)).toThrow();
    });

    it('should enforce gate during transitions', () => {
      // In STARTING state, tools/list should be blocked
      let result = enforceInitializationGate(session, 'tools/list');
      expect(result).toBeDefined();

      // After initialize, still blocked
      const params: InitializeParams = {
        protocolVersion: '2024-11-05',
      };
      handleInitialize(params, session, config);
      result = enforceInitializationGate(session, 'tools/list');
      expect(result).toBeDefined();

      // After initialized, allowed
      handleInitialized(session);
      result = enforceInitializationGate(session, 'tools/list');
      expect(result).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should provide descriptive error messages', () => {
      (session as any).state = 'STARTING';
      const result = enforceInitializationGate(session, 'tools/list');

      expect(result?.error.message).toBe('Not initialized');
      expect(result?.error.data.message).toBeDefined();
    });

    it('should include error code in structured error', () => {
      (session as any).state = 'STARTING';
      const result = enforceInitializationGate(session, 'tools/list');

      expect(result?.error.data.code).toBe(ErrorCode.NotInitialized);
    });

    it('should preserve correlation ID through error responses', () => {
      const originalCorrelationId = session.connectionCorrelationId;

      (session as any).state = 'STARTING';
      const result = enforceInitializationGate(session, 'tools/list');

      expect(result?.error.data.correlationId).toBe(originalCorrelationId);
    });
  });
});
