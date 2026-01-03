/**
 * Session management module for the MCP server.
 * Handles per-connection session context including state tracking,
 * correlation IDs, and child logger creation.
 */

import type { IdGenerator } from '../shared/idGenerator.js';
import type { StructuredLogger } from '../logging/structuredLogger.js';

/**
 * Transport type enumeration for identifying connection types.
 * Used for admin policy enforcement and connection-specific behavior.
 */
export type TransportType = 'stdio' | 'sse' | 'http';

/**
 * Transport interface representing a connection to the MCP server.
 * Provides type information for admin policy enforcement.
 */
export interface Transport {
  /**
   * The type of transport connection.
   * Used to determine which admin policies apply.
   */
  type: TransportType;
}

/**
 * Session state enumeration for protocol lifecycle management.
 * Tracks the initialization state of each client connection.
 */
export type SessionState = 'STARTING' | 'INITIALIZING' | 'RUNNING' | 'CLOSED';

/**
 * Session context interface representing a single client connection.
 * Maintains per-connection state, correlation tracking, and logging context.
 * 
 * Each connection has independent state and lifecycle. The session context
 * is created when a client connects and transitions through states as the
 * MCP protocol initialization sequence progresses.
 * 
 * @example
 * ```typescript
 * const session: SessionContext = {
 *   connectionCorrelationId: 'conn-abc123',
 *   state: 'STARTING',
 *   transport: { type: 'stdio' },
 *   logger: childLogger
 * };
 * ```
 */
export interface SessionContext {
  /**
   * Unique correlation ID for this connection lifetime.
   * Generated at session creation and used for all protocol errors
   * where request-level correlation cannot be derived.
   * 
   * Format: UUID v4
   * Scope: Connection lifetime
   * 
   * @example 'conn-550e8400-e29b-41d4-a716-446655440000'
   */
  connectionCorrelationId: string;

  /**
   * Current state of the protocol lifecycle for this connection.
   * Transitions: STARTING → INITIALIZING → RUNNING → CLOSED
   * 
   * - STARTING: Initial state, only initialize/initialized allowed
   * - INITIALIZING: After initialize received, waiting for initialized
   * - RUNNING: After initialized received, all methods allowed
   * - CLOSED: Connection closed, terminal state
   */
  state: SessionState;

  /**
   * Transport information for this connection.
   * Used for admin policy enforcement and connection-specific behavior.
   */
  transport: Transport;

  /**
   * Child logger with connectionCorrelationId in context.
   * All logs from this session include the connection correlation ID
   * for distributed tracing across the connection lifetime.
   * 
   * The logger is created as a child of the parent logger with
   * connectionCorrelationId pre-populated in the context.
   */
  logger: StructuredLogger;
}

/**
 * Creates a new session context for a client connection.
 * 
 * Initializes session state to STARTING and generates a unique
 * connectionCorrelationId for the connection lifetime. Creates a child
 * logger with the connectionCorrelationId pre-populated in context.
 * 
 * @param transport - Transport information for the connection
 * @param idGenerator - ID generator for creating correlation IDs
 * @param parentLogger - Parent logger to create child logger from
 * @returns New SessionContext for the connection
 * 
 * @example
 * ```typescript
 * const session = createSession(
 *   { type: 'stdio' },
 *   idGenerator,
 *   parentLogger
 * );
 * 
 * console.log(session.state); // 'STARTING'
 * console.log(session.connectionCorrelationId); // UUID v4
 * ```
 */
export function createSession(
  transport: Transport,
  idGenerator: IdGenerator,
  parentLogger: StructuredLogger
): SessionContext {
  // Generate unique correlation ID for this connection
  const connectionCorrelationId = idGenerator.generateConnectionCorrelationId();

  // Create child logger with connectionCorrelationId in context
  const logger = parentLogger.child({
    connectionCorrelationId,
  });

  return {
    connectionCorrelationId,
    state: 'STARTING',
    transport,
    logger,
  };
}
