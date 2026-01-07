/**
 * AACP Session Manager Implementation
 * 
 * Manages sequence tracking and acknowledgment per source→target agent pair.
 * Handles session state including sequence numbers and cumulative acknowledgments.
 * 
 * ACK SEMANTICS CHOICE (NORMATIVE):
 * This implementation uses **Option 1 (receipt ack)** semantics:
 * - ack means received in order up to N
 * - ack advances only to highest contiguous seq where all seq ≤ ack have been received
 * - Out-of-order messages create gaps that prevent ack advancement
 * - Semantic completion is tracked separately in the ledger via requestId status
 * 
 * IMPORTANT DURABILITY DISCLAIMER:
 * State survives within process lifetime via adapter. Durability across restart deferred to v0.2.
 */

import type { AACPPersistenceAdapter } from './persistenceAdapter.js';

/**
 * Session state for a source→target agent pair
 */
interface SessionState {
  sourceAgentId: string;
  targetAgentId: string;
  nextSeq: number;        // Incremented monotonically
  lastAck: number;        // Tracked cumulatively (highest contiguous seq)
  receivedSeqs: Set<number>; // Track received sequences for gap detection
}

/**
 * AACP Session Manager
 * 
 * Implements per (sourceAgentId, targetAgentId) session state with sequence and ack tracking.
 */
export class AACPSessionManager {
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly persistenceAdapter: AACPPersistenceAdapter
  ) {}

  /**
   * Get or create session for agent pair
   */
  async getSession(sourceAgentId: string, targetAgentId: string): Promise<SessionState> {
    const sessionKey = `${sourceAgentId}:${targetAgentId}`;
    
    let session = this.sessions.get(sessionKey);
    if (!session) {
      // Load last sequence from persistence adapter
      const lastSeq = await this.persistenceAdapter.getLastSequence(sourceAgentId, targetAgentId);
      
      session = {
        sourceAgentId,
        targetAgentId,
        nextSeq: lastSeq + 1,  // Start from next sequence
        lastAck: 0,            // No messages acknowledged yet
        receivedSeqs: new Set<number>()
      };
      
      this.sessions.set(sessionKey, session);
    }
    
    return session;
  }

  /**
   * Get next sequence number and increment (monotonic)
   */
  async getNextSeq(sourceAgentId: string, targetAgentId: string): Promise<number> {
    const session = await this.getSession(sourceAgentId, targetAgentId);
    const seq = session.nextSeq;
    
    // Increment monotonically
    session.nextSeq++;
    
    // Persist nextSeq via persistence adapter
    await this.persistenceAdapter.updateLastSequence(sourceAgentId, targetAgentId, seq);
    
    return seq;
  }

  /**
   * Acknowledge message receipt and advance ack using "highest contiguous seq" rule
   * 
   * CUMULATIVE ACK SEMANTICS (NORMATIVE):
   * - Record that seq has been received
   * - Advance lastAck to highest contiguous sequence only
   * - Gaps prevent ack advancement (out-of-order handling)
   */
  async acknowledgeMessage(sourceAgentId: string, targetAgentId: string, seq: number): Promise<void> {
    const session = await this.getSession(sourceAgentId, targetAgentId);
    
    // Record received sequence
    session.receivedSeqs.add(seq);
    
    // Find highest contiguous sequence starting from lastAck + 1
    let newAck = session.lastAck;
    
    // Advance ack only if we can maintain contiguous sequence
    while (session.receivedSeqs.has(newAck + 1)) {
      newAck++;
      // Remove acknowledged sequences to prevent memory growth
      session.receivedSeqs.delete(newAck);
    }
    
    // Update lastAck (ack cannot skip gaps)
    session.lastAck = newAck;
  }

  /**
   * Get current ack for agent pair
   */
  async getLastAck(sourceAgentId: string, targetAgentId: string): Promise<number> {
    const session = await this.getSession(sourceAgentId, targetAgentId);
    return session.lastAck;
  }

  /**
   * Check if sequence creates a gap (for gap handling)
   */
  async hasGap(sourceAgentId: string, targetAgentId: string, seq: number): Promise<boolean> {
    const session = await this.getSession(sourceAgentId, targetAgentId);
    
    // Gap exists if seq > lastAck + 1 and intermediate sequences not received
    if (seq <= session.lastAck + 1) {
      return false; // No gap
    }
    
    // Check if all sequences between lastAck + 1 and seq - 1 are received
    for (let i = session.lastAck + 1; i < seq; i++) {
      if (!session.receivedSeqs.has(i)) {
        return true; // Gap found
      }
    }
    
    return false; // No gap
  }

  /**
   * Get session statistics (for monitoring)
   */
  getStats(): { activeSessions: number; totalReceivedSeqs: number } {
    let totalReceivedSeqs = 0;
    for (const session of this.sessions.values()) {
      totalReceivedSeqs += session.receivedSeqs.size;
    }
    
    return {
      activeSessions: this.sessions.size,
      totalReceivedSeqs
    };
  }

  /**
   * Clear all sessions (for testing)
   */
  clear(): void {
    this.sessions.clear();
  }
}