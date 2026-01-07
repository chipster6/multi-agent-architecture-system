/**
 * Agent-to-Agent Communication Protocol (AACP) Core Types
 * 
 * This module defines the foundational types for AACP v0.2 target implementation.
 * The v0.1 implementation will be minimal (in-memory only) but architecturally sound.
 */

import type { StructuredError } from '../errors/index.js';

/**
 * AACP Message Type enumeration
 * 
 * Defines the three core message types in the AACP protocol:
 * - REQUEST: A message that expects a response
 * - RESPONSE: A reply to a REQUEST message
 * - EVENT: A one-way notification message
 */
export type AACPMessageType = 'REQUEST' | 'RESPONSE' | 'EVENT';

/**
 * AACP Envelope Interface
 * 
 * The core message envelope for all AACP communications.
 * Supports the 6 AACP invariants: uniqueness, stability, ordering, pairing, acknowledgment, deduplication.
 */
export interface AACPEnvelope {
  /** UUID v4, unique per transmission attempt */
  messageId: string;
  
  /** UUID v4, stable across retries for same logical request (present for REQUEST/RESPONSE) */
  requestId?: string;
  
  /** Sending agent identifier */
  sourceAgentId: string;
  
  /** Receiving agent identifier */
  targetAgentId: string;
  
  /** Sequence number per source-target pair (monotonically increasing) */
  seq: number;
  
  /** Acknowledgment of highest received seq (cumulative, contiguous prefix only) */
  ack?: number;
  
  /** Message type */
  messageType: AACPMessageType;
  
  /** ISO 8601 timestamp */
  timestamp: string;
  
  /** Application-specific message content */
  payload: unknown;
}

/**
 * AACP Outcome enumeration
 * 
 * Represents the processing outcome of an AACP message:
 * - COMPLETED: Message successfully processed
 * - FAILED: Message processing failed permanently
 * - UNKNOWN: Message state unknown (timeout, partition) - represents observability loss
 */
export enum AACPOutcome {
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED', 
  UNKNOWN = 'UNKNOWN'
}

/**
 * AACP Message Status Interface
 * 
 * Tracks the status and outcome of individual messages for resumability.
 */
export interface AACPMessageStatus {
  /** Message identifier */
  messageId: string;
  
  /** Request identifier (present for REQUEST/RESPONSE messages) */
  requestId?: string;
  
  /** Processing outcome */
  outcome: AACPOutcome;
  
  /** ISO 8601 timestamp of status update */
  timestamp: string;
  
  /** Error details (present when outcome === FAILED) */
  error?: StructuredError;
  
  /** Reference to completion record/payload (future: blob storage for large payloads) */
  completionRef?: string;
}

/**
 * AACP Request Record Interface
 * 
 * Ledger-first storage for request tracking and deduplication.
 * Supports idempotent semantics via requestId deduplication.
 */
export interface AACPRequestRecord {
  /** Request identifier (deduplication key) */
  requestId: string;
  
  /** Sending agent identifier */
  sourceAgentId: string;
  
  /** Receiving agent identifier */
  targetAgentId: string;
  
  /** Message type (REQUEST or RESPONSE) */
  messageType: 'REQUEST' | 'RESPONSE';
  
  /** Small payloads stored inline for v0.1 */
  payload: unknown;
  
  /** Processing status */
  status: AACPOutcome;
  
  /** ISO 8601 timestamp of record creation */
  timestamp: string;
  
  /** ISO 8601 timestamp for TTL/retention (optional) */
  expiresAt?: string;
  
  /** Reference to blob storage for large payloads (v0.2 future) */
  completionRef?: string;
  
  /** Error details (present when status === FAILED) */
  error?: StructuredError;
}

/**
 * AACP Message Record Interface
 * 
 * Ledger-first storage for message tracking and retry management.
 */
export interface AACPMessageRecord {
  /** Message identifier */
  messageId: string;
  
  /** Request identifier (for REQUEST/RESPONSE correlation) */
  requestId?: string;
  
  /** Complete message envelope */
  envelope: AACPEnvelope;
  
  /** Processing status */
  status: AACPOutcome;
  
  /** ISO 8601 timestamp of record creation */
  timestamp: string;
  
  /** ISO 8601 timestamp for TTL/retention (optional) */
  expiresAt?: string;
  
  /** Number of retry attempts */
  retryCount: number;
  
  /** ISO 8601 timestamp for next retry attempt (optional) */
  nextRetryAt?: string;
}

/**
 * AACP Retry Policy Interface
 * 
 * Configures retry behavior for failed messages with exponential backoff.
 */
export interface AACPRetryPolicy {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  
  /** Base delay in milliseconds for first retry */
  baseDelayMs: number;
  
  /** Maximum delay in milliseconds (caps exponential backoff) */
  maxDelayMs: number;
  
  /** Multiplier for exponential backoff (e.g., 2.0 for doubling) */
  backoffMultiplier: number;
  
  /** Function to determine if an error should trigger retry */
  shouldRetryError: (error: StructuredError) => boolean;
}