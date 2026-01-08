/**
 * AACP Retransmission Skeleton Implementation
 * 
 * Handles retry scheduling and policy enforcement for failed messages.
 * Implements exponential backoff with jitter and configurable retry policies.
 * 
 * RETRY CONTRACT (NORMATIVE):
 * - Reuse requestId across retry attempts for idempotent semantics
 * - Generate new messageId per retry attempt for transport tracking
 * - UNKNOWN states are retryable (timeout ⇒ UNKNOWN ⇒ retryable)
 * - FAILED states are not retried unless policy explicitly allows
 * 
 * IMPORTANT v0.1 LIMITATION:
 * No background timers required in v0.1 (manual processRetriesOnce).
 * v0.2 will add background processing with automatic retry scheduling.
 */

import type { AACPMessageRecord, AACPRetryPolicy } from './types.js';
import { AACPOutcome } from './types.js';
import type { StructuredError } from '../errors/index.js';
import { ErrorCode } from '../errors/index.js';

/**
 * Scheduled retry entry
 */
interface ScheduledRetry {
  messageId: string;
  scheduledAt: number; // timestamp when retry should execute
  attempt: number;
}

/**
 * Default retry policy implementation
 */
const createDefaultRetryPolicy = (): AACPRetryPolicy => ({
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2.0,
  shouldRetryError: (error: StructuredError) => {
    const retryableErrorCodes = [
      ErrorCode.Timeout,
      ErrorCode.ResourceExhausted,
      ErrorCode.Internal
    ];
    return retryableErrorCodes.includes(error.code);
  }
});

/**
 * AACP Retransmitter Skeleton
 * 
 * Implements retry scheduling without background processing for v0.1.
 */
export class AACPRetransmitter {
  private readonly scheduledRetries = new Map<string, ScheduledRetry>();
  private retryPolicy: AACPRetryPolicy;
  private readonly randomGenerator: () => number;
  private readonly jitterFactor: number;

  constructor(
    retryPolicy?: AACPRetryPolicy,
    randomGenerator: () => number = Math.random,
    jitterFactor: number = 0.1
  ) {
    this.retryPolicy = retryPolicy ?? createDefaultRetryPolicy();
    this.randomGenerator = randomGenerator;
    this.jitterFactor = jitterFactor;
  }

  /**
   * Schedule a retry for a failed message
   * @param messageId Message to retry
   * @param delayMs Delay before retry attempt
   */
  scheduleRetry(messageId: string, delayMs: number): Promise<void> {
    const scheduledAt = Date.now() + delayMs;
    
    // Get current attempt count
    const existing = this.scheduledRetries.get(messageId);
    const attempt = existing ? existing.attempt + 1 : 1;
    
    this.scheduledRetries.set(messageId, {
      messageId,
      scheduledAt,
      attempt
    });
    return Promise.resolve();
  }

  /**
   * Cancel a scheduled retry
   */
  cancelRetry(messageId: string): Promise<void> {
    this.scheduledRetries.delete(messageId);
    return Promise.resolve();
  }

  /**
   * Process retries once (called manually in tests; no background worker)
   * 
   * Returns messageIds that are due for retry.
   * Caller is responsible for executing actual retry logic.
   */
  processRetriesOnce(): Promise<string[]> {
    const now = Date.now();
    const dueRetries: string[] = [];
    
    for (const [messageId, retry] of this.scheduledRetries.entries()) {
      if (retry.scheduledAt <= now) {
        dueRetries.push(messageId);
        // Remove from scheduled (caller will reschedule if needed)
        this.scheduledRetries.delete(messageId);
      }
    }
    
    return Promise.resolve(dueRetries);
  }

  /**
   * Determine if message should be retried based on policy
   * 
   * RETRY CLASSIFICATION (NORMATIVE):
   * - UNKNOWN states retried (timeout ⇒ UNKNOWN ⇒ retryable)
   * - FAILED not retried unless policy allows
   * - Max attempts enforced
   */
  shouldRetry(record: AACPMessageRecord, error?: StructuredError): boolean {
    // Check attempt limit
    if (record.retryCount >= this.retryPolicy.maxAttempts) {
      return false;
    }
    
    // UNKNOWN states retried (timeout scenarios)
    if (record.status === AACPOutcome.UNKNOWN) {
      return true;
    }
    
    // FAILED not retried unless policy allows
    if (record.status === AACPOutcome.FAILED && error) {
      return this.retryPolicy.shouldRetryError(error);
    }
    
    return false;
  }

  /**
   * Calculate backoff delay with exponential backoff and jitter
   * 
   * BACKOFF FORMULA (NORMATIVE):
   * delay = min(baseDelay * (multiplier ^ attempt), maxDelay)
   * jitteredDelay = delay * (1 + jitter * (random - 0.5) * 2)
   */
  calculateBackoffDelay(attempt: number): number {
    const { baseDelayMs, maxDelayMs, backoffMultiplier } = this.retryPolicy;
    
    // Exponential backoff
    const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt);
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.jitterFactor * (this.randomGenerator() - 0.5) * 2;
    const jitteredDelay = cappedDelay + jitter;
    
    return Math.max(0, Math.round(jitteredDelay));
  }

  /**
   * Update retry policy configuration
   */
  updatePolicy(policy: AACPRetryPolicy): void {
    this.retryPolicy = policy;
  }

  /**
   * Get current policy (for inspection)
   */
  getPolicy(): AACPRetryPolicy {
    return this.retryPolicy;
  }

  /**
   * Get scheduled retries (for monitoring/testing)
   */
  getScheduledRetries(): Array<{ messageId: string; scheduledAt: number; attempt: number }> {
    return Array.from(this.scheduledRetries.values());
  }

  /**
   * Clear all scheduled retries (for testing)
   */
  clear(): void {
    this.scheduledRetries.clear();
  }
}
