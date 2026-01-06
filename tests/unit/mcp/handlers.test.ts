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
  logToolCompletion,
  ToolCompletionOutcome,
  type InitializeParams,
  type RequestContext,
  type ToolCompletionRecord,
} from '../../../src/mcp/handlers.js';
import { createSession, type SessionContext } from '../../../src/mcp/session.js';
import { StructuredLogger, SystemClock } from '../../../src/logging/structuredLogger.js';
import { DeterministicIdGenerator } from '../../../src/shared/idGenerator.js';
import type { ServerConfig } from '../../../src/config/configManager.js';
import { ErrorCode, JSON_RPC_ERROR_CODES, createError } from '../../../src/errors/errorHandler.js';

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


describe('Tool Completion Logging', () => {
  let logger: StructuredLogger;
  let logOutput: string[] = [];
  let originalWrite: typeof process.stderr.write;

  beforeEach(() => {
    logger = new StructuredLogger(new SystemClock());
    logOutput = [];

    // Capture stderr output
    originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      logOutput.push(chunk);
      return true;
    }) as any;
  });

  afterEach(() => {
    // Restore stderr
    process.stderr.write = originalWrite;
  });

  describe('logToolCompletion', () => {
    it('should export logToolCompletion function', () => {
      expect(typeof logToolCompletion).toBe('function');
      expect(ToolCompletionOutcome).toBeDefined();
    });

    it('should log tool completion with all required fields', () => {
      logOutput = [];
      logToolCompletion(logger, {
        runId: 'run-123',
        correlationId: 'req-456',
        toolName: 'analyze-requirements',
        durationMs: 1500,
        outcome: ToolCompletionOutcome.Success,
      });

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('runId', 'run-123');
      expect(logEntry).toHaveProperty('correlationId', 'req-456');
      expect(logEntry).toHaveProperty('toolName', 'analyze-requirements');
      expect(logEntry).toHaveProperty('durationMs', 1500);
      expect(logEntry).toHaveProperty('outcome', 'success');
    });

    it('should include optional errorCode field when provided', () => {
      logOutput = [];
      logToolCompletion(logger, {
        runId: 'run-123',
        correlationId: 'req-456',
        toolName: 'analyze-requirements',
        durationMs: 1500,
        outcome: ToolCompletionOutcome.ToolError,
        errorCode: ErrorCode.InvalidArgument,
      });

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('errorCode', 'INVALID_ARGUMENT');
    });

    it('should include optional payloadBytes field when provided', () => {
      logOutput = [];
      logToolCompletion(logger, {
        runId: 'run-123',
        correlationId: 'req-456',
        toolName: 'analyze-requirements',
        durationMs: 1500,
        outcome: ToolCompletionOutcome.Success,
        payloadBytes: 2048,
      });

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('payloadBytes', 2048);
    });

    it('should not include optional fields when not provided', () => {
      logOutput = [];
      logToolCompletion(logger, {
        runId: 'run-123',
        correlationId: 'req-456',
        toolName: 'analyze-requirements',
        durationMs: 1500,
        outcome: ToolCompletionOutcome.Success,
      });

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).not.toHaveProperty('errorCode');
      expect(logEntry).not.toHaveProperty('payloadBytes');
    });

    it('should sanitize control characters in logged fields', () => {
      logOutput = [];
      logToolCompletion(logger, {
        runId: 'run-123\n',
        correlationId: 'req-456\t',
        toolName: 'analyze\r',
        durationMs: 1500,
        outcome: ToolCompletionOutcome.Success,
      });

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      // Control characters should be escaped
      expect(logEntry.runId).not.toContain('\n');
      expect(logEntry.correlationId).not.toContain('\t');
      expect(logEntry.toolName).not.toContain('\r');
    });

    it('should support different log levels', () => {
      const levels: Array<'debug' | 'info' | 'warn' | 'error'> = ['debug', 'info', 'warn', 'error'];

      for (const level of levels) {
        logOutput = [];
        logToolCompletion(
          logger,
          {
            runId: 'run-123',
            correlationId: 'req-456',
            toolName: 'analyze-requirements',
            durationMs: 1500,
            outcome: ToolCompletionOutcome.Success,
          },
          level
        );

        expect(logOutput.length).toBeGreaterThan(0);
        const logEntry = JSON.parse(logOutput[0]);
        expect(logEntry.level).toBe(level);
      }
    });

    it('should log all ToolCompletionOutcome values', () => {
      const outcomes = [
        ToolCompletionOutcome.Success,
        ToolCompletionOutcome.ToolError,
        ToolCompletionOutcome.Timeout,
        ToolCompletionOutcome.LateCompleted,
        ToolCompletionOutcome.Aborted,
        ToolCompletionOutcome.DisconnectedCompleted,
        ToolCompletionOutcome.ProtocolError,
      ];

      for (const outcome of outcomes) {
        logOutput = [];
        logToolCompletion(logger, {
          runId: 'run-123',
          correlationId: 'req-456',
          toolName: 'analyze-requirements',
          durationMs: 1500,
          outcome,
        });

        expect(logOutput.length).toBeGreaterThan(0);
        const logEntry = JSON.parse(logOutput[0]);
        expect(logEntry.outcome).toBe(outcome);
      }
    });

    it('should include message in log entry', () => {
      logOutput = [];
      logToolCompletion(logger, {
        runId: 'run-123',
        correlationId: 'req-456',
        toolName: 'analyze-requirements',
        durationMs: 1500,
        outcome: ToolCompletionOutcome.Success,
      });

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('message');
      expect(logEntry.message).toContain('Tool invocation completed');
      expect(logEntry.message).toContain('analyze-requirements');
    });

    it('should include timestamp in log entry', () => {
      logOutput = [];
      logToolCompletion(logger, {
        runId: 'run-123',
        correlationId: 'req-456',
        toolName: 'analyze-requirements',
        durationMs: 1500,
        outcome: ToolCompletionOutcome.Success,
      });

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('timestamp');
      // Verify it's a valid ISO 8601 timestamp
      expect(new Date(logEntry.timestamp).toISOString()).toBe(logEntry.timestamp);
    });

    it('should default to info log level', () => {
      logOutput = [];
      logToolCompletion(logger, {
        runId: 'run-123',
        correlationId: 'req-456',
        toolName: 'analyze-requirements',
        durationMs: 1500,
        outcome: ToolCompletionOutcome.Success,
      });

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe('info');
    });

    it('should not log full arguments or results', () => {
      logOutput = [];
      logToolCompletion(logger, {
        runId: 'run-123',
        correlationId: 'req-456',
        toolName: 'analyze-requirements',
        durationMs: 1500,
        outcome: ToolCompletionOutcome.Success,
      });

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      // Should not have arguments or results fields
      expect(logEntry).not.toHaveProperty('arguments');
      expect(logEntry).not.toHaveProperty('result');
      expect(logEntry).not.toHaveProperty('results');
    });

    it('should apply redaction to sensitive fields', () => {
      // Create logger with custom redact keys
      const customLogger = new StructuredLogger(new SystemClock(), ['toolName']);

      // Create a separate capture for this test
      let testOutput = '';
      const originalWrite = process.stderr.write;
      
      process.stderr.write = ((chunk: string) => {
        testOutput += chunk;
        return true;
      }) as any;

      try {
        logToolCompletion(customLogger, {
          runId: 'run-123',
          correlationId: 'req-456',
          toolName: 'secret-tool',
          durationMs: 1500,
          outcome: ToolCompletionOutcome.Success,
        });

        expect(testOutput.length).toBeGreaterThan(0);
        const logEntry = JSON.parse(testOutput);

        // toolName should be redacted
        expect(logEntry.toolName).toBe('[REDACTED]');
      } finally {
        // Always restore stderr
        process.stderr.write = originalWrite;
      }
    });
  });
});


describe('Late Tool Completion Logging', () => {
  let logger: StructuredLogger;
  let logOutput: string[] = [];
  let originalWrite: typeof process.stderr.write;

  beforeEach(() => {
    logger = new StructuredLogger(new SystemClock());
    logOutput = [];

    // Capture stderr output
    originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      logOutput.push(chunk);
      return true;
    }) as any;
  });

  afterEach(() => {
    // Restore stderr
    process.stderr.write = originalWrite;
  });

  describe('logLateToolCompletion', () => {
    it('should import and export logLateToolCompletion function', async () => {
      const { logLateToolCompletion } = await import('../../../src/mcp/handlers.js');
      expect(typeof logLateToolCompletion).toBe('function');
    });

    it('should log late completion with LateCompleted outcome', async () => {
      const { logLateToolCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logLateToolCompletion(logger, 'run-123', 'req-456', 'analyze-requirements', 5000);

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.outcome).toBe(ToolCompletionOutcome.LateCompleted);
      expect(logEntry.runId).toBe('run-123');
      expect(logEntry.correlationId).toBe('req-456');
      expect(logEntry.toolName).toBe('analyze-requirements');
      expect(logEntry.durationMs).toBe(5000);
    });

    it('should log late completion at WARN level', async () => {
      const { logLateToolCompletion } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logLateToolCompletion(logger, 'run-123', 'req-456', 'analyze-requirements', 5000);

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe('warn');
    });

    it('should include optional errorCode when provided', async () => {
      const { logLateToolCompletion } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logLateToolCompletion(logger, 'run-123', 'req-456', 'analyze-requirements', 5000, ErrorCode.Internal);

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('errorCode', 'INTERNAL');
    });

    it('should include optional payloadBytes when provided', async () => {
      const { logLateToolCompletion } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logLateToolCompletion(logger, 'run-123', 'req-456', 'analyze-requirements', 5000, undefined, 2048);

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('payloadBytes', 2048);
    });

    it('should include both errorCode and payloadBytes when provided', async () => {
      const { logLateToolCompletion } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logLateToolCompletion(logger, 'run-123', 'req-456', 'analyze-requirements', 5000, ErrorCode.Timeout, 1024);

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('errorCode', 'TIMEOUT');
      expect(logEntry).toHaveProperty('payloadBytes', 1024);
    });

    it('should not include optional fields when not provided', async () => {
      const { logLateToolCompletion } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logLateToolCompletion(logger, 'run-123', 'req-456', 'analyze-requirements', 5000);

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).not.toHaveProperty('errorCode');
      expect(logEntry).not.toHaveProperty('payloadBytes');
    });

    it('should sanitize control characters in logged fields', async () => {
      const { logLateToolCompletion } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logLateToolCompletion(logger, 'run-123\n', 'req-456\t', 'analyze\r', 5000);

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      // Control characters should be escaped
      expect(logEntry.runId).not.toContain('\n');
      expect(logEntry.correlationId).not.toContain('\t');
      expect(logEntry.toolName).not.toContain('\r');
    });

    it('should include timestamp in log entry', async () => {
      const { logLateToolCompletion } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logLateToolCompletion(logger, 'run-123', 'req-456', 'analyze-requirements', 5000);

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('timestamp');
      // Verify it's a valid ISO 8601 timestamp
      expect(new Date(logEntry.timestamp).toISOString()).toBe(logEntry.timestamp);
    });

    it('should include message in log entry', async () => {
      const { logLateToolCompletion } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logLateToolCompletion(logger, 'run-123', 'req-456', 'analyze-requirements', 5000);

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('message');
      expect(logEntry.message).toContain('Tool invocation completed');
      expect(logEntry.message).toContain('analyze-requirements');
    });

    it('should not emit MCP response (only logs)', async () => {
      const { logLateToolCompletion } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logLateToolCompletion(logger, 'run-123', 'req-456', 'analyze-requirements', 5000);

      // Should only have log output, no MCP response
      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      // Verify it's a log entry, not an MCP response
      expect(logEntry).toHaveProperty('level');
      expect(logEntry).toHaveProperty('message');
      expect(logEntry).toHaveProperty('timestamp');
      expect(logEntry).not.toHaveProperty('jsonrpc');
      expect(logEntry).not.toHaveProperty('result');
      expect(logEntry).not.toHaveProperty('error');
    });

    it('should apply redaction to sensitive fields in late completion', async () => {
      const { logLateToolCompletion } = await import('../../../src/mcp/handlers.js');

      // Create logger with custom redact keys
      const customLogger = new StructuredLogger(new SystemClock(), ['toolName']);

      // Create a separate capture for this test
      let testOutput = '';
      const originalWrite = process.stderr.write;
      
      process.stderr.write = ((chunk: string) => {
        testOutput += chunk;
        return true;
      }) as any;

      try {
        logLateToolCompletion(customLogger, 'run-123', 'req-456', 'secret-tool', 5000);

        expect(testOutput.length).toBeGreaterThan(0);
        const logEntry = JSON.parse(testOutput);

        // toolName should be redacted
        expect(logEntry.toolName).toBe('[REDACTED]');
      } finally {
        // Always restore stderr
        process.stderr.write = originalWrite;
      }
    });

    it('should handle all error codes in late completion', async () => {
      const { logLateToolCompletion } = await import('../../../src/mcp/handlers.js');

      const errorCodes = [
        ErrorCode.InvalidArgument,
        ErrorCode.NotFound,
        ErrorCode.Timeout,
        ErrorCode.ResourceExhausted,
        ErrorCode.Internal,
        ErrorCode.Unauthorized,
        ErrorCode.NotInitialized,
      ];

      for (const errorCode of errorCodes) {
        logOutput = [];
        logLateToolCompletion(logger, 'run-123', 'req-456', 'analyze-requirements', 5000, errorCode);

        expect(logOutput.length).toBeGreaterThan(0);
        const logEntry = JSON.parse(logOutput[0]);

        expect(logEntry.errorCode).toBe(errorCode);
        expect(logEntry.outcome).toBe('late_completed');
      }
    });
  });
});


describe('Disconnect-Triggered Tool Completion Logging', () => {
  let logger: StructuredLogger;
  let logOutput: string[] = [];
  let originalWrite: typeof process.stderr.write;

  beforeEach(() => {
    logger = new StructuredLogger(new SystemClock());
    logOutput = [];

    // Capture stderr output
    originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      logOutput.push(chunk);
      return true;
    }) as any;
  });

  afterEach(() => {
    // Restore stderr
    process.stderr.write = originalWrite;
  });

  describe('logDisconnectTriggeredCompletion', () => {
    it('should import and export logDisconnectTriggeredCompletion function', async () => {
      const { logDisconnectTriggeredCompletion } = await import('../../../src/mcp/handlers.js');
      expect(typeof logDisconnectTriggeredCompletion).toBe('function');
    });

    it('should log DisconnectedCompleted outcome when handler returns normally', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logDisconnectTriggeredCompletion(
        logger,
        'run-123',
        'req-456',
        'analyze-requirements',
        2000,
        ToolCompletionOutcome.DisconnectedCompleted
      );

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.outcome).toBe(ToolCompletionOutcome.DisconnectedCompleted);
      expect(logEntry.runId).toBe('run-123');
      expect(logEntry.correlationId).toBe('req-456');
      expect(logEntry.toolName).toBe('analyze-requirements');
      expect(logEntry.durationMs).toBe(2000);
    });

    it('should log Aborted outcome when handler throws due to abort', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logDisconnectTriggeredCompletion(
        logger,
        'run-123',
        'req-456',
        'analyze-requirements',
        1500,
        ToolCompletionOutcome.Aborted,
        ErrorCode.Internal
      );

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.outcome).toBe(ToolCompletionOutcome.Aborted);
      expect(logEntry.errorCode).toBe('INTERNAL');
      expect(logEntry.durationMs).toBe(1500);
    });

    it('should log LateCompleted outcome when handler exceeds deadline after disconnect', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logDisconnectTriggeredCompletion(
        logger,
        'run-123',
        'req-456',
        'analyze-requirements',
        35000,
        ToolCompletionOutcome.LateCompleted
      );

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.outcome).toBe(ToolCompletionOutcome.LateCompleted);
      expect(logEntry.durationMs).toBe(35000);
    });

    it('should log disconnect-triggered completion at WARN level', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logDisconnectTriggeredCompletion(
        logger,
        'run-123',
        'req-456',
        'analyze-requirements',
        2000,
        ToolCompletionOutcome.DisconnectedCompleted
      );

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe('warn');
    });

    it('should include optional errorCode when provided', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logDisconnectTriggeredCompletion(
        logger,
        'run-123',
        'req-456',
        'analyze-requirements',
        1500,
        ToolCompletionOutcome.Aborted,
        ErrorCode.Timeout
      );

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('errorCode', 'TIMEOUT');
    });

    it('should include optional payloadBytes when provided', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logDisconnectTriggeredCompletion(
        logger,
        'run-123',
        'req-456',
        'analyze-requirements',
        2000,
        ToolCompletionOutcome.DisconnectedCompleted,
        undefined,
        2048
      );

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('payloadBytes', 2048);
    });

    it('should include both errorCode and payloadBytes when provided', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logDisconnectTriggeredCompletion(
        logger,
        'run-123',
        'req-456',
        'analyze-requirements',
        1500,
        ToolCompletionOutcome.Aborted,
        ErrorCode.Internal,
        1024
      );

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('errorCode', 'INTERNAL');
      expect(logEntry).toHaveProperty('payloadBytes', 1024);
    });

    it('should not include optional fields when not provided', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logDisconnectTriggeredCompletion(
        logger,
        'run-123',
        'req-456',
        'analyze-requirements',
        2000,
        ToolCompletionOutcome.DisconnectedCompleted
      );

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).not.toHaveProperty('errorCode');
      expect(logEntry).not.toHaveProperty('payloadBytes');
    });

    it('should sanitize control characters in logged fields', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logDisconnectTriggeredCompletion(
        logger,
        'run-123\n',
        'req-456\t',
        'analyze\r',
        2000,
        ToolCompletionOutcome.DisconnectedCompleted
      );

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      // Control characters should be escaped
      expect(logEntry.runId).not.toContain('\n');
      expect(logEntry.correlationId).not.toContain('\t');
      expect(logEntry.toolName).not.toContain('\r');
    });

    it('should include timestamp in log entry', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logDisconnectTriggeredCompletion(
        logger,
        'run-123',
        'req-456',
        'analyze-requirements',
        2000,
        ToolCompletionOutcome.DisconnectedCompleted
      );

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('timestamp');
      // Verify it's a valid ISO 8601 timestamp
      expect(new Date(logEntry.timestamp).toISOString()).toBe(logEntry.timestamp);
    });

    it('should include message in log entry', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logDisconnectTriggeredCompletion(
        logger,
        'run-123',
        'req-456',
        'analyze-requirements',
        2000,
        ToolCompletionOutcome.DisconnectedCompleted
      );

      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry).toHaveProperty('message');
      expect(logEntry.message).toContain('Tool invocation completed');
      expect(logEntry.message).toContain('analyze-requirements');
    });

    it('should not emit MCP response (only logs)', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      logOutput = [];
      logDisconnectTriggeredCompletion(
        logger,
        'run-123',
        'req-456',
        'analyze-requirements',
        2000,
        ToolCompletionOutcome.DisconnectedCompleted
      );

      // Should only have log output, no MCP response
      expect(logOutput.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logOutput[0]);

      // Verify it's a log entry, not an MCP response
      expect(logEntry).toHaveProperty('level');
      expect(logEntry).toHaveProperty('message');
      expect(logEntry).toHaveProperty('timestamp');
      expect(logEntry).not.toHaveProperty('jsonrpc');
      expect(logEntry).not.toHaveProperty('result');
      expect(logEntry).not.toHaveProperty('error');
    });

    it('should apply redaction to sensitive fields in disconnect-triggered completion', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      // Create logger with custom redact keys
      const customLogger = new StructuredLogger(new SystemClock(), ['toolName']);

      // Create a separate capture for this test
      let testOutput = '';
      const originalWrite = process.stderr.write;
      
      process.stderr.write = ((chunk: string) => {
        testOutput += chunk;
        return true;
      }) as any;

      try {
        logDisconnectTriggeredCompletion(
          customLogger,
          'run-123',
          'req-456',
          'secret-tool',
          2000,
          ToolCompletionOutcome.DisconnectedCompleted
        );

        expect(testOutput.length).toBeGreaterThan(0);
        const logEntry = JSON.parse(testOutput);

        // toolName should be redacted
        expect(logEntry.toolName).toBe('[REDACTED]');
      } finally {
        // Always restore stderr
        process.stderr.write = originalWrite;
      }
    });

    it('should handle all disconnect-triggered outcomes', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      const outcomes = [
        ToolCompletionOutcome.DisconnectedCompleted,
        ToolCompletionOutcome.Aborted,
        ToolCompletionOutcome.LateCompleted,
      ];

      for (const outcome of outcomes) {
        logOutput = [];
        logDisconnectTriggeredCompletion(
          logger,
          'run-123',
          'req-456',
          'analyze-requirements',
          2000,
          outcome
        );

        expect(logOutput.length).toBeGreaterThan(0);
        const logEntry = JSON.parse(logOutput[0]);
        expect(logEntry.outcome).toBe(outcome);
      }
    });

    it('should reject invalid outcomes', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      // Try to use an invalid outcome (Success is not a disconnect-triggered outcome)
      expect(() => {
        logDisconnectTriggeredCompletion(
          logger,
          'run-123',
          'req-456',
          'analyze-requirements',
          2000,
          ToolCompletionOutcome.Success as any
        );
      }).toThrow();
    });

    it('should reject ToolError outcome', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      // ToolError is not a disconnect-triggered outcome
      expect(() => {
        logDisconnectTriggeredCompletion(
          logger,
          'run-123',
          'req-456',
          'analyze-requirements',
          2000,
          ToolCompletionOutcome.ToolError as any
        );
      }).toThrow();
    });

    it('should reject Timeout outcome', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      // Timeout is not a disconnect-triggered outcome
      expect(() => {
        logDisconnectTriggeredCompletion(
          logger,
          'run-123',
          'req-456',
          'analyze-requirements',
          2000,
          ToolCompletionOutcome.Timeout as any
        );
      }).toThrow();
    });

    it('should reject ProtocolError outcome', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      // ProtocolError is not a disconnect-triggered outcome
      expect(() => {
        logDisconnectTriggeredCompletion(
          logger,
          'run-123',
          'req-456',
          'analyze-requirements',
          2000,
          ToolCompletionOutcome.ProtocolError as any
        );
      }).toThrow();
    });

    it('should handle all error codes in disconnect-triggered completion', async () => {
      const { logDisconnectTriggeredCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');

      const errorCodes = [
        ErrorCode.InvalidArgument,
        ErrorCode.NotFound,
        ErrorCode.Timeout,
        ErrorCode.ResourceExhausted,
        ErrorCode.Internal,
        ErrorCode.Unauthorized,
        ErrorCode.NotInitialized,
      ];

      for (const errorCode of errorCodes) {
        logOutput = [];
        logDisconnectTriggeredCompletion(
          logger,
          'run-123',
          'req-456',
          'analyze-requirements',
          1500,
          ToolCompletionOutcome.Aborted,
          errorCode
        );

        expect(logOutput.length).toBeGreaterThan(0);
        const logEntry = JSON.parse(logOutput[0]);

        expect(logEntry.errorCode).toBe(errorCode);
        expect(logEntry.outcome).toBe(ToolCompletionOutcome.Aborted);
      }
    });
  });
});


describe('Protocol Error Handlers', () => {
  let session: SessionContext;
  let parentLogger: StructuredLogger;
  let idGenerator: DeterministicIdGenerator;

  beforeEach(() => {
    parentLogger = new StructuredLogger(new SystemClock());
    idGenerator = new DeterministicIdGenerator();
    session = createSession({ type: 'stdio' }, idGenerator, parentLogger);
  });

  describe('handleParseError', () => {
    it('should import and export handleParseError function', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');
      expect(typeof handleParseError).toBe('function');
    });

    it('should return JSON-RPC error with id: null', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id', null);
      expect(response).toHaveProperty('error');
    });

    it('should return correct error code (-32700)', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      expect(response.error.code).toBe(JSON_RPC_ERROR_CODES.PARSE_ERROR);
      expect(response.error.code).toBe(-32700);
    });

    it('should return correct error message', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      expect(response.error.message).toBe('Parse error');
    });

    it('should include connectionCorrelationId in error.data.correlationId', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      expect(response.error.data).toBeDefined();
      expect(response.error.data.correlationId).toBe(session.connectionCorrelationId);
    });

    it('should include error code in error.data', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      expect(response.error.data.code).toBe('PARSE_ERROR');
    });

    it('should include error message in error.data', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      expect(response.error.data.message).toBe('Invalid JSON');
    });

    it('should work from any session state', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const states: Array<SessionContext['state']> = ['STARTING', 'INITIALIZING', 'RUNNING', 'CLOSED'];

      for (const state of states) {
        const testSession = createSession({ type: 'stdio' }, idGenerator, parentLogger);
        (testSession as any).state = state;

        const response = handleParseError(testSession);

        expect(response.error.code).toBe(-32700);
        expect(response.id).toBe(null);
        expect(response.error.data.correlationId).toBe(testSession.connectionCorrelationId);
      }
    });

    it('should preserve unique connectionCorrelationId per session', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const session1 = createSession({ type: 'stdio' }, idGenerator, parentLogger);
      const session2 = createSession({ type: 'stdio' }, idGenerator, parentLogger);

      const response1 = handleParseError(session1);
      const response2 = handleParseError(session2);

      expect(response1.error.data.correlationId).toBe(session1.connectionCorrelationId);
      expect(response2.error.data.correlationId).toBe(session2.connectionCorrelationId);
      expect(response1.error.data.correlationId).not.toBe(response2.error.data.correlationId);
    });

    it('should return valid JSON-RPC error response shape', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      // Verify JSON-RPC structure
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(null);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBeDefined();
      expect(response.error.message).toBeDefined();
      expect(response.error.data).toBeDefined();

      // Verify error data structure
      expect(response.error.data.code).toBeDefined();
      expect(response.error.data.message).toBeDefined();
      expect(response.error.data.correlationId).toBeDefined();
    });

    it('should be serializable to JSON', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      // Should not throw
      const serialized = JSON.stringify(response);
      expect(typeof serialized).toBe('string');

      // Should be deserializable
      const deserialized = JSON.parse(serialized);
      expect(deserialized.jsonrpc).toBe('2.0');
      expect(deserialized.id).toBe(null);
      expect(deserialized.error.code).toBe(-32700);
    });

    it('should not include runId in error response', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      // Parse errors occur before tools/call, so no runId
      expect(response.error.data.runId).toBeUndefined();
    });

    it('should handle multiple parse errors on same session', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response1 = handleParseError(session);
      const response2 = handleParseError(session);

      // Both should have same connectionCorrelationId
      expect(response1.error.data.correlationId).toBe(response2.error.data.correlationId);
      expect(response1.error.data.correlationId).toBe(session.connectionCorrelationId);
    });

    it('should use connectionCorrelationId as fallback when request correlation unavailable', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      // Parse errors occur before request parsing, so request correlation is unavailable
      const response = handleParseError(session);

      // Should use connectionCorrelationId as fallback
      expect(response.error.data.correlationId).toBe(session.connectionCorrelationId);
    });
  });
});

describe('Result Wrapping', () => {
  let ctx: RequestContext;

  beforeEach(() => {
    ctx = {
      correlationId: 'req-456',
      runId: 'run-123',
      transport: { type: 'stdio' },
      connectionCorrelationId: 'conn-789',
      logger: new StructuredLogger(new SystemClock()),
    };
  });

  describe('wrapResult', () => {
    it('should import and export wrapResult function', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');
      expect(typeof wrapResult).toBe('function');
    });

    it('should wrap a simple object result', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = { status: 'success', data: [1, 2, 3] };
      const wrapped = wrapResult(result, ctx);

      expect(wrapped).toHaveProperty('content');
      expect(wrapped).toHaveProperty('isError', false);
      expect(wrapped.content).toHaveLength(1);
      expect(wrapped.content[0].type).toBe('text');

      // Verify the content is valid JSON
      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed).toEqual(result);
    });

    it('should wrap a string result', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = 'Hello, World!';
      const wrapped = wrapResult(result, ctx);

      expect(wrapped.isError).toBe(false);
      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed).toBe(result);
    });

    it('should wrap a number result', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = 42;
      const wrapped = wrapResult(result, ctx);

      expect(wrapped.isError).toBe(false);
      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed).toBe(result);
    });

    it('should wrap a boolean result', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = true;
      const wrapped = wrapResult(result, ctx);

      expect(wrapped.isError).toBe(false);
      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed).toBe(result);
    });

    it('should wrap a null result', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = null;
      const wrapped = wrapResult(result, ctx);

      expect(wrapped.isError).toBe(false);
      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed).toBe(null);
    });

    it('should wrap an array result', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = [1, 'two', { three: 3 }, null, true];
      const wrapped = wrapResult(result, ctx);

      expect(wrapped.isError).toBe(false);
      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed).toEqual(result);
    });

    it('should wrap a nested object result', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = {
        level1: {
          level2: {
            level3: {
              data: [1, 2, 3],
              nested: { key: 'value' },
            },
          },
        },
      };
      const wrapped = wrapResult(result, ctx);

      expect(wrapped.isError).toBe(false);
      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed).toEqual(result);
    });

    it('should return INTERNAL error for non-serializable result (circular reference)', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      // Create a circular reference
      const obj: any = { a: 1 };
      obj.self = obj;

      const wrapped = wrapResult(obj, ctx);

      expect(wrapped.isError).toBe(true);
      const parsed = JSON.parse(wrapped.content[0].text);

      expect(parsed.code).toBe(ErrorCode.Internal);
      expect(parsed.message).toBe('Result not serializable');
      expect(parsed.details).toEqual({ reason: 'result_not_serializable' });
      expect(parsed.correlationId).toBe('req-456');
      expect(parsed.runId).toBe('run-123');
    });

    it('should return INTERNAL error for non-serializable result (BigInt)', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = { value: BigInt(9007199254740991) };
      const wrapped = wrapResult(result, ctx);

      expect(wrapped.isError).toBe(true);
      const parsed = JSON.parse(wrapped.content[0].text);

      expect(parsed.code).toBe(ErrorCode.Internal);
      expect(parsed.details).toEqual({ reason: 'result_not_serializable' });
    });

    it('should return INTERNAL error for non-serializable result (function)', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      // Functions in objects are skipped by JSON.stringify, so we need a different approach
      // Use a replacer that throws to simulate a non-serializable value
      const result = {
        get value() {
          throw new Error('Cannot serialize');
        },
      };
      const wrapped = wrapResult(result, ctx);

      expect(wrapped.isError).toBe(true);
      const parsed = JSON.parse(wrapped.content[0].text);

      expect(parsed.code).toBe(ErrorCode.Internal);
      expect(parsed.details).toEqual({ reason: 'result_not_serializable' });
    });

    it('should handle result with large payload', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const largeArray = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        data: `Item ${i}`,
      }));
      const wrapped = wrapResult(largeArray, ctx);

      expect(wrapped.isError).toBe(false);
      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed).toHaveLength(10000);
      expect(parsed[0]).toEqual({ id: 0, data: 'Item 0' });
    });

    it('should not mutate the original result object', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = { status: 'success', data: [1, 2, 3] };
      const originalResult = JSON.parse(JSON.stringify(result));

      wrapResult(result, ctx);

      expect(result).toEqual(originalResult);
    });

    it('should include content array with single text element', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = { test: 'data' };
      const wrapped = wrapResult(result, ctx);

      expect(Array.isArray(wrapped.content)).toBe(true);
      expect(wrapped.content).toHaveLength(1);
      expect(wrapped.content[0]).toHaveProperty('type', 'text');
      expect(wrapped.content[0]).toHaveProperty('text');
      expect(typeof wrapped.content[0].text).toBe('string');
    });

    it('should set isError to false for successful results', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = { success: true };
      const wrapped = wrapResult(result, ctx);

      expect(wrapped.isError).toBe(false);
    });

    it('should handle empty object result', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = {};
      const wrapped = wrapResult(result, ctx);

      expect(wrapped.isError).toBe(false);
      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed).toEqual({});
    });

    it('should handle empty array result', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = [];
      const wrapped = wrapResult(result, ctx);

      expect(wrapped.isError).toBe(false);
      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed).toEqual([]);
    });

    it('should handle result with special characters', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const result = {
        text: 'Hello\nWorld\t!',
        unicode: '你好世界',
        emoji: '🚀',
      };
      const wrapped = wrapResult(result, ctx);

      expect(wrapped.isError).toBe(false);
      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed).toEqual(result);
    });

    it('should handle result with large payload', async () => {
      const { wrapResult } = await import('../../../src/mcp/handlers.js');

      const largeArray = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        data: `Item ${i}`,
      }));
      const wrapped = wrapResult(largeArray, ctx);

      expect(wrapped.isError).toBe(false);
      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed).toHaveLength(10000);
      expect(parsed[0]).toEqual({ id: 0, data: 'Item 0' });
    });
  });

  describe('wrapToolError', () => {
    it('should import and export wrapToolError function', async () => {
      const { wrapToolError } = await import('../../../src/mcp/handlers.js');
      expect(typeof wrapToolError).toBe('function');
    });

    it('should wrap a StructuredError with correlationId and runId', async () => {
      const { wrapToolError } = await import('../../../src/mcp/handlers.js');

      const error = createError(ErrorCode.NotFound, 'Tool not found');
      const wrapped = wrapToolError(error, ctx);

      expect(wrapped.isError).toBe(true);
      const parsed = JSON.parse(wrapped.content[0].text);

      expect(parsed.code).toBe(ErrorCode.NotFound);
      expect(parsed.message).toBe('Tool not found');
      expect(parsed.correlationId).toBe('req-456');
      expect(parsed.runId).toBe('run-123');
    });

    it('should wrap error with details', async () => {
      const { wrapToolError } = await import('../../../src/mcp/handlers.js');

      const error = createError(ErrorCode.InvalidArgument, 'Invalid input', {
        field: 'name',
        reason: 'required',
      });
      const wrapped = wrapToolError(error, ctx);

      expect(wrapped.isError).toBe(true);
      const parsed = JSON.parse(wrapped.content[0].text);

      expect(parsed.details).toEqual({
        field: 'name',
        reason: 'required',
      });
    });

    it('should include correlationId even without runId', async () => {
      const { wrapToolError } = await import('../../../src/mcp/handlers.js');

      const ctxWithoutRunId: RequestContext = {
        correlationId: 'req-456',
        transport: { type: 'stdio' },
        connectionCorrelationId: 'conn-789',
        logger: new StructuredLogger(new SystemClock()),
      };

      const error = createError(ErrorCode.Internal, 'Internal error');
      const wrapped = wrapToolError(error, ctxWithoutRunId);

      expect(wrapped.isError).toBe(true);
      const parsed = JSON.parse(wrapped.content[0].text);

      expect(parsed.correlationId).toBe('req-456');
      expect(parsed.runId).toBeUndefined();
    });

    it('should not include runId if not in context', async () => {
      const { wrapToolError } = await import('../../../src/mcp/handlers.js');

      const ctxWithoutRunId: RequestContext = {
        correlationId: 'req-456',
        transport: { type: 'stdio' },
        connectionCorrelationId: 'conn-789',
        logger: new StructuredLogger(new SystemClock()),
      };

      const error = createError(ErrorCode.Timeout, 'Timeout');
      const wrapped = wrapToolError(error, ctxWithoutRunId);

      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed).not.toHaveProperty('runId');
    });

    it('should set isError to true', async () => {
      const { wrapToolError } = await import('../../../src/mcp/handlers.js');

      const error = createError(ErrorCode.ResourceExhausted, 'Too many requests');
      const wrapped = wrapToolError(error, ctx);

      expect(wrapped.isError).toBe(true);
    });

    it('should include content array with single text element', async () => {
      const { wrapToolError } = await import('../../../src/mcp/handlers.js');

      const error = createError(ErrorCode.Unauthorized, 'Unauthorized');
      const wrapped = wrapToolError(error, ctx);

      expect(Array.isArray(wrapped.content)).toBe(true);
      expect(wrapped.content).toHaveLength(1);
      expect(wrapped.content[0].type).toBe('text');
      expect(typeof wrapped.content[0].text).toBe('string');
    });

    it('should not mutate the original error object', async () => {
      const { wrapToolError } = await import('../../../src/mcp/handlers.js');

      const error = createError(ErrorCode.Internal, 'Error', { key: 'value' });
      const originalError = JSON.parse(JSON.stringify(error));

      wrapToolError(error, ctx);

      expect(error).toEqual(originalError);
    });

    it('should handle all error codes', async () => {
      const { wrapToolError } = await import('../../../src/mcp/handlers.js');

      const errorCodes = [
        ErrorCode.InvalidArgument,
        ErrorCode.NotFound,
        ErrorCode.Timeout,
        ErrorCode.ResourceExhausted,
        ErrorCode.Internal,
        ErrorCode.Unauthorized,
        ErrorCode.NotInitialized,
      ];

      for (const code of errorCodes) {
        const error = createError(code, `Error: ${code}`);
        const wrapped = wrapToolError(error, ctx);

        expect(wrapped.isError).toBe(true);
        const parsed = JSON.parse(wrapped.content[0].text);
        expect(parsed.code).toBe(code);
      }
    });

    it('should preserve error message', async () => {
      const { wrapToolError } = await import('../../../src/mcp/handlers.js');

      const message = 'This is a detailed error message';
      const error = createError(ErrorCode.Internal, message);
      const wrapped = wrapToolError(error, ctx);

      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed.message).toBe(message);
    });

    it('should handle error with complex details', async () => {
      const { wrapToolError } = await import('../../../src/mcp/handlers.js');

      const error = createError(ErrorCode.InvalidArgument, 'Validation failed', {
        errors: [
          { field: 'name', message: 'Required' },
          { field: 'email', message: 'Invalid format' },
        ],
        timestamp: new Date().toISOString(),
      });
      const wrapped = wrapToolError(error, ctx);

      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed.details.errors).toHaveLength(2);
      expect(parsed.details.timestamp).toBeDefined();
    });

    it('should handle error without details', async () => {
      const { wrapToolError } = await import('../../../src/mcp/handlers.js');

      const error = createError(ErrorCode.Timeout, 'Operation timed out');
      const wrapped = wrapToolError(error, ctx);

      const parsed = JSON.parse(wrapped.content[0].text);
      expect(parsed.details).toBeUndefined();
    });
  });
});

describe('Protocol Error Handlers', () => {
  let session: SessionContext;
  let parentLogger: StructuredLogger;
  let idGenerator: DeterministicIdGenerator;

  beforeEach(() => {
    parentLogger = new StructuredLogger(new SystemClock());
    idGenerator = new DeterministicIdGenerator();
    session = createSession({ type: 'stdio' }, idGenerator, parentLogger);
  });

  describe('handleParseError', () => {
    it('should return JSON-RPC error with code -32700', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      expect(response.error.code).toBe(JSON_RPC_ERROR_CODES.PARSE_ERROR);
      expect(response.error.code).toBe(-32700);
    });

    it('should return id: null for parse errors', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      expect(response.id).toBeNull();
    });

    it('should include connectionCorrelationId in error data', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      expect(response.error.data).toBeDefined();
      expect(response.error.data.correlationId).toBe(session.connectionCorrelationId);
    });

    it('should have correct error message', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      expect(response.error.message).toBe('Parse error');
    });

    it('should include PARSE_ERROR code in data', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      expect(response.error.data.code).toBe('PARSE_ERROR');
    });

    it('should include descriptive message in data', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      expect(response.error.data.message).toBe('Invalid JSON');
    });

    it('should return valid JSON-RPC error response', async () => {
      const { handleParseError } = await import('../../../src/mcp/handlers.js');

      const response = handleParseError(session);

      expect(response.jsonrpc).toBe('2.0');
      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('error');
      expect(response.error).toHaveProperty('code');
      expect(response.error).toHaveProperty('message');
      expect(response.error).toHaveProperty('data');
    });
  });

  describe('handleInvalidRequest', () => {
    it('should return JSON-RPC error with code -32600', async () => {
      const { handleInvalidRequest } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidRequest(session);

      expect(response.error.code).toBe(JSON_RPC_ERROR_CODES.INVALID_REQUEST);
      expect(response.error.code).toBe(-32600);
    });

    it('should return id: null for invalid requests', async () => {
      const { handleInvalidRequest } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidRequest(session);

      expect(response.id).toBeNull();
    });

    it('should include connectionCorrelationId in error data', async () => {
      const { handleInvalidRequest } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidRequest(session);

      expect(response.error.data).toBeDefined();
      expect(response.error.data.correlationId).toBe(session.connectionCorrelationId);
    });

    it('should have correct error message', async () => {
      const { handleInvalidRequest } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidRequest(session);

      expect(response.error.message).toBe('Invalid Request');
    });

    it('should include INVALID_REQUEST code in data', async () => {
      const { handleInvalidRequest } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidRequest(session);

      expect(response.error.data.code).toBe('INVALID_REQUEST');
    });

    it('should include descriptive message in data', async () => {
      const { handleInvalidRequest } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidRequest(session);

      expect(response.error.data.message).toBe('Invalid JSON-RPC request structure');
    });

    it('should return valid JSON-RPC error response', async () => {
      const { handleInvalidRequest } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidRequest(session);

      expect(response.jsonrpc).toBe('2.0');
      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('error');
      expect(response.error).toHaveProperty('code');
      expect(response.error).toHaveProperty('message');
      expect(response.error).toHaveProperty('data');
    });

    it('should use connection correlation ID when request id is invalid', async () => {
      const { handleInvalidRequest } = await import('../../../src/mcp/handlers.js');

      const originalCorrelationId = session.connectionCorrelationId;
      const response = handleInvalidRequest(session);

      expect(response.error.data.correlationId).toBe(originalCorrelationId);
    });

    it('should handle multiple invalid requests with different correlation IDs', async () => {
      const { handleInvalidRequest } = await import('../../../src/mcp/handlers.js');

      const session1 = createSession({ type: 'stdio' }, idGenerator, parentLogger);
      const session2 = createSession({ type: 'stdio' }, idGenerator, parentLogger);

      const response1 = handleInvalidRequest(session1);
      const response2 = handleInvalidRequest(session2);

      expect(response1.error.data.correlationId).toBe(session1.connectionCorrelationId);
      expect(response2.error.data.correlationId).toBe(session2.connectionCorrelationId);
      expect(response1.error.data.correlationId).not.toBe(response2.error.data.correlationId);
    });

    it('should be distinguishable from parse error', async () => {
      const { handleInvalidRequest, handleParseError } = await import('../../../src/mcp/handlers.js');

      const invalidResponse = handleInvalidRequest(session);
      const parseResponse = handleParseError(session);

      expect(invalidResponse.error.code).not.toBe(parseResponse.error.code);
      expect(invalidResponse.error.code).toBe(-32600);
      expect(parseResponse.error.code).toBe(-32700);
    });

    it('should work from any session state', async () => {
      const { handleInvalidRequest } = await import('../../../src/mcp/handlers.js');

      const states: Array<SessionContext['state']> = ['STARTING', 'INITIALIZING', 'RUNNING', 'CLOSED'];

      for (const state of states) {
        const testSession = createSession({ type: 'stdio' }, idGenerator, parentLogger);
        (testSession as any).state = state;

        const response = handleInvalidRequest(testSession);

        expect(response.error.code).toBe(-32600);
        expect(response.id).toBeNull();
        expect(response.error.data.correlationId).toBe(testSession.connectionCorrelationId);
      }
    });
  });

  describe('handleMethodNotFound', () => {
    it('should return JSON-RPC error with code -32601', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const response = handleMethodNotFound(session, 'unknown/method');

      expect(response.error.code).toBe(JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND);
      expect(response.error.code).toBe(-32601);
    });

    it('should include method name in error message', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const methodName = 'custom/operation';
      const response = handleMethodNotFound(session, methodName);

      expect(response.error.message).toContain(methodName);
      expect(response.error.message).toBe(`Method not found: ${methodName}`);
    });

    it('should include method name in data message', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const methodName = 'test/method';
      const response = handleMethodNotFound(session, methodName);

      expect(response.error.data.message).toContain(methodName);
      expect(response.error.data.message).toBe(`Unknown method: ${methodName}`);
    });

    it('should include connectionCorrelationId in error data', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const response = handleMethodNotFound(session, 'unknown/method');

      expect(response.error.data).toBeDefined();
      expect(response.error.data.correlationId).toBe(session.connectionCorrelationId);
    });

    it('should include METHOD_NOT_FOUND code in data', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const response = handleMethodNotFound(session, 'unknown/method');

      expect(response.error.data.code).toBe('METHOD_NOT_FOUND');
    });

    it('should return request id when provided as number', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const requestId = 42;
      const response = handleMethodNotFound(session, 'unknown/method', requestId);

      expect(response.id).toBe(requestId);
    });

    it('should return request id when provided as string', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const requestId = 'req-123';
      const response = handleMethodNotFound(session, 'unknown/method', requestId);

      expect(response.id).toBe(requestId);
    });

    it('should return null id when request id is not provided', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const response = handleMethodNotFound(session, 'unknown/method');

      expect(response.id).toBeNull();
    });

    it('should return null id when request id is explicitly null', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const response = handleMethodNotFound(session, 'unknown/method', null);

      expect(response.id).toBeNull();
    });

    it('should return valid JSON-RPC error response', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const response = handleMethodNotFound(session, 'unknown/method', 1);

      expect(response.jsonrpc).toBe('2.0');
      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('error');
      expect(response.error).toHaveProperty('code');
      expect(response.error).toHaveProperty('message');
      expect(response.error).toHaveProperty('data');
    });

    it('should handle various method names', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const methodNames = [
        'tools/list',
        'tools/call',
        'resources/read',
        'custom/operation',
        'deeply/nested/method',
        'method-with-dashes',
        'method_with_underscores',
      ];

      for (const methodName of methodNames) {
        const response = handleMethodNotFound(session, methodName, 1);

        expect(response.error.message).toContain(methodName);
        expect(response.error.code).toBe(-32601);
      }
    });

    it('should work from any session state', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const states: Array<SessionContext['state']> = ['STARTING', 'INITIALIZING', 'RUNNING', 'CLOSED'];

      for (const state of states) {
        const testSession = createSession({ type: 'stdio' }, idGenerator, parentLogger);
        (testSession as any).state = state;

        const response = handleMethodNotFound(testSession, 'unknown/method', 1);

        expect(response.error.code).toBe(-32601);
        expect(response.id).toBe(1);
        expect(response.error.data.correlationId).toBe(testSession.connectionCorrelationId);
      }
    });

    it('should be serializable to JSON', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const response = handleMethodNotFound(session, 'unknown/method', 'test-id');

      // Should not throw
      const serialized = JSON.stringify(response);
      expect(typeof serialized).toBe('string');

      // Should be deserializable
      const deserialized = JSON.parse(serialized);
      expect(deserialized.jsonrpc).toBe('2.0');
      expect(deserialized.id).toBe('test-id');
      expect(deserialized.error.code).toBe(-32601);
    });

    it('should handle empty method name', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const response = handleMethodNotFound(session, '', 1);

      expect(response.error.message).toBe('Method not found: ');
      expect(response.error.data.message).toBe('Unknown method: ');
    });

    it('should preserve unique connectionCorrelationId per session', async () => {
      const { handleMethodNotFound } = await import('../../../src/mcp/handlers.js');

      const session1 = createSession({ type: 'stdio' }, idGenerator, parentLogger);
      const session2 = createSession({ type: 'stdio' }, idGenerator, parentLogger);

      const response1 = handleMethodNotFound(session1, 'method1', 1);
      const response2 = handleMethodNotFound(session2, 'method2', 2);

      expect(response1.error.data.correlationId).toBe(session1.connectionCorrelationId);
      expect(response2.error.data.correlationId).toBe(session2.connectionCorrelationId);
      expect(response1.error.data.correlationId).not.toBe(response2.error.data.correlationId);
    });
  });

  describe('handleInvalidParams', () => {
    it('should return JSON-RPC error with code -32602', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidParams(session, 'Parameters must be an object');

      expect(response.error.code).toBe(JSON_RPC_ERROR_CODES.INVALID_PARAMS);
      expect(response.error.code).toBe(-32602);
    });

    it('should include details in error message when provided', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const details = 'Parameters must be an object';
      const response = handleInvalidParams(session, undefined, details);

      expect(response.error.message).toBe(`Invalid params: ${details}`);
    });

    it('should use default message when no details provided', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidParams(session);

      expect(response.error.message).toBe('Invalid params');
    });

    it('should include details in data message when provided', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const details = 'Parameter "name" must be a string';
      const response = handleInvalidParams(session, undefined, details);

      expect(response.error.data.message).toBe(details);
    });

    it('should use default data message when no details provided', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidParams(session);

      expect(response.error.data.message).toBe('Invalid method parameters');
    });

    it('should include connectionCorrelationId in error data', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidParams(session, undefined, 'Invalid parameters');

      expect(response.error.data).toBeDefined();
      expect(response.error.data.correlationId).toBe(session.connectionCorrelationId);
    });

    it('should include INVALID_PARAMS code in data', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidParams(session, undefined, 'Invalid parameters');

      expect(response.error.data.code).toBe('INVALID_PARAMS');
    });

    it('should return request id when provided as number', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const requestId = 42;
      const response = handleInvalidParams(session, requestId, 'Invalid parameters');

      expect(response.id).toBe(requestId);
    });

    it('should return request id when provided as string', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const requestId = 'req-123';
      const response = handleInvalidParams(session, requestId, 'Invalid parameters');

      expect(response.id).toBe(requestId);
    });

    it('should return null id when request id is not provided', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidParams(session, undefined, 'Invalid parameters');

      expect(response.id).toBeNull();
    });

    it('should return null id when request id is explicitly null', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidParams(session, null, 'Invalid parameters');

      expect(response.id).toBeNull();
    });

    it('should return valid JSON-RPC error response', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidParams(session, 1, 'Invalid parameters');

      expect(response.jsonrpc).toBe('2.0');
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32602);
      expect(response.error.message).toBeDefined();
      expect(response.error.data).toBeDefined();
    });

    it('should handle various parameter validation messages', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const testCases = [
        'Parameters must be an object',
        'Parameter "name" must be a string',
        'Missing required parameter "id"',
        'Parameter "count" must be a positive integer',
        'Invalid parameter format'
      ];

      for (const details of testCases) {
        const response = handleInvalidParams(session, 1, details);

        expect(response.error.message).toContain(details);
        expect(response.error.data.message).toBe(details);
      }
    });

    it('should work from any session state', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const states: Array<SessionContext['state']> = ['STARTING', 'INITIALIZING', 'RUNNING', 'CLOSED'];

      for (const state of states) {
        const testSession = createSession({ type: 'stdio' }, idGenerator, parentLogger);
        (testSession as any).state = state;

        const response = handleInvalidParams(testSession, 1, 'Invalid parameters');

        expect(response.error.code).toBe(-32602);
        expect(response.error.data.correlationId).toBe(testSession.connectionCorrelationId);
      }
    });

    it('should be serializable to JSON', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidParams(session, 'test-id', 'Invalid parameters');

      // Should not throw
      expect(() => JSON.stringify(response)).not.toThrow();

      const serialized = JSON.stringify(response);
      const parsed = JSON.parse(serialized);

      expect(parsed.jsonrpc).toBe('2.0');
      expect(parsed.id).toBe('test-id');
      expect(parsed.error.code).toBe(-32602);
    });

    it('should handle empty details string', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const response = handleInvalidParams(session, 1, '');

      expect(response.error.message).toBe('Invalid params: ');
      expect(response.error.data.message).toBe('');
    });

    it('should preserve unique connectionCorrelationId per session', async () => {
      const { handleInvalidParams } = await import('../../../src/mcp/handlers.js');

      const session1 = createSession({ type: 'stdio' }, idGenerator, parentLogger);
      const session2 = createSession({ type: 'stdio' }, idGenerator, parentLogger);

      const response1 = handleInvalidParams(session1, 1, 'Invalid params 1');
      const response2 = handleInvalidParams(session2, 2, 'Invalid params 2');

      expect(response1.error.data.correlationId).toBe(session1.connectionCorrelationId);
      expect(response2.error.data.correlationId).toBe(session2.connectionCorrelationId);
      expect(response1.error.data.correlationId).not.toBe(response2.error.data.correlationId);
    });
  });
});
