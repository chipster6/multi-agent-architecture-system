/**
 * In-Memory AACP Ledger Implementation
 * 
 * Provides append-only ledger operations using AACPPersistenceAdapter.
 * Implements deduplication, completion tracking, and recovery operations.
 * 
 * IMPORTANT DURABILITY DISCLAIMER:
 * This in-memory ledger is not durable across process restarts.
 * v0.2 will add persistent storage for true durability.
 */

import type { StructuredError } from '../errors/index.js';
import type { 
  AACPEnvelope, 
  AACPRequestRecord, 
  AACPMessageRecord 
} from './types.js';
import { AACPOutcome } from './types.js';
import type { 
  AACPLedger, 
  AACPLedgerResult 
} from './interfaces.js';
import type { AACPPersistenceAdapter } from './persistenceAdapter.js';

/**
 * In-Memory AACP Ledger
 * 
 * Implements the AACPLedger interface using a persistence adapter for storage.
 * Provides deduplication, completion tracking, and recovery operations.
 */
export class InMemoryAACPLedger implements AACPLedger {
  constructor(
    private readonly persistenceAdapter: AACPPersistenceAdapter,
    private readonly defaultTtlMs: number = 86400000 // 24 hours default TTL
  ) {}

  /**
   * Append a message to the ledger with deduplication check
   * 
   * PROCESSING ORDER (NORMATIVE):
   * 1. Deduplication check by requestId
   * 2. If duplicate and completed, return cached result
   * 3. If duplicate and in-progress, ignore (do not execute)
   * 4. If new, append to ledger and proceed with execution
   */
  async append(envelope: AACPEnvelope): Promise<AACPLedgerResult> {
    const now = new Date();
    const envelopeTime = new Date(envelope.timestamp);
    const baseTime = Number.isNaN(envelopeTime.getTime()) ? now : envelopeTime;
    const ttlMs = envelope.ttl ?? this.defaultTtlMs;
    const timestamp = baseTime.toISOString();
    const expiresAt = new Date(baseTime.getTime() + ttlMs).toISOString();

    // Step 1: Deduplication check by requestId (if present)
    if (envelope.requestId) {
      const existingRequest = await this.persistenceAdapter.getRequestRecord(envelope.requestId);
      
      if (existingRequest) {
        // Step 2: If duplicate and completed, return cached result
        if (existingRequest.status === AACPOutcome.COMPLETED) {
          const result: AACPLedgerResult = {
            isDuplicate: true,
            cachedResult: existingRequest.payload,
            shouldExecute: false
          };
          if (existingRequest.completionRef !== undefined) {
            result.completionRef = existingRequest.completionRef;
          }
          return result;
        }
        
        // Step 3: If duplicate and in-progress/unknown, ignore
        if (existingRequest.status === AACPOutcome.UNKNOWN) {
          return {
            isDuplicate: true,
            shouldExecute: false
          };
        }
        
        // If failed, allow retry (fall through to step 4)
      }
    }

    // Step 4: New message - append to ledger
    
    // Create message record
    const messageRecord: AACPMessageRecord = {
      messageId: envelope.id,
      envelope: { ...envelope },
      status: AACPOutcome.UNKNOWN,
      timestamp,
      expiresAt,
      retryCount: 0,
    };

    // Add requestId only if present
    if (envelope.requestId !== undefined) {
      messageRecord.requestId = envelope.requestId;
    }

    await this.persistenceAdapter.putMessageRecord(envelope.id, messageRecord);

    // Create request record if requestId is present
    if (envelope.requestId && (envelope.messageType === 'REQUEST' || envelope.messageType === 'RESPONSE')) {
      const requestRecord: AACPRequestRecord = {
        requestId: envelope.requestId,
        correlationId: envelope.correlationId,
        sourceAgentId: envelope.source.id,
        targetAgentId:
          envelope.destination.type === 'direct'
            ? envelope.destination.agentId
            : envelope.destination.type === 'reply'
            ? envelope.source.id
            : 'broadcast',
        messageType: envelope.messageType,
        payload: envelope.payload,
        status: AACPOutcome.UNKNOWN,
        timestamp,
        expiresAt,
      };
      if (envelope.causationId !== undefined) {
        requestRecord.causationId = envelope.causationId;
      }

      await this.persistenceAdapter.putRequestRecord(envelope.requestId, requestRecord);
    }

    return {
      isDuplicate: false,
      shouldExecute: true
    };
  }

  /**
   * Look up message by messageId
   */
  async getByMessageId(messageId: string): Promise<AACPMessageRecord | null> {
    return await this.persistenceAdapter.getMessageRecord(messageId);
  }

  /**
   * Look up request by requestId (for deduplication)
   */
  async getByRequestId(requestId: string): Promise<AACPRequestRecord | null> {
    return await this.persistenceAdapter.getRequestRecord(requestId);
  }

  /**
   * Mark a request as completed
   * Updates request record outcome first, then associated message records
   */
  async markCompleted(requestId: string, outcome: AACPOutcome, completionRef?: string): Promise<void> {
    // Update request record first
    await this.persistenceAdapter.markCompleted(requestId, outcome, completionRef);

    // Find and update associated message records
    const messages = await this.persistenceAdapter.listMessagesInState(AACPOutcome.UNKNOWN);
    
    for (const messageRecord of messages) {
      if (messageRecord.requestId === requestId) {
        messageRecord.status = outcome;
        messageRecord.timestamp = new Date().toISOString();
        await this.persistenceAdapter.putMessageRecord(messageRecord.messageId, messageRecord);
      }
    }
  }

  /**
   * Mark a request as failed
   * Updates request record outcome first, then associated message records
   */
  async markFailed(requestId: string, error: StructuredError): Promise<void> {
    // Update request record first
    await this.persistenceAdapter.markFailed(requestId, error);

    // Find and update associated message records
    const messages = await this.persistenceAdapter.listMessagesInState(AACPOutcome.UNKNOWN);
    
    for (const messageRecord of messages) {
      if (messageRecord.requestId === requestId) {
        messageRecord.status = AACPOutcome.FAILED;
        messageRecord.timestamp = new Date().toISOString();
        await this.persistenceAdapter.putMessageRecord(messageRecord.messageId, messageRecord);
      }
    }
  }

  /**
   * Get unacknowledged messages for a source-target pair
   * Used for gap detection and retransmission
   */
  async getUnacknowledgedMessages(sourceAgentId: string, targetAgentId: string): Promise<AACPEnvelope[]> {
    return await this.persistenceAdapter.getUnacknowledgedMessages(sourceAgentId, targetAgentId);
  }

  /**
   * Query messages by status for recovery operations
   */
  async queryMessagesByStatus(outcome: AACPOutcome, olderThan?: Date): Promise<AACPMessageRecord[]> {
    return await this.persistenceAdapter.listMessagesInState(outcome, olderThan);
  }

  /**
   * Query pending requests for retry processing
   */
  async queryPendingRequests(olderThan?: Date): Promise<AACPRequestRecord[]> {
    return await this.persistenceAdapter.listPendingRequests(olderThan);
  }

  /**
   * Check if a request is a duplicate
   * Returns completion info if duplicate and completed
   */
  async checkDuplicate(requestId: string): Promise<{
    isDuplicate: boolean;
    isCompleted: boolean;
    cachedResult?: unknown;
    completionRef?: string;
  }> {
    const requestRecord = await this.persistenceAdapter.getRequestRecord(requestId);
    
    if (!requestRecord) {
      return { isDuplicate: false, isCompleted: false };
    }

    const isCompleted = requestRecord.status === AACPOutcome.COMPLETED;
    
    const result: {
      isDuplicate: boolean;
      isCompleted: boolean;
      cachedResult?: unknown;
      completionRef?: string;
    } = {
      isDuplicate: true,
      isCompleted
    };

    if (isCompleted) {
      result.cachedResult = requestRecord.payload;
      if (requestRecord.completionRef !== undefined) {
        result.completionRef = requestRecord.completionRef;
      }
    }

    return result;
  }

  /**
   * Get ledger statistics for monitoring
   */
  async getStats(): Promise<{
    totalMessages: number;
    totalRequests: number;
    completedRequests: number;
    failedRequests: number;
    pendingRequests: number;
  }> {
    const [
      completedMessages,
      failedMessages,
      pendingMessages,
      pendingRequests
    ] = await Promise.all([
      this.persistenceAdapter.listMessagesInState(AACPOutcome.COMPLETED),
      this.persistenceAdapter.listMessagesInState(AACPOutcome.FAILED),
      this.persistenceAdapter.listMessagesInState(AACPOutcome.UNKNOWN),
      this.persistenceAdapter.listPendingRequests()
    ]);

    // Count unique requests by status
    const requestIds = new Set<string>();
    const completedRequestIds = new Set<string>();
    const failedRequestIds = new Set<string>();

    for (const msg of [...completedMessages, ...failedMessages, ...pendingMessages]) {
      if (msg.requestId) {
        requestIds.add(msg.requestId);
        if (msg.status === AACPOutcome.COMPLETED) {
          completedRequestIds.add(msg.requestId);
        } else if (msg.status === AACPOutcome.FAILED) {
          failedRequestIds.add(msg.requestId);
        }
      }
    }

    return {
      totalMessages: completedMessages.length + failedMessages.length + pendingMessages.length,
      totalRequests: requestIds.size,
      completedRequests: completedRequestIds.size,
      failedRequests: failedRequestIds.size,
      pendingRequests: pendingRequests.length
    };
  }

  /**
   * Purge expired records from the ledger
   * Delegates to persistence adapter for consistent behavior
   */
  async purgeExpired(now: Date = new Date()): Promise<number> {
    return await this.persistenceAdapter.purgeExpired(now);
  }
}
