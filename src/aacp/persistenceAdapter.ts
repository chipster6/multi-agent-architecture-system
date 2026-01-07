/**
 * AACP Persistence Adapter Interface and Implementation
 * 
 * Provides ledger-first storage for AACP message and request tracking.
 * The v0.1 implementation is in-memory only for single process lifetime.
 */

import type { StructuredError } from '../errors/index.js';
import type { 
  AACPEnvelope, 
  AACPRequestRecord, 
  AACPMessageRecord 
} from './types.js';
import { AACPOutcome } from './types.js';

/**
 * AACP Persistence Adapter Interface
 * 
 * Defines the contract for storing and retrieving AACP messages and requests.
 * Supports ledger-first design with structured records (not blob storage).
 */
export interface AACPPersistenceAdapter {
  // Ledger-first message operations (structured records, not blob storage)
  putRequestRecord(requestId: string, record: AACPRequestRecord): Promise<void>;
  putMessageRecord(messageId: string, record: AACPMessageRecord): Promise<void>;
  getRequestRecord(requestId: string): Promise<AACPRequestRecord | null>;
  getMessageRecord(messageId: string): Promise<AACPMessageRecord | null>;

  // Completion tracking
  markCompleted(requestId: string, outcome: AACPOutcome, completionRef?: string): Promise<void>;
  markFailed(requestId: string, error: StructuredError): Promise<void>;

  // Sequence tracking
  getLastSequence(sourceAgentId: string, targetAgentId: string): Promise<number>;
  updateLastSequence(sourceAgentId: string, targetAgentId: string, seq: number): Promise<void>;

  // Recovery operations
  getUnacknowledgedMessages(sourceAgentId: string, targetAgentId: string): Promise<AACPEnvelope[]>;
  listPendingRequests(olderThan?: Date): Promise<AACPRequestRecord[]>;
  listMessagesInState(outcome: AACPOutcome, olderThan?: Date): Promise<AACPMessageRecord[]>;

  // Retention operations (v0.2 seam)
  purgeExpired(now: Date): Promise<number>; // returns count of purged records
}

/**
 * In-Memory AACP Persistence Adapter
 * 
 * IMPORTANT DURABILITY DISCLAIMER:
 * The in-memory AACPPersistenceAdapter provides best-effort tracking for a single 
 * process lifetime only and MUST NOT be considered durable across restarts.
 * 
 * v0.2 will add persistent storage for true durability.
 */
export class InMemoryAACPPersistenceAdapter implements AACPPersistenceAdapter {
  private readonly requestLedger = new Map<string, AACPRequestRecord>();
  private readonly messageLedger = new Map<string, AACPMessageRecord>();
  private readonly sequenceTracker = new Map<string, number>(); // key: `${sourceAgentId}:${targetAgentId}`

  /**
   * Store a request record in the ledger
   */
  async putRequestRecord(requestId: string, record: AACPRequestRecord): Promise<void> {
    this.requestLedger.set(requestId, { ...record });
  }

  /**
   * Store a message record in the ledger
   */
  async putMessageRecord(messageId: string, record: AACPMessageRecord): Promise<void> {
    this.messageLedger.set(messageId, { ...record });
  }

  /**
   * Retrieve a request record by requestId
   */
  async getRequestRecord(requestId: string): Promise<AACPRequestRecord | null> {
    const record = this.requestLedger.get(requestId);
    return record ? { ...record } : null;
  }

  /**
   * Retrieve a message record by messageId
   */
  async getMessageRecord(messageId: string): Promise<AACPMessageRecord | null> {
    const record = this.messageLedger.get(messageId);
    return record ? { ...record } : null;
  }

  /**
   * Mark a request as completed with the given outcome
   */
  async markCompleted(requestId: string, outcome: AACPOutcome, completionRef?: string): Promise<void> {
    const record = this.requestLedger.get(requestId);
    if (record) {
      record.status = outcome;
      if (completionRef !== undefined) {
        record.completionRef = completionRef;
      }
      record.timestamp = new Date().toISOString();
    }
  }

  /**
   * Mark a request as failed with the given error
   */
  async markFailed(requestId: string, error: StructuredError): Promise<void> {
    const record = this.requestLedger.get(requestId);
    if (record) {
      record.status = AACPOutcome.FAILED;
      record.error = error;
      record.timestamp = new Date().toISOString();
    }
  }

  /**
   * Get the last sequence number for a source-target pair
   */
  async getLastSequence(sourceAgentId: string, targetAgentId: string): Promise<number> {
    const key = `${sourceAgentId}:${targetAgentId}`;
    return this.sequenceTracker.get(key) ?? 0;
  }

  /**
   * Update the last sequence number for a source-target pair
   */
  async updateLastSequence(sourceAgentId: string, targetAgentId: string, seq: number): Promise<void> {
    const key = `${sourceAgentId}:${targetAgentId}`;
    const currentSeq = this.sequenceTracker.get(key) ?? 0;
    
    // Only update if the new sequence is higher (monotonic ordering)
    if (seq > currentSeq) {
      this.sequenceTracker.set(key, seq);
    }
  }

  /**
   * Get unacknowledged messages for a source-target pair
   * Used for gap detection and retransmission
   */
  async getUnacknowledgedMessages(sourceAgentId: string, targetAgentId: string): Promise<AACPEnvelope[]> {
    const unacknowledged: AACPEnvelope[] = [];
    
    for (const record of this.messageLedger.values()) {
      const envelope = record.envelope;
      if (
        envelope.sourceAgentId === sourceAgentId &&
        envelope.targetAgentId === targetAgentId &&
        record.status !== AACPOutcome.COMPLETED
      ) {
        unacknowledged.push({ ...envelope });
      }
    }
    
    // Sort by sequence number for ordered processing
    return unacknowledged.sort((a, b) => a.seq - b.seq);
  }

  /**
   * List pending requests (not completed or failed)
   * Optionally filter by age
   */
  async listPendingRequests(olderThan?: Date): Promise<AACPRequestRecord[]> {
    const pending: AACPRequestRecord[] = [];
    const cutoffTime = olderThan?.toISOString();
    
    for (const record of this.requestLedger.values()) {
      if (record.status === AACPOutcome.UNKNOWN) {
        if (!cutoffTime || record.timestamp < cutoffTime) {
          pending.push({ ...record });
        }
      }
    }
    
    return pending;
  }

  /**
   * List messages in a specific state
   * Optionally filter by age
   */
  async listMessagesInState(outcome: AACPOutcome, olderThan?: Date): Promise<AACPMessageRecord[]> {
    const messages: AACPMessageRecord[] = [];
    const cutoffTime = olderThan?.toISOString();
    
    for (const record of this.messageLedger.values()) {
      if (record.status === outcome) {
        if (!cutoffTime || record.timestamp < cutoffTime) {
          messages.push({ ...record });
        }
      }
    }
    
    return messages;
  }

  /**
   * Purge expired records based on expiresAt timestamp
   * 
   * MUST delete all records with expiresAt <= now and return deterministic count.
   * This implements the retention policy for AACP records.
   */
  async purgeExpired(now: Date): Promise<number> {
    const nowIso = now.toISOString();
    let purgedCount = 0;
    
    // Purge expired request records
    for (const [requestId, record] of this.requestLedger.entries()) {
      if (record.expiresAt && record.expiresAt <= nowIso) {
        this.requestLedger.delete(requestId);
        purgedCount++;
      }
    }
    
    // Purge expired message records
    for (const [messageId, record] of this.messageLedger.entries()) {
      if (record.expiresAt && record.expiresAt <= nowIso) {
        this.messageLedger.delete(messageId);
        purgedCount++;
      }
    }
    
    return purgedCount;
  }

  /**
   * Get current storage statistics (for monitoring and testing)
   */
  getStats(): { requestRecords: number; messageRecords: number; sequenceTrackers: number } {
    return {
      requestRecords: this.requestLedger.size,
      messageRecords: this.messageLedger.size,
      sequenceTrackers: this.sequenceTracker.size
    };
  }

  /**
   * Clear all records (for testing purposes)
   */
  clear(): void {
    this.requestLedger.clear();
    this.messageLedger.clear();
    this.sequenceTracker.clear();
  }
}