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
 * Agent identifier for routing and context propagation.
 */
export interface AgentIdentifier {
  id: string;
  type: string;
  phase: number;
  instance?: string;
}

/**
 * Destination routing for AACP messages.
 */
export type Destination =
  | { type: 'direct'; agentId: string }
  | { type: 'broadcast'; channel: string }
  | { type: 'multicast'; agentIds: string[] }
  | { type: 'coordinator' }
  | { type: 'reply' };

/**
 * Priority levels for message routing.
 */
export type Priority = 'critical' | 'high' | 'normal' | 'low' | 'background';

/**
 * Propagated context shared across agents.
 * Defined as a flexible object to avoid constraining future context models.
 */
export type PropagatedContext = Record<string, unknown>;

/**
 * Tracing context for distributed observability.
 */
export interface TracingContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled?: boolean;
  baggage?: Record<string, string>;
  tracestate?: Record<string, string>;
}

/**
 * Authentication and authorization context.
 */
export interface AuthContext {
  subject?: string;
  roles?: string[];
  scopes?: string[];
  method?: string;
  issuedAt?: string;
  expiresAt?: string;
  claims?: Record<string, unknown>;
}

/**
 * Signature metadata for message integrity.
 */
export interface SignatureContext {
  value: string;
  keyId?: string;
  algorithm?: string;
  signedFields?: string[];
}

/**
 * AACP Envelope Interface
 * 
 * The core message envelope for all AACP communications.
 * Supports the 6 AACP invariants: uniqueness, stability, ordering, pairing, acknowledgment, deduplication.
 */
export interface AACPEnvelope {
  /** UUID v7 (time-ordered) */
  id: string;

  /** Correlation identifier for related message chains */
  correlationId: string;

  /** Causation identifier for parent message */
  causationId?: string;

  /** Sending agent identifier */
  source: AgentIdentifier;

  /** Routing destination */
  destination: Destination;

  /** Payload discriminator */
  type: string;

  /** Protocol version (semver) */
  version: string;

  /** ISO 8601 timestamp */
  timestamp: string;

  /** Optional time-to-live in milliseconds */
  ttl?: number;

  /** Message priority */
  priority: Priority;

  /** Shared context propagated across agents */
  context: PropagatedContext;

  /** Tracing metadata */
  tracing: TracingContext;

  /** Application-specific message content */
  payload: unknown;

  /** Optional authentication context */
  auth?: AuthContext;

  /** Optional signature context */
  signature?: SignatureContext;

  /**
   * Transport/reliability fields (AACP v0.1 extension).
   * Retained for ordered delivery and acknowledgment tracking.
   */
  messageType?: AACPMessageType;
  requestId?: string;
  seq?: number;
  ack?: number;
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
  /** Message identifier (UUID v7) */
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

  /** Correlation identifier for request chain */
  correlationId?: string;

  /** Causation identifier for request chain */
  causationId?: string;
  
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
