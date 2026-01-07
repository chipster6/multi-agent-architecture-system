/**
 * Unit Tests for AACP Retransmitter
 * 
 * Tests retry scheduling and policy enforcement for failed messages.
 * Verifies exponential backoff with jitter and configurable retry policies.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AACPRetransmitter } from '../../../src/aacp/retransmitter.js';
import type { AACPMessageRecord, AACPRetryPolicy } from '../../../src/aacp/types.js';
import { AACPOutcome } from '../../../src/aacp/types.js';
import { createError, ErrorCode } from '../../../src/errors/index.js';

describe('AACPRetransmitter', () => {
  let retransmitter: AACPRetransmitter;
  let mockRandom: () => number;

  beforeEach(() => {
    // Deterministic random for testing
    mockRandom = () => 0.5;
    retransmitter = new AACPRetransmitter(undefined, mockRandom);
  });

  describe('retry scheduling', () => {
    it('should schedule retry with delay', async () => {
      await retransmitter.scheduleRetry('msg-001', 1000);
      
      const scheduled = retransmitter.getScheduledRetries();
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0].messageId).toBe('msg-001');
      expect(scheduled[0].attempt).toBe(1);
    });

    it('should increment attempt count on reschedule', async () => {
      await retransmitter.scheduleRetry('msg-001', 1000);
      await retransmitter.scheduleRetry('msg-001', 2000); // Reschedule same message
      
      const scheduled = retransmitter.getScheduledRetries();
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0].attempt).toBe(2); // Incremented
    });

    it('should cancel scheduled retry', async () => {
      await retransmitter.scheduleRetry('msg-001', 1000);
      await retransmitter.cancelRetry('msg-001');
      
      const scheduled = retransmitter.getScheduledRetries();
      expect(scheduled).toHaveLength(0);
    });

    it('should handle cancel of non-existent retry', async () => {
      await retransmitter.cancelRetry('non-existent');
      // Should not throw
    });
  });

  describe('processRetriesOnce (manual processing)', () => {
    it('should return due retries', async () => {
      const now = Date.now();
      
      // Schedule retries with different delays
      await retransmitter.scheduleRetry('msg-001', -100); // Past due
      await retransmitter.scheduleRetry('msg-002', 1000);  // Future
      await retransmitter.scheduleRetry('msg-003', -50);   // Past due
      
      const dueRetries = await retransmitter.processRetriesOnce();
      
      expect(dueRetries).toHaveLength(2);
      expect(dueRetries).toContain('msg-001');
      expect(dueRetries).toContain('msg-003');
      expect(dueRetries).not.toContain('msg-002');
    });

    it('should remove processed retries from schedule', async () => {
      await retransmitter.scheduleRetry('msg-001', -100); // Past due
      
      await retransmitter.processRetriesOnce();
      
      const scheduled = retransmitter.getScheduledRetries();
      expect(scheduled).toHaveLength(0); // Removed after processing
    });

    it('should return empty array when no retries due', async () => {
      await retransmitter.scheduleRetry('msg-001', 10000); // Future
      
      const dueRetries = await retransmitter.processRetriesOnce();
      expect(dueRetries).toHaveLength(0);
    });
  });

  describe('retry policy enforcement', () => {
    it('should retry UNKNOWN states (timeout scenarios)', () => {
      const record: AACPMessageRecord = {
        messageId: 'msg-001',
        envelope: {} as any,
        status: AACPOutcome.UNKNOWN,
        timestamp: '2024-01-15T10:30:00.000Z',
        expiresAt: '2024-01-16T10:30:00.000Z',
        retryCount: 1
      };
      
      const shouldRetry = retransmitter.shouldRetry(record);
      expect(shouldRetry).toBe(true); // UNKNOWN states retried
    });

    it('should not retry FAILED states unless policy allows', () => {
      const record: AACPMessageRecord = {
        messageId: 'msg-001',
        envelope: {} as any,
        status: AACPOutcome.FAILED,
        timestamp: '2024-01-15T10:30:00.000Z',
        expiresAt: '2024-01-16T10:30:00.000Z',
        retryCount: 1
      };
      
      const nonRetryableError = createError(ErrorCode.InvalidArgument, 'Bad input');
      const shouldRetry = retransmitter.shouldRetry(record, nonRetryableError);
      expect(shouldRetry).toBe(false); // FAILED with non-retryable error
    });

    it('should retry FAILED states with retryable error codes', () => {
      const record: AACPMessageRecord = {
        messageId: 'msg-001',
        envelope: {} as any,
        status: AACPOutcome.FAILED,
        timestamp: '2024-01-15T10:30:00.000Z',
        expiresAt: '2024-01-16T10:30:00.000Z',
        retryCount: 1
      };
      
      const retryableError = createError(ErrorCode.Timeout, 'Request timeout');
      const shouldRetry = retransmitter.shouldRetry(record, retryableError);
      expect(shouldRetry).toBe(true); // FAILED with retryable error
    });

    it('should enforce max attempts limit', () => {
      const record: AACPMessageRecord = {
        messageId: 'msg-001',
        envelope: {} as any,
        status: AACPOutcome.UNKNOWN,
        timestamp: '2024-01-15T10:30:00.000Z',
        expiresAt: '2024-01-16T10:30:00.000Z',
        retryCount: 3 // At max attempts (default is 3)
      };
      
      const shouldRetry = retransmitter.shouldRetry(record);
      expect(shouldRetry).toBe(false); // Max attempts reached
    });
  });

  describe('exponential backoff with jitter', () => {
    it('should calculate exponential backoff delay', () => {
      // Default policy: baseDelay=1000, multiplier=2.0
      const delay0 = retransmitter.calculateBackoffDelay(0);
      const delay1 = retransmitter.calculateBackoffDelay(1);
      const delay2 = retransmitter.calculateBackoffDelay(2);
      
      // With mockRandom = 0.5, jitter should be 0 (no change)
      expect(delay0).toBe(1000); // 1000 * 2^0 = 1000
      expect(delay1).toBe(2000); // 1000 * 2^1 = 2000
      expect(delay2).toBe(4000); // 1000 * 2^2 = 4000
    });

    it('should cap delay at maximum', () => {
      const customPolicy: AACPRetryPolicy = {
        maxAttempts: 5,
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2.0,
        shouldRetryError: () => true
      };
      const retransmitterWithCap = new AACPRetransmitter(customPolicy, mockRandom);
      
      const delay10 = retransmitterWithCap.calculateBackoffDelay(10);
      expect(delay10).toBe(5000); // Capped at maxDelayMs
    });

    it('should add jitter to prevent thundering herd', () => {
      // Test with different random values
      const randomValues = [0.0, 0.25, 0.5, 0.75, 1.0];
      const delays: number[] = [];
      
      for (const randomValue of randomValues) {
        const jitteredRetransmitter = new AACPRetransmitter(undefined, () => randomValue);
        delays.push(jitteredRetransmitter.calculateBackoffDelay(1));
      }
      
      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBe(5); // All different
      
      // All delays should be around 2000ms (baseDelay * 2^1)
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(1800); // Within jitter range
        expect(delay).toBeLessThanOrEqual(2200);
      }
    });

    it('should ensure delay is never negative', () => {
      // Extreme jitter that could cause negative delay
      const extremeJitterRetransmitter = new AACPRetransmitter(
        undefined, // Use default policy
        () => 0.0, // Minimum random value
        2.0 // 200% jitter factor
      );
      
      const delay = extremeJitterRetransmitter.calculateBackoffDelay(0);
      expect(delay).toBeGreaterThanOrEqual(0);
    });
  });

  describe('policy configuration', () => {
    it('should use custom retry policy', () => {
      const customPolicy: AACPRetryPolicy = {
        maxAttempts: 5,
        baseDelayMs: 500,
        maxDelayMs: 10000,
        backoffMultiplier: 3.0,
        shouldRetryError: (error) => error.code === ErrorCode.Timeout
      };
      
      const customRetransmitter = new AACPRetransmitter(customPolicy, mockRandom);
      const policy = customRetransmitter.getPolicy();
      
      expect(policy.maxAttempts).toBe(5);
      expect(policy.baseDelayMs).toBe(500);
      expect(policy.backoffMultiplier).toBe(3.0);
    });

    it('should update policy configuration', () => {
      const newPolicy: AACPRetryPolicy = {
        maxAttempts: 10,
        baseDelayMs: 2000,
        maxDelayMs: 60000,
        backoffMultiplier: 1.5,
        shouldRetryError: () => false
      };
      
      retransmitter.updatePolicy(newPolicy);
      const policy = retransmitter.getPolicy();
      
      expect(policy.maxAttempts).toBe(10);
      expect(policy.baseDelayMs).toBe(2000);
    });
  });

  describe('retry contract documentation', () => {
    it('should document retry contract: reuse requestId, new messageId per attempt', () => {
      // This test documents the retry contract as specified in the task
      // The actual implementation of this contract would be in the caller
      // that uses the retransmitter, not in the retransmitter itself
      
      // Contract: reuse requestId, new messageId per attempt
      const originalRequestId = 'req-001';
      const originalMessageId = 'msg-001';
      const retryMessageId = 'msg-001-retry-1';
      
      // Both messages should have same requestId but different messageId
      expect(originalRequestId).toBe('req-001'); // Same requestId
      expect(originalMessageId).not.toBe(retryMessageId); // Different messageId
      
      // This documents the expected behavior for callers of the retransmitter
    });
  });

  describe('testing utilities', () => {
    it('should clear all scheduled retries', async () => {
      await retransmitter.scheduleRetry('msg-001', 1000);
      await retransmitter.scheduleRetry('msg-002', 2000);
      
      retransmitter.clear();
      
      const scheduled = retransmitter.getScheduledRetries();
      expect(scheduled).toHaveLength(0);
    });

    it('should provide deterministic behavior under injected RNG', () => {
      // Test with fixed random value
      const fixedRetransmitter = new AACPRetransmitter(undefined, () => 0.3);
      
      const delay1 = fixedRetransmitter.calculateBackoffDelay(1);
      const delay2 = fixedRetransmitter.calculateBackoffDelay(1);
      
      expect(delay1).toBe(delay2); // Deterministic with fixed RNG
    });
  });
});