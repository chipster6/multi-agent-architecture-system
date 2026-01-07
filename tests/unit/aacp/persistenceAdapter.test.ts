import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAACPPersistenceAdapter } from '../../../src/aacp/persistenceAdapter.js';
import { AACPOutcome } from '../../../src/aacp/types.js';
import type { AACPRequestRecord, AACPMessageRecord, AACPEnvelope } from '../../../src/aacp/types.js';
import type { StructuredError } from '../../../src/errors/index.js';

describe('InMemoryAACPPersistenceAdapter', () => {
  let adapter: InMemoryAACPPersistenceAdapter;

  beforeEach(() => {
    adapter = new InMemoryAACPPersistenceAdapter();
  });

  describe('Request Record Operations', () => {
    it('should store and retrieve request records', async () => {
      const requestRecord: AACPRequestRecord = {
        requestId: 'req-123',
        sourceAgentId: 'agent-1',
        targetAgentId: 'agent-2',
        messageType: 'REQUEST',
        payload: { test: 'data' },
        status: AACPOutcome.UNKNOWN,
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      await adapter.putRequestRecord('req-123', requestRecord);
      const retrieved = await adapter.getRequestRecord('req-123');

      expect(retrieved).toEqual(requestRecord);
    });

    it('should return null for non-existent request records', async () => {
      const result = await adapter.getRequestRecord('non-existent');
      expect(result).toBeNull();
    });

    it('should mark requests as completed', async () => {
      const requestRecord: AACPRequestRecord = {
        requestId: 'req-123',
        sourceAgentId: 'agent-1',
        targetAgentId: 'agent-2',
        messageType: 'REQUEST',
        payload: { test: 'data' },
        status: AACPOutcome.UNKNOWN,
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      await adapter.putRequestRecord('req-123', requestRecord);
      await adapter.markCompleted('req-123', AACPOutcome.COMPLETED, 'completion-ref');

      const retrieved = await adapter.getRequestRecord('req-123');
      expect(retrieved?.status).toBe(AACPOutcome.COMPLETED);
      expect(retrieved?.completionRef).toBe('completion-ref');
    });

    it('should mark requests as failed', async () => {
      const requestRecord: AACPRequestRecord = {
        requestId: 'req-123',
        sourceAgentId: 'agent-1',
        targetAgentId: 'agent-2',
        messageType: 'REQUEST',
        payload: { test: 'data' },
        status: AACPOutcome.UNKNOWN,
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      const error: StructuredError = {
        code: 'INTERNAL',
        message: 'Test error'
      };

      await adapter.putRequestRecord('req-123', requestRecord);
      await adapter.markFailed('req-123', error);

      const retrieved = await adapter.getRequestRecord('req-123');
      expect(retrieved?.status).toBe(AACPOutcome.FAILED);
      expect(retrieved?.error).toEqual(error);
    });
  });

  describe('Message Record Operations', () => {
    it('should store and retrieve message records', async () => {
      const envelope: AACPEnvelope = {
        messageId: 'msg-123',
        requestId: 'req-123',
        sourceAgentId: 'agent-1',
        targetAgentId: 'agent-2',
        seq: 1,
        messageType: 'REQUEST',
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { test: 'data' }
      };

      const messageRecord: AACPMessageRecord = {
        messageId: 'msg-123',
        requestId: 'req-123',
        envelope,
        status: AACPOutcome.UNKNOWN,
        timestamp: '2024-01-01T00:00:00.000Z',
        retryCount: 0
      };

      await adapter.putMessageRecord('msg-123', messageRecord);
      const retrieved = await adapter.getMessageRecord('msg-123');

      expect(retrieved).toEqual(messageRecord);
    });
  });

  describe('Sequence Tracking', () => {
    it('should track sequence numbers per agent pair', async () => {
      const initialSeq = await adapter.getLastSequence('agent-1', 'agent-2');
      expect(initialSeq).toBe(0);

      await adapter.updateLastSequence('agent-1', 'agent-2', 5);
      const updatedSeq = await adapter.getLastSequence('agent-1', 'agent-2');
      expect(updatedSeq).toBe(5);
    });

    it('should only update sequence if higher (monotonic)', async () => {
      await adapter.updateLastSequence('agent-1', 'agent-2', 10);
      await adapter.updateLastSequence('agent-1', 'agent-2', 5); // Lower, should not update

      const seq = await adapter.getLastSequence('agent-1', 'agent-2');
      expect(seq).toBe(10);
    });
  });

  describe('Retention Operations', () => {
    it('should purge expired records deterministically', async () => {
      const now = new Date('2024-01-01T12:00:00.000Z');
      const expired = new Date('2024-01-01T10:00:00.000Z').toISOString();
      const notExpired = new Date('2024-01-01T14:00:00.000Z').toISOString();

      // Add expired request record
      const expiredRequest: AACPRequestRecord = {
        requestId: 'expired-req',
        sourceAgentId: 'agent-1',
        targetAgentId: 'agent-2',
        messageType: 'REQUEST',
        payload: {},
        status: AACPOutcome.COMPLETED,
        timestamp: '2024-01-01T00:00:00.000Z',
        expiresAt: expired
      };

      // Add non-expired request record
      const activeRequest: AACPRequestRecord = {
        requestId: 'active-req',
        sourceAgentId: 'agent-1',
        targetAgentId: 'agent-2',
        messageType: 'REQUEST',
        payload: {},
        status: AACPOutcome.COMPLETED,
        timestamp: '2024-01-01T00:00:00.000Z',
        expiresAt: notExpired
      };

      await adapter.putRequestRecord('expired-req', expiredRequest);
      await adapter.putRequestRecord('active-req', activeRequest);

      const purgedCount = await adapter.purgeExpired(now);
      expect(purgedCount).toBe(1);

      // Verify expired record is gone
      const expiredResult = await adapter.getRequestRecord('expired-req');
      expect(expiredResult).toBeNull();

      // Verify active record remains
      const activeResult = await adapter.getRequestRecord('active-req');
      expect(activeResult).not.toBeNull();
    });
  });

  describe('Recovery Operations', () => {
    it('should list pending requests', async () => {
      const pendingRequest: AACPRequestRecord = {
        requestId: 'pending-req',
        sourceAgentId: 'agent-1',
        targetAgentId: 'agent-2',
        messageType: 'REQUEST',
        payload: {},
        status: AACPOutcome.UNKNOWN,
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      const completedRequest: AACPRequestRecord = {
        requestId: 'completed-req',
        sourceAgentId: 'agent-1',
        targetAgentId: 'agent-2',
        messageType: 'REQUEST',
        payload: {},
        status: AACPOutcome.COMPLETED,
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      await adapter.putRequestRecord('pending-req', pendingRequest);
      await adapter.putRequestRecord('completed-req', completedRequest);

      const pending = await adapter.listPendingRequests();
      expect(pending).toHaveLength(1);
      expect(pending[0].requestId).toBe('pending-req');
    });
  });

  describe('Statistics and Management', () => {
    it('should provide storage statistics', () => {
      const stats = adapter.getStats();
      expect(stats).toEqual({
        requestRecords: 0,
        messageRecords: 0,
        sequenceTrackers: 0
      });
    });

    it('should clear all records', async () => {
      const requestRecord: AACPRequestRecord = {
        requestId: 'req-123',
        sourceAgentId: 'agent-1',
        targetAgentId: 'agent-2',
        messageType: 'REQUEST',
        payload: {},
        status: AACPOutcome.UNKNOWN,
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      await adapter.putRequestRecord('req-123', requestRecord);
      await adapter.updateLastSequence('agent-1', 'agent-2', 5);

      let stats = adapter.getStats();
      expect(stats.requestRecords).toBe(1);
      expect(stats.sequenceTrackers).toBe(1);

      adapter.clear();

      stats = adapter.getStats();
      expect(stats).toEqual({
        requestRecords: 0,
        messageRecords: 0,
        sequenceTrackers: 0
      });
    });
  });
});