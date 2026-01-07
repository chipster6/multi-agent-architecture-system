/**
 * Unit Tests for AACP Session Manager
 * 
 * Tests sequence tracking and acknowledgment per source→target agent pair.
 * Verifies monotonic sequence numbers and cumulative ack semantics.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AACPSessionManager } from '../../../src/aacp/sessionManager.js';
import { InMemoryAACPPersistenceAdapter } from '../../../src/aacp/persistenceAdapter.js';

describe('AACPSessionManager', () => {
  let sessionManager: AACPSessionManager;
  let persistenceAdapter: InMemoryAACPPersistenceAdapter;

  beforeEach(() => {
    persistenceAdapter = new InMemoryAACPPersistenceAdapter();
    sessionManager = new AACPSessionManager(persistenceAdapter);
  });

  describe('sequence number generation', () => {
    it('should generate monotonic sequence numbers per pair', async () => {
      const seq1 = await sessionManager.getNextSeq('agent-a', 'agent-b');
      const seq2 = await sessionManager.getNextSeq('agent-a', 'agent-b');
      const seq3 = await sessionManager.getNextSeq('agent-a', 'agent-b');

      expect(seq1).toBe(1); // First sequence
      expect(seq2).toBe(2); // Incremented
      expect(seq3).toBe(3); // Monotonic
    });

    it('should maintain separate sequences per agent pair', async () => {
      const seq1a = await sessionManager.getNextSeq('agent-a', 'agent-b');
      const seq1b = await sessionManager.getNextSeq('agent-b', 'agent-a');
      const seq2a = await sessionManager.getNextSeq('agent-a', 'agent-b');

      expect(seq1a).toBe(1);
      expect(seq1b).toBe(1); // Different pair, starts at 1
      expect(seq2a).toBe(2); // Same pair, incremented
    });

    it('should persist sequence numbers via adapter', async () => {
      await sessionManager.getNextSeq('agent-a', 'agent-b');
      await sessionManager.getNextSeq('agent-a', 'agent-b');

      // Verify persistence adapter was called
      const lastSeq = await persistenceAdapter.getLastSequence('agent-a', 'agent-b');
      expect(lastSeq).toBe(2); // Last sequence persisted
    });

    it('should resume from persisted sequence', async () => {
      // Pre-populate persistence adapter
      await persistenceAdapter.updateLastSequence('agent-a', 'agent-b', 5);

      // Create new session manager
      const newSessionManager = new AACPSessionManager(persistenceAdapter);
      const nextSeq = await newSessionManager.getNextSeq('agent-a', 'agent-b');

      expect(nextSeq).toBe(6); // Resumed from persisted + 1
    });
  });

  describe('acknowledgment tracking', () => {
    it('should start with lastAck = 0', async () => {
      const lastAck = await sessionManager.getLastAck('agent-a', 'agent-b');
      expect(lastAck).toBe(0);
    });

    it('should advance ack for contiguous sequences', async () => {
      // Acknowledge sequences 1, 2, 3 in order
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 1);
      expect(await sessionManager.getLastAck('agent-a', 'agent-b')).toBe(1);

      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 2);
      expect(await sessionManager.getLastAck('agent-a', 'agent-b')).toBe(2);

      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 3);
      expect(await sessionManager.getLastAck('agent-a', 'agent-b')).toBe(3);
    });

    it('should not skip gaps (highest contiguous seq rule)', async () => {
      // Acknowledge sequence 1
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 1);
      expect(await sessionManager.getLastAck('agent-a', 'agent-b')).toBe(1);

      // Acknowledge sequence 3 (gap at 2)
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 3);
      expect(await sessionManager.getLastAck('agent-a', 'agent-b')).toBe(1); // Cannot advance due to gap

      // Fill gap with sequence 2
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 2);
      expect(await sessionManager.getLastAck('agent-a', 'agent-b')).toBe(3); // Now can advance to 3
    });

    it('should handle out-of-order messages correctly', async () => {
      // Acknowledge sequences out of order: 3, 1, 4, 2
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 3);
      expect(await sessionManager.getLastAck('agent-a', 'agent-b')).toBe(0); // Gap at 1,2

      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 1);
      expect(await sessionManager.getLastAck('agent-a', 'agent-b')).toBe(1); // Can advance to 1

      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 4);
      expect(await sessionManager.getLastAck('agent-a', 'agent-b')).toBe(1); // Still gap at 2

      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 2);
      expect(await sessionManager.getLastAck('agent-a', 'agent-b')).toBe(4); // All contiguous, advance to 4
    });

    it('should handle duplicate acknowledgments', async () => {
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 1);
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 2);
      expect(await sessionManager.getLastAck('agent-a', 'agent-b')).toBe(2);

      // Duplicate acknowledgment of sequence 1
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 1);
      expect(await sessionManager.getLastAck('agent-a', 'agent-b')).toBe(2); // No change
    });
  });

  describe('gap detection', () => {
    it('should detect no gap for contiguous sequences', async () => {
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 1);
      
      const hasGap2 = await sessionManager.hasGap('agent-a', 'agent-b', 2);
      expect(hasGap2).toBe(false); // No gap for next sequence
    });

    it('should detect gap for non-contiguous sequences', async () => {
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 1);
      
      const hasGap3 = await sessionManager.hasGap('agent-a', 'agent-b', 3);
      expect(hasGap3).toBe(true); // Gap at sequence 2
    });

    it('should detect no gap when intermediate sequences received', async () => {
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 1);
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 2);
      
      const hasGap3 = await sessionManager.hasGap('agent-a', 'agent-b', 3);
      expect(hasGap3).toBe(false); // No gap, all intermediate sequences received
    });

    it('should handle gap detection with multiple missing sequences', async () => {
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 1);
      
      const hasGap5 = await sessionManager.hasGap('agent-a', 'agent-b', 5);
      expect(hasGap5).toBe(true); // Gap at sequences 2, 3, 4
    });
  });

  describe('session management', () => {
    it('should maintain separate state per agent pair', async () => {
      // Set up different states for different pairs
      await sessionManager.getNextSeq('agent-a', 'agent-b'); // seq 1
      await sessionManager.getNextSeq('agent-a', 'agent-b'); // seq 2
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 1);

      await sessionManager.getNextSeq('agent-b', 'agent-a'); // seq 1
      await sessionManager.acknowledgeMessage('agent-b', 'agent-a', 1);

      // Verify separate states
      const session1 = await sessionManager.getSession('agent-a', 'agent-b');
      const session2 = await sessionManager.getSession('agent-b', 'agent-a');

      expect(session1.nextSeq).toBe(3); // Next would be 3
      expect(session1.lastAck).toBe(1);
      expect(session2.nextSeq).toBe(2); // Next would be 2
      expect(session2.lastAck).toBe(1);
    });

    it('should provide session statistics', () => {
      const stats = sessionManager.getStats();
      expect(stats.activeSessions).toBe(0);
      expect(stats.totalReceivedSeqs).toBe(0);
    });

    it('should track received sequences in statistics', async () => {
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 3); // Creates gap
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 5); // Creates gap
      
      const stats = sessionManager.getStats();
      expect(stats.activeSessions).toBe(1);
      expect(stats.totalReceivedSeqs).toBe(2); // Two unacknowledged sequences
    });

    it('should clear all sessions', async () => {
      await sessionManager.getNextSeq('agent-a', 'agent-b');
      await sessionManager.getNextSeq('agent-b', 'agent-a');
      
      sessionManager.clear();
      
      const stats = sessionManager.getStats();
      expect(stats.activeSessions).toBe(0);
    });
  });

  describe('cumulative ack semantics', () => {
    it('should implement receipt ack semantics (Option 1)', async () => {
      // This test verifies we chose Option 1 (receipt ack) over Option 2 (commit ack)
      // Receipt ack means: ack means received in order up to N
      
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 1);
      await sessionManager.acknowledgeMessage('agent-a', 'agent-b', 2);
      
      const lastAck = await sessionManager.getLastAck('agent-a', 'agent-b');
      expect(lastAck).toBe(2); // Received in order up to 2
      
      // The fact that we can advance ack immediately upon receipt
      // (without waiting for ledger commit) confirms receipt ack semantics
    });

    it('should maintain memory efficiency by cleaning acknowledged sequences', async () => {
      // Acknowledge many sequences to test memory cleanup
      for (let i = 1; i <= 100; i++) {
        await sessionManager.acknowledgeMessage('agent-a', 'agent-b', i);
      }
      
      const stats = sessionManager.getStats();
      expect(stats.totalReceivedSeqs).toBe(0); // All sequences cleaned up after ack
      expect(await sessionManager.getLastAck('agent-a', 'agent-b')).toBe(100);
    });
  });
});