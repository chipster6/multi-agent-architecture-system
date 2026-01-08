/**
 * ID generation utilities for the MCP server.
 * Provides UUID v4 generation for various server components with support
 * for deterministic testing through dependency injection.
 */

import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Interface for generating various types of IDs used throughout the system.
 */
export interface IdGenerator {
  /**
   * Generate a run ID for tool invocations.
   * Each tools/call invocation gets a unique run ID for tracing.
   * @returns UUID v4 string
   */
  generateRunId(): string;

  /**
   * Generate a correlation ID for request chains.
   * Used to trace related requests across the system.
   * @returns UUID v4 string
   */
  generateCorrelationId(): string;

  /**
   * Generate a connection correlation ID for connection lifetime.
   * Used as fallback correlation ID for protocol errors when request correlation cannot be derived.
   * @returns UUID v4 string
   */
  generateConnectionCorrelationId(): string;
}

/**
 * Production ID generator implementation using Node.js crypto.randomUUID().
 * Generates cryptographically secure UUID v4 strings.
 */
export class ProductionIdGenerator implements IdGenerator {
  /**
   * Generate a run ID for tool invocations.
   * @returns UUID v4 string
   */
  generateRunId(): string {
    return randomUUID();
  }

  /**
   * Generate a correlation ID for request chains.
   * @returns UUID v4 string
   */
  generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Generate a connection correlation ID for connection lifetime.
   * @returns UUID v4 string
   */
  generateConnectionCorrelationId(): string {
    return randomUUID();
  }
}

/**
 * Deterministic ID generator for testing.
 * Allows injection of fixed or sequential values for predictable test behavior.
 */
export class DeterministicIdGenerator implements IdGenerator {
  private runIdCounter = 0;
  private correlationIdCounter = 0;
  private connectionCorrelationIdCounter = 0;

  constructor(
    private readonly runIdPrefix = 'run',
    private readonly correlationIdPrefix = 'corr',
    private readonly connectionCorrelationIdPrefix = 'conn'
  ) {}

  /**
   * Generate a deterministic run ID for testing.
   * @returns Deterministic ID string
   */
  generateRunId(): string {
    return `${this.runIdPrefix}-${++this.runIdCounter}`;
  }

  /**
   * Generate a deterministic correlation ID for testing.
   * @returns Deterministic ID string
   */
  generateCorrelationId(): string {
    return `${this.correlationIdPrefix}-${++this.correlationIdCounter}`;
  }

  /**
   * Generate a deterministic connection correlation ID for testing.
   * @returns Deterministic ID string in format "conn-xxxxxxxx" (8 digits)
   */
  generateConnectionCorrelationId(): string {
    const paddedCounter = String(++this.connectionCorrelationIdCounter).padStart(8, '0');
    return `${this.connectionCorrelationIdPrefix}-${paddedCounter}`;
  }

  /**
   * Reset all counters to initial state.
   * Useful for test setup to ensure consistent starting state.
   */
  reset(): void {
    this.runIdCounter = 0;
    this.correlationIdCounter = 0;
    this.connectionCorrelationIdCounter = 0;
  }

  /**
   * Set specific counter values for fine-grained test control.
   * @param counters - Object with optional counter values
   */
  setCounters(counters: {
    runId?: number;
    correlationId?: number;
    connectionCorrelationId?: number;
  }): void {
    if (counters.runId !== undefined) {
      this.runIdCounter = counters.runId;
    }
    if (counters.correlationId !== undefined) {
      this.correlationIdCounter = counters.correlationId;
    }
    if (counters.connectionCorrelationId !== undefined) {
      this.connectionCorrelationIdCounter = counters.connectionCorrelationId;
    }
  }
}

/**
 * Fixed ID generator for testing specific scenarios.
 * Returns the same fixed values for all ID types.
 */
export class FixedIdGenerator implements IdGenerator {
  constructor(
    private readonly runId = 'fixed-run-id',
    private readonly correlationId = 'fixed-correlation-id',
    private readonly connectionCorrelationId = 'fixed-connection-correlation-id'
  ) {}

  /**
   * Generate a fixed run ID for testing.
   * @returns Fixed ID string
   */
  generateRunId(): string {
    return this.runId;
  }

  /**
   * Generate a fixed correlation ID for testing.
   * @returns Fixed ID string
   */
  generateCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Generate a fixed connection correlation ID for testing.
   * @returns Fixed ID string
   */
  generateConnectionCorrelationId(): string {
    return this.connectionCorrelationId;
  }
}

/**
 * Generate a UUID v7 string (time-ordered).
 * This is useful for AACP message IDs and trace IDs.
 */
export function generateUuidV7(): string {
  const bytes = randomBytes(16);
  const now = Date.now();

  bytes[0] = (now >> 40) & 0xff;
  bytes[1] = (now >> 32) & 0xff;
  bytes[2] = (now >> 24) & 0xff;
  bytes[3] = (now >> 16) & 0xff;
  bytes[4] = (now >> 8) & 0xff;
  bytes[5] = now & 0xff;

  // Set version to 7
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  // Set variant to RFC 4122 (10xxxxxx)
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Buffer.from(bytes).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/**
 * Create a production ID generator instance.
 * @returns ProductionIdGenerator instance
 */
export function createIdGenerator(): IdGenerator {
  return new ProductionIdGenerator();
}

/**
 * Create a deterministic ID generator for testing.
 * @param prefixes - Optional prefixes for different ID types
 * @returns DeterministicIdGenerator instance
 */
export function createDeterministicIdGenerator(prefixes?: {
  runId?: string;
  correlationId?: string;
  connectionCorrelationId?: string;
}): DeterministicIdGenerator {
  return new DeterministicIdGenerator(
    prefixes?.runId,
    prefixes?.correlationId,
    prefixes?.connectionCorrelationId
  );
}

/**
 * Create a fixed ID generator for testing.
 * @param ids - Optional fixed ID values
 * @returns FixedIdGenerator instance
 */
export function createFixedIdGenerator(ids?: {
  runId?: string;
  correlationId?: string;
  connectionCorrelationId?: string;
}): FixedIdGenerator {
  return new FixedIdGenerator(
    ids?.runId,
    ids?.correlationId,
    ids?.connectionCorrelationId
  );
}
