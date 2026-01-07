/**
 * Agent-to-Agent Communication Protocol (AACP) Foundation Module
 * 
 * This module provides the foundational types and interfaces for AACP v0.2 target implementation.
 * The v0.1 implementation is minimal (in-memory only) but architecturally sound.
 * 
 * ## AACP Purpose and Benefits
 * 
 * AACP provides:
 * - **Reliability**: Message delivery guarantees with retry and acknowledgment
 * - **Resumability**: Communication can resume across agent restarts and network partitions
 * - **Ordering**: Sequence-based message ordering per agent pair
 * - **Deduplication**: Idempotent message processing via requestId deduplication
 * 
 * ## v0.1 Limitations
 * 
 * The current implementation has the following limitations:
 * - **In-memory only**: No persistence across process restarts
 * - **Single process**: No distributed coordination
 * - **Small payloads**: Large payload support via completionRef reserved for v0.2
 * 
 * ## v0.2 Roadmap
 * 
 * Future enhancements will include:
 * - **Persistent storage**: True durability across restarts and deployments
 * - **Distributed coordination**: Multi-process and multi-node agent communication
 * - **Large payload support**: Blob storage integration via completionRef
 * - **Advanced retry policies**: Configurable backoff strategies and error classification
 * 
 * ## Integration with AgentCoordinator
 * 
 * The existing AgentCoordinator will be extended in v0.2 to support AACP:
 * - Current `sendMessage()` method remains unchanged for backward compatibility
 * - New `sendReliableMessage()` and `sendRequest()` methods will provide AACP features
 * - Migration to v0.2 is opt-in via new methods, not forced upgrade
 */

// Export all AACP types
export type {
  AACPMessageType,
  AACPEnvelope,
  AACPMessageStatus,
  AACPRequestRecord,
  AACPMessageRecord,
  AACPRetryPolicy
} from './types.js';

export { AACPOutcome } from './types.js';

// Export component interfaces
export type {
  AACPEncoder,
  AACPSession,
  AACPSessionInfo,
  AACPLedger,
  AACPLedgerResult
} from './interfaces.js';

// Export persistence adapter interface and implementation
export type { AACPPersistenceAdapter } from './persistenceAdapter.js';
export { InMemoryAACPPersistenceAdapter } from './persistenceAdapter.js';

// Export InMemoryAACPPersistenceAdapter as default v0.1 implementation
export { InMemoryAACPPersistenceAdapter as default } from './persistenceAdapter.js';

// Export ledger implementation
export { InMemoryAACPLedger } from './ledger.js';

// Export session manager implementation
export { AACPSessionManager } from './sessionManager.js';

// Export retransmitter implementation
export { AACPRetransmitter } from './retransmitter.js';

/**
 * IMPORTANT DURABILITY DISCLAIMER
 * 
 * The InMemoryAACPPersistenceAdapter provides best-effort tracking for a single 
 * process lifetime only and MUST NOT be considered durable across restarts.
 * 
 * For production use cases requiring durability, wait for v0.2 which will include
 * persistent storage adapters for databases and file systems.
 */