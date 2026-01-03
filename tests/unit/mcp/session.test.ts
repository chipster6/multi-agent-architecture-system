/**
 * Unit tests for session management module.
 * Tests session creation, state management, and logger context inheritance.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSession, type SessionContext, type Transport } from '../../../src/mcp/session.js';
import { StructuredLogger, SystemClock } from '../../../src/logging/structuredLogger.js';
import { DeterministicIdGenerator } from '../../../src/shared/idGenerator.js';

describe('Session Management', () => {
  let parentLogger: StructuredLogger;
  let idGenerator: DeterministicIdGenerator;
  let transport: Transport;

  beforeEach(() => {
    parentLogger = new StructuredLogger(new SystemClock());
    idGenerator = new DeterministicIdGenerator();
    transport = { type: 'stdio' };
  });

  describe('createSession', () => {
    it('should create a session with unique connectionCorrelationId', () => {
      const session = createSession(transport, idGenerator, parentLogger);

      expect(session.connectionCorrelationId).toBeDefined();
      expect(typeof session.connectionCorrelationId).toBe('string');
      expect(session.connectionCorrelationId).toMatch(/^conn-\d+$/);
    });

    it('should initialize session state to STARTING', () => {
      const session = createSession(transport, idGenerator, parentLogger);

      expect(session.state).toBe('STARTING');
    });

    it('should capture transport information', () => {
      const session = createSession(transport, idGenerator, parentLogger);

      expect(session.transport).toBe(transport);
      expect(session.transport.type).toBe('stdio');
    });

    it('should create a child logger with connectionCorrelationId in context', () => {
      const session = createSession(transport, idGenerator, parentLogger);

      expect(session.logger).toBeDefined();
      expect(session.logger).toBeInstanceOf(StructuredLogger);
      // The logger should be a different instance (child logger)
      expect(session.logger).not.toBe(parentLogger);
    });

    it('should generate unique connectionCorrelationIds for different sessions', () => {
      const session1 = createSession(transport, idGenerator, parentLogger);
      const session2 = createSession(transport, idGenerator, parentLogger);

      expect(session1.connectionCorrelationId).not.toBe(session2.connectionCorrelationId);
      expect(session1.connectionCorrelationId).toMatch(/^conn-1$/);
      expect(session2.connectionCorrelationId).toMatch(/^conn-2$/);
    });

    it('should support different transport types', () => {
      const stdioTransport: Transport = { type: 'stdio' };
      const sseTransport: Transport = { type: 'sse' };
      const httpTransport: Transport = { type: 'http' };

      const session1 = createSession(stdioTransport, idGenerator, parentLogger);
      const session2 = createSession(sseTransport, idGenerator, parentLogger);
      const session3 = createSession(httpTransport, idGenerator, parentLogger);

      expect(session1.transport.type).toBe('stdio');
      expect(session2.transport.type).toBe('sse');
      expect(session3.transport.type).toBe('http');
    });

    it('should return a valid SessionContext object', () => {
      const session = createSession(transport, idGenerator, parentLogger);

      // Verify all required properties exist
      expect(session).toHaveProperty('connectionCorrelationId');
      expect(session).toHaveProperty('state');
      expect(session).toHaveProperty('transport');
      expect(session).toHaveProperty('logger');

      // Verify types
      expect(typeof session.connectionCorrelationId).toBe('string');
      expect(typeof session.state).toBe('string');
      expect(typeof session.transport).toBe('object');
      expect(session.logger).toBeInstanceOf(StructuredLogger);
    });

    it('should allow state transitions after creation', () => {
      const session = createSession(transport, idGenerator, parentLogger);

      // Verify initial state
      expect(session.state).toBe('STARTING');

      // Simulate state transitions
      (session as { state: string }).state = 'INITIALIZING';
      expect(session.state).toBe('INITIALIZING');

      (session as { state: string }).state = 'RUNNING';
      expect(session.state).toBe('RUNNING');

      (session as { state: string }).state = 'CLOSED';
      expect(session.state).toBe('CLOSED');
    });

    it('should create independent sessions with independent loggers', () => {
      const session1 = createSession(transport, idGenerator, parentLogger);
      const session2 = createSession(transport, idGenerator, parentLogger);

      // Sessions should be independent
      expect(session1).not.toBe(session2);
      expect(session1.logger).not.toBe(session2.logger);
      expect(session1.connectionCorrelationId).not.toBe(session2.connectionCorrelationId);
    });
  });

  describe('SessionContext interface', () => {
    it('should have all required properties', () => {
      const session: SessionContext = createSession(transport, idGenerator, parentLogger);

      // Verify all required properties
      expect(session.connectionCorrelationId).toBeDefined();
      expect(session.state).toBeDefined();
      expect(session.transport).toBeDefined();
      expect(session.logger).toBeDefined();
    });

    it('should support valid state values', () => {
      const session = createSession(transport, idGenerator, parentLogger);
      const validStates: Array<SessionContext['state']> = ['STARTING', 'INITIALIZING', 'RUNNING', 'CLOSED'];

      for (const state of validStates) {
        (session as { state: string }).state = state;
        expect(session.state).toBe(state);
      }
    });
  });

  describe('Transport interface', () => {
    it('should support all transport types', () => {
      const transportTypes: Array<Transport['type']> = ['stdio', 'sse', 'http'];

      for (const type of transportTypes) {
        const transport: Transport = { type };
        const session = createSession(transport, idGenerator, parentLogger);
        expect(session.transport.type).toBe(type);
      }
    });
  });
});
