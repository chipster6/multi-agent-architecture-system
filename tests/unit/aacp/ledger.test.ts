/**
 * Unit Tests for AACP Ledger Implementation
 * 
 * Tests the InMemoryAACPLedger class for deduplication, completion tracking,
 * and recovery operations according to AACP specifications.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAACPLedger } from '../../../src/aacp/ledger.js';
import { InMemoryAACPPersistenceAdapter } from '../../../src/aacp/persistenceAdapter.js';
import type { AACPEnvelope } from '../../../src/aacp/types.js';
import { AACPOutcome } from '../../../src/aacp/types.js';
import { createError, ErrorCode } from '../../../src/errors/index.js';

describe('InMemoryAACPLedger', () => {
  let ledger: InMemoryAACPLedger;
  let persistenceAdapter: InMemoryAACPPersistenceAdapter;

  beforeEach(() => {
    persistenceAdapter = new InMemoryAACPPersistenceAdapter();
    ledger = new InMemoryAACPLedger(persistenceAdapter);
  });

  describe('append operation', () => {
    it('should append new message and return shouldExecute: true', async () => {
      const envelope: AACPEnvelope = {
        messageId: 'msg-001',
        requestId: 'req-001',
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        seq: 1,
        messageType: 'REQUEST',
        timestamp: '2024-01-15T10:30:00.000Z',
        payload: { action: 'test' }
      };

      const result = await ledger.append(envelope);

      expect(result).toEqual({
        isDuplicate: false,
        shouldExecute: true
      });

      // Verify message record was created
      const messageRecord = await ledger.getByMessageId('msg-001');
      expect(messageRecord).toBeDefined();
      expect(messageRecord?.messageId).toBe('msg-001');
      expect(messageRecord?.requestId).toBe('req-001');
      expect(messageRecord?.status).toBe(AACPOutcome.UNKNOWN);

      // Verify request record was created
      const requestRecord = await ledger.getByRequestId('req-001');
      expect(requestRecord).toBeDefined();
      expect(requestRecord?.requestId).toBe('req-001');
      expect(requestRecord?.status).toBe(AACPOutcome.UNKNOWN);
    });

    it('should handle message without requestId', async () => {
      const envelope: AACPEnvelope = {
        messageId: 'msg-002',
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        seq: 2,
        messageType: 'EVENT',
        timestamp: '2024-01-15T10:30:00.000Z',
        payload: { event: 'notification' }
      };

      const result = await ledger.append(envelope);

      expect(result).toEqual({
        isDuplicate: false,
        shouldExecute: true
      });

      // Verify message record was created without requestId
      const messageRecord = await ledger.getByMessageId('msg-002');
      expect(messageRecord).toBeDefined();
      expect(messageRecord?.requestId).toBeUndefined();
    });

    it('should return cached result for duplicate completed request', async () => {
      const envelope: AACPEnvelope = {
        messageId: 'msg-003',
        requestId: 'req-003',
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        seq: 3,
        messageType: 'REQUEST',
        timestamp: '2024-01-15T10:30:00.000Z',
        payload: { action: 'duplicate-test' }
      };

      // First append
      await ledger.append(envelope);
      await ledger.markCompleted('req-003', AACPOutcome.COMPLETED, 'completion-ref-123');

      // Second append (duplicate)
      const duplicateEnvelope: AACPEnvelope = {
        ...envelope,
        messageId: 'msg-003-retry' // Different messageId, same requestId
      };

      const result = await ledger.append(duplicateEnvelope);

      expect(result.isDuplicate).toBe(true);
      expect(result.shouldExecute).toBe(false);
      expect(result.cachedResult).toEqual({ action: 'duplicate-test' });
      expect(result.completionRef).toBe('completion-ref-123');
    });

    it('should ignore duplicate in-progress request', async () => {
      const envelope: AACPEnvelope = {
        messageId: 'msg-004',
        requestId: 'req-004',
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        seq: 4,
        messageType: 'REQUEST',
        timestamp: '2024-01-15T10:30:00.000Z',
        payload: { action: 'in-progress-test' }
      };

      // First append (creates UNKNOWN status)
      await ledger.append(envelope);

      // Second append (duplicate, still UNKNOWN)
      const duplicateEnvelope: AACPEnvelope = {
        ...envelope,
        messageId: 'msg-004-retry'
      };

      const result = await ledger.append(duplicateEnvelope);

      expect(result).toEqual({
        isDuplicate: true,
        shouldExecute: false
      });
    });

    it('should allow retry for failed request', async () => {
      const envelope: AACPEnvelope = {
        messageId: 'msg-005',
        requestId: 'req-005',
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        seq: 5,
        messageType: 'REQUEST',
        timestamp: '2024-01-15T10:30:00.000Z',
        payload: { action: 'retry-test' }
      };

      // First append and mark as failed
      await ledger.append(envelope);
      const error = createError(ErrorCode.Internal, 'Test failure');
      await ledger.markFailed('req-005', error);

      // Retry (should be allowed)
      const retryEnvelope: AACPEnvelope = {
        ...envelope,
        messageId: 'msg-005-retry'
      };

      const result = await ledger.append(retryEnvelope);

      expect(result).toEqual({
        isDuplicate: false,
        shouldExecute: true
      });
    });
  });

  describe('completion tracking', () => {
    it('should mark request as completed', async () => {
      const envelope: AACPEnvelope = {
        messageId: 'msg-006',
        requestId: 'req-006',
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        seq: 6,
        messageType: 'REQUEST',
        timestamp: '2024-01-15T10:30:00.000Z',
        payload: { action: 'completion-test' }
      };

      await ledger.append(envelope);
      await ledger.markCompleted('req-006', AACPOutcome.COMPLETED, 'result-ref');

      const requestRecord = await ledger.getByRequestId('req-006');
      expect(requestRecord?.status).toBe(AACPOutcome.COMPLETED);
      expect(requestRecord?.completionRef).toBe('result-ref');

      const messageRecord = await ledger.getByMessageId('msg-006');
      expect(messageRecord?.status).toBe(AACPOutcome.COMPLETED);
    });

    it('should mark request as failed', async () => {
      const envelope: AACPEnvelope = {
        messageId: 'msg-007',
        requestId: 'req-007',
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        seq: 7,
        messageType: 'REQUEST',
        timestamp: '2024-01-15T10:30:00.000Z',
        payload: { action: 'failure-test' }
      };

      await ledger.append(envelope);
      const error = createError(ErrorCode.InvalidArgument, 'Invalid input');
      await ledger.markFailed('req-007', error);

      const requestRecord = await ledger.getByRequestId('req-007');
      expect(requestRecord?.status).toBe(AACPOutcome.FAILED);
      expect(requestRecord?.error).toEqual(error);

      const messageRecord = await ledger.getByMessageId('msg-007');
      expect(messageRecord?.status).toBe(AACPOutcome.FAILED);
    });
  });

  describe('query operations', () => {
    beforeEach(async () => {
      // Set up test data
      const envelopes: AACPEnvelope[] = [
        {
          messageId: 'msg-query-1',
          requestId: 'req-query-1',
          sourceAgentId: 'agent-a',
          targetAgentId: 'agent-b',
          seq: 1,
          messageType: 'REQUEST',
          timestamp: '2024-01-15T10:30:00.000Z',
          payload: { action: 'query-test-1' }
        },
        {
          messageId: 'msg-query-2',
          requestId: 'req-query-2',
          sourceAgentId: 'agent-a',
          targetAgentId: 'agent-b',
          seq: 2,
          messageType: 'REQUEST',
          timestamp: '2024-01-15T10:30:00.000Z',
          payload: { action: 'query-test-2' }
        },
        {
          messageId: 'msg-query-3',
          sourceAgentId: 'agent-c',
          targetAgentId: 'agent-d',
          seq: 1,
          messageType: 'EVENT',
          timestamp: '2024-01-15T10:30:00.000Z',
          payload: { event: 'query-event' }
        }
      ];

      for (const envelope of envelopes) {
        await ledger.append(envelope);
      }

      // Mark some as completed/failed
      await ledger.markCompleted('req-query-1', AACPOutcome.COMPLETED);
      const error = createError(ErrorCode.Timeout, 'Request timeout');
      await ledger.markFailed('req-query-2', error);
    });

    it('should query messages by status', async () => {
      const completedMessages = await ledger.queryMessagesByStatus(AACPOutcome.COMPLETED);
      expect(completedMessages).toHaveLength(1);
      expect(completedMessages[0].messageId).toBe('msg-query-1');

      const failedMessages = await ledger.queryMessagesByStatus(AACPOutcome.FAILED);
      expect(failedMessages).toHaveLength(1);
      expect(failedMessages[0].messageId).toBe('msg-query-2');

      const unknownMessages = await ledger.queryMessagesByStatus(AACPOutcome.UNKNOWN);
      expect(unknownMessages).toHaveLength(1);
      expect(unknownMessages[0].messageId).toBe('msg-query-3');
    });

    it('should query pending requests', async () => {
      const pendingRequests = await ledger.queryPendingRequests();
      expect(pendingRequests).toHaveLength(0); // req-query-1 completed, req-query-2 failed, msg-query-3 has no requestId
    });

    it('should get unacknowledged messages for agent pair', async () => {
      const unacknowledged = await ledger.getUnacknowledgedMessages('agent-a', 'agent-b');
      expect(unacknowledged).toHaveLength(1); // Only msg-query-2 (failed) is unacknowledged
      expect(unacknowledged[0].messageId).toBe('msg-query-2');
    });
  });

  describe('duplicate checking', () => {
    it('should check duplicate for non-existent request', async () => {
      const result = await ledger.checkDuplicate('non-existent');
      expect(result).toEqual({
        isDuplicate: false,
        isCompleted: false
      });
    });

    it('should check duplicate for completed request', async () => {
      const envelope: AACPEnvelope = {
        messageId: 'msg-dup-1',
        requestId: 'req-dup-1',
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        seq: 1,
        messageType: 'REQUEST',
        timestamp: '2024-01-15T10:30:00.000Z',
        payload: { result: 'success' }
      };

      await ledger.append(envelope);
      await ledger.markCompleted('req-dup-1', AACPOutcome.COMPLETED, 'completion-123');

      const result = await ledger.checkDuplicate('req-dup-1');
      expect(result.isDuplicate).toBe(true);
      expect(result.isCompleted).toBe(true);
      expect(result.cachedResult).toEqual({ result: 'success' });
      expect(result.completionRef).toBe('completion-123');
    });

    it('should check duplicate for in-progress request', async () => {
      const envelope: AACPEnvelope = {
        messageId: 'msg-dup-2',
        requestId: 'req-dup-2',
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        seq: 2,
        messageType: 'REQUEST',
        timestamp: '2024-01-15T10:30:00.000Z',
        payload: { action: 'in-progress' }
      };

      await ledger.append(envelope);

      const result = await ledger.checkDuplicate('req-dup-2');
      expect(result.isDuplicate).toBe(true);
      expect(result.isCompleted).toBe(false);
      expect(result.cachedResult).toBeUndefined();
      expect(result.completionRef).toBeUndefined();
    });
  });

  describe('statistics and maintenance', () => {
    it('should return ledger statistics', async () => {
      // Add some test data
      const envelopes: AACPEnvelope[] = [
        {
          messageId: 'msg-stats-1',
          requestId: 'req-stats-1',
          sourceAgentId: 'agent-a',
          targetAgentId: 'agent-b',
          seq: 1,
          messageType: 'REQUEST',
          timestamp: '2024-01-15T10:30:00.000Z',
          payload: { action: 'stats-test-1' }
        },
        {
          messageId: 'msg-stats-2',
          requestId: 'req-stats-2',
          sourceAgentId: 'agent-a',
          targetAgentId: 'agent-b',
          seq: 2,
          messageType: 'REQUEST',
          timestamp: '2024-01-15T10:30:00.000Z',
          payload: { action: 'stats-test-2' }
        },
        {
          messageId: 'msg-stats-3',
          sourceAgentId: 'agent-c',
          targetAgentId: 'agent-d',
          seq: 1,
          messageType: 'EVENT',
          timestamp: '2024-01-15T10:30:00.000Z',
          payload: { event: 'stats-event' }
        }
      ];

      for (const envelope of envelopes) {
        await ledger.append(envelope);
      }

      await ledger.markCompleted('req-stats-1', AACPOutcome.COMPLETED);
      const error = createError(ErrorCode.Internal, 'Test error');
      await ledger.markFailed('req-stats-2', error);

      const stats = await ledger.getStats();
      expect(stats.totalMessages).toBe(3);
      expect(stats.totalRequests).toBe(2);
      expect(stats.completedRequests).toBe(1);
      expect(stats.failedRequests).toBe(1);
      expect(stats.pendingRequests).toBe(0);
    });

    it('should purge expired records', async () => {
      const now = new Date('2024-01-15T12:00:00.000Z');
      const ttl = 3600000; // 1 hour
      const ledgerWithTtl = new InMemoryAACPLedger(persistenceAdapter, ttl);

      const envelope: AACPEnvelope = {
        messageId: 'msg-expire-1',
        requestId: 'req-expire-1',
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        seq: 1,
        messageType: 'REQUEST',
        timestamp: '2024-01-15T10:30:00.000Z',
        payload: { action: 'expire-test' }
      };

      await ledgerWithTtl.append(envelope);

      // Records should exist before purge
      expect(await ledgerWithTtl.getByMessageId('msg-expire-1')).toBeDefined();
      expect(await ledgerWithTtl.getByRequestId('req-expire-1')).toBeDefined();

      // Purge expired records (2 hours after creation)
      const purgeTime = new Date('2024-01-15T14:00:00.000Z');
      const purgedCount = await ledgerWithTtl.purgeExpired(purgeTime);

      expect(purgedCount).toBe(2); // 1 message record + 1 request record
      expect(await ledgerWithTtl.getByMessageId('msg-expire-1')).toBeNull();
      expect(await ledgerWithTtl.getByRequestId('req-expire-1')).toBeNull();
    });
  });
});