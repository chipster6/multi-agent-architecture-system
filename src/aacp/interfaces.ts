/**
 * AACP Module Boundaries and Component Interfaces
 * 
 * This module defines the interfaces for AACP components and their interactions.
 * It establishes clear module boundaries with no circular imports and documents
 * the processing order and semantics for reliable agent-to-agent communication.
 */

import type { StructuredError } from '../errors/index.js';
import type { 
  AACPEnvelope, 
  AACPOutcome, 
  AACPRequestRecord, 
  AACPMessageRecord,
  AACPRetryPolicy 
} from './types.js';

/**
 * AACP Message Type (re-exported for consistency)
 * 
 * Consistent with the envelope definition in types.ts
 */
export type AACPMessageType = 'REQUEST' | 'RESPONSE' | 'EVENT';

/**
 * AACP Encoder Interface
 * 
 * Handles serialization and deserialization of AACP envelopes for transport.
 */
export interface AACPEncoder {
  /**
   * Encode an AACP envelope to string format for transport
   */
  encode(envelope: AACPEnvelope): string;
  
  /**
   * Decode string data back to AACP envelope
   * @throws Error if data is malformed or invalid
   */
  decode(data: string): AACPEnvelope;
}

/**
 * AACP Session Manager Interface
 * 
 * Manages sequence tracking and acknowledgment per source→target agent pair.
 * Handles session state including sequence numbers and cumulative acknowledgments.
 */
export interface AACPSessionManager {
  /**
   * Create a new session between two agents
   */
  createSession(sourceAgentId: string, targetAgentId: string): Promise<AACPSession>;
  
  /**
   * Get existing session or null if not found
   */
  getSession(sourceAgentId: string, targetAgentId: string): Promise<AACPSession | null>;
  
  /**
   * Close and cleanup session resources
   */
  closeSession(sourceAgentId: string, targetAgentId: string): Promise<void>;
  
  /**
   * List all active sessions
   */
  listSessions(): Promise<AACPSessionInfo[]>;
}

/**
 * AACP Session Interface
 * 
 * Represents an active communication session between two agents.
 * Handles sequence number generation and acknowledgment tracking.
 */
export interface AACPSession {
  /** Source agent identifier */
  readonly sourceAgentId: string;
  
  /** Target agent identifier */
  readonly targetAgentId: string;
  
  /** Next sequence number to use (monotonically increasing) */
  readonly nextSeq: number;
  
  /** 
   * Last acknowledged sequence number (cumulative, contiguous prefix only)
   * 
   * ACKNOWLEDGMENT SEMANTICS (NORMATIVE):
   * - ack represents RECEIPT acknowledgment (message received in order)
   * - ack advances only to highest contiguous seq where all seq ≤ ack have been received
   * - Out-of-order messages create gaps that prevent ack advancement
   * - Semantic completion is tracked separately in the ledger via requestId status
   */
  readonly lastAck: number;
  
  /**
   * Send a message and get the next sequence number
   * @returns messageId for the sent message
   */
  sendMessage(payload: unknown, messageType: AACPMessageType, requestId?: string): Promise<string>;
  
  /**
   * Acknowledge receipt of messages up to the given sequence number
   * Only advances if it maintains contiguous sequence (no gaps)
   */
  acknowledgeMessage(seq: number): Promise<void>;
  
  /**
   * Get unacknowledged messages for retransmission
   */
  getUnacknowledgedMessages(): Promise<AACPEnvelope[]>;
}

/**
 * Session information for monitoring and management
 */
export interface AACPSessionInfo {
  sourceAgentId: string;
  targetAgentId: string;
  nextSeq: number;
  lastAck: number;
  createdAt: string;
  lastActivity: string;
}

/**
 * AACP Ledger Interface
 * 
 * Provides append-only ledger operations for message tracking and deduplication.
 * Supports both transport acknowledgment (messageId) and semantic acknowledgment (requestId).
 * 
 * DEDUPLICATION SEMANTICS (NORMATIVE):
 * - Deduplication keys on requestId for idempotent request semantics
 * - Duplicate requestId MUST be processed idempotently
 * - Deduplication check MUST occur before execution
 * - Completed requests return cached results; in-progress requests are ignored
 */
export interface AACPLedger {
  /**
   * Append a message to the ledger
   * Creates both message record (keyed by messageId) and request record (keyed by requestId if present)
   * 
   * PROCESSING ORDER (NORMATIVE):
   * 1. Deduplication check by requestId
   * 2. If duplicate and completed, return cached result
   * 3. If duplicate and in-progress, ignore (do not execute)
   * 4. If new, append to ledger and proceed with execution
   */
  append(envelope: AACPEnvelope): Promise<AACPLedgerResult>;
  
  /**
   * Look up message by messageId
   */
  getByMessageId(messageId: string): Promise<AACPMessageRecord | null>;
  
  /**
   * Look up request by requestId (for deduplication)
   */
  getByRequestId(requestId: string): Promise<AACPRequestRecord | null>;
  
  /**
   * Mark a request as completed
   * Updates request record outcome first, then associated message records
   */
  markCompleted(requestId: string, outcome: AACPOutcome, completionRef?: string): Promise<void>;
  
  /**
   * Mark a request as failed
   * Updates request record outcome first, then associated message records
   */
  markFailed(requestId: string, error: StructuredError): Promise<void>;
  
  /**
   * Get unacknowledged messages for a source-target pair
   * Used for gap detection and retransmission
   */
  getUnacknowledgedMessages(sourceAgentId: string, targetAgentId: string): Promise<AACPEnvelope[]>;
  
  /**
   * Query messages by status for recovery operations
   */
  queryMessagesByStatus(outcome: AACPOutcome, olderThan?: Date): Promise<AACPMessageRecord[]>;
  
  /**
   * Query pending requests for retry processing
   */
  queryPendingRequests(olderThan?: Date): Promise<AACPRequestRecord[]>;
}

/**
 * Result of ledger append operation
 */
export interface AACPLedgerResult {
  /** Whether this was a duplicate request */
  isDuplicate: boolean;
  
  /** Cached result if duplicate and completed */
  cachedResult?: unknown;
  
  /** Completion reference if duplicate and completed */
  completionRef?: string;
  
  /** Whether to proceed with execution (false for duplicates) */
  shouldExecute: boolean;
}

/**
 * AACP Retransmitter Interface
 * 
 * Handles retry scheduling and policy enforcement for failed messages.
 * Implements exponential backoff with jitter and configurable retry policies.
 */
export interface AACPRetransmitter {
  /**
   * Schedule a retry for a failed message
   * @param messageId Message to retry
   * @param delayMs Delay before retry attempt
   */
  scheduleRetry(messageId: string, delayMs: number): Promise<void>;
  
  /**
   * Cancel a scheduled retry
   */
  cancelRetry(messageId: string): Promise<void>;
  
  /**
   * Process all due retries (called manually in v0.1, background process in v0.2)
   */
  processRetries(): Promise<void>;
  
  /**
   * Policy hook: determine if an error should trigger retry
   */
  shouldRetry(record: AACPMessageRecord, error?: StructuredError): boolean;
  
  /**
   * Policy hook: calculate backoff delay for retry attempt
   * Implements exponential backoff with jitter
   */
  getBackoffDelay(retryCount: number): number;
  
  /**
   * Policy hook: get maximum retry attempts
   */
  getMaxAttempts(): number;
  
  /**
   * Update retry policy configuration
   */
  updatePolicy(policy: AACPRetryPolicy): void;
}

/**
 * AACP Component Processing Order (NORMATIVE)
 * 
 * The following processing order MUST be followed for reliable message handling:
 * 
 * 1. **Message Reception**: Decoder deserializes envelope from transport
 * 2. **Session Validation**: SessionManager validates source/target and sequence
 * 3. **Deduplication Check**: Ledger checks for duplicate requestId before execution
 * 4. **Idempotency Handling**: Return cached result if duplicate and completed
 * 5. **Execution**: Process message only if not duplicate or in-progress
 * 6. **Completion Tracking**: Ledger records outcome and updates status
 * 7. **Acknowledgment**: SessionManager updates ack for received messages
 * 8. **Retry Scheduling**: Retransmitter schedules retries for failed messages
 * 
 * This order ensures:
 * - No duplicate execution of requests
 * - Proper sequence ordering and gap detection
 * - Reliable delivery with retry mechanisms
 * - Consistent state across agent restarts (when persistent storage is used)
 */