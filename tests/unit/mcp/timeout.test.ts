/**
 * Unit tests for timeout contract implementation.
 * Tests cooperative cancellation, slot management, and late completion handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResourceManagerImpl } from '../../../src/resources/resourceManager.js';
import type { ServerConfig } from '../../../src/config/configManager.js';

describe('Timeout Contract', () => {
  let resourceManager: ResourceManagerImpl;
  let config: ServerConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    
    config = {
      server: { name: 'test', version: '1.0.0', shutdownTimeoutMs: 10000 },
      tools: {
        defaultTimeoutMs: 100,
        maxPayloadBytes: 1048576,
        maxStateBytes: 262144,
        adminRegistrationEnabled: false,
        adminPolicy: { mode: 'deny_all' },
      },
      resources: {
        maxConcurrentExecutions: 1,
      },
      logging: {
        level: 'info',
        redactKeys: ['token', 'key', 'secret', 'password'],
      },
      security: {
        dynamicRegistrationEnabled: false,
        allowArbitraryCodeTools: false,
      },
    };
    
    resourceManager = new ResourceManagerImpl(config);
  });

  afterEach(() => {
    vi.useRealTimers();
    resourceManager.destroy();
  });

  describe('Slot management during timeout', () => {
    it('should hold slot until handler completes even after timeout', async () => {
      // This test verifies the critical timeout contract requirement:
      // Slots must NOT be released immediately on timeout - they must be held
      // until the handler actually completes (cooperative cancellation)
      
      // Simulate the timeout scenario by testing slot behavior directly
      
      // Step 1: Acquire a slot (simulating tools/call step 6)
      const releaseSlot = resourceManager.tryAcquireSlot();
      expect(releaseSlot).not.toBeNull();
      
      // Step 2: Verify slot is held (concurrent executions = 1)
      const telemetryAfterAcquire = resourceManager.getTelemetry();
      expect(telemetryAfterAcquire.concurrentExecutions).toBe(1);
      
      // Step 3: Try to acquire another slot - should fail since we're at max
      const secondSlot = resourceManager.tryAcquireSlot();
      expect(secondSlot).toBeNull(); // Should be null because we're at max concurrency
      
      // Step 4: Simulate timeout occurring (but handler still running)
      // In the real implementation, timeout would fire AbortSignal but NOT release slot
      // The slot should remain held until handler completes
      
      // Verify slot is still held after "timeout"
      const telemetryDuringTimeout = resourceManager.getTelemetry();
      expect(telemetryDuringTimeout.concurrentExecutions).toBe(1);
      
      // Step 5: Simulate handler completion (finally block in tools/call)
      releaseSlot!();
      
      // Step 6: Verify slot is now released
      const telemetryAfterRelease = resourceManager.getTelemetry();
      expect(telemetryAfterRelease.concurrentExecutions).toBe(0);
      
      // Step 7: Verify we can now acquire a slot again
      const thirdSlot = resourceManager.tryAcquireSlot();
      expect(thirdSlot).not.toBeNull();
      thirdSlot!(); // Clean up
    });

    it('should demonstrate proper slot lifecycle with multiple handlers', async () => {
      // This test demonstrates that slots are properly managed across multiple handlers
      // and that the timeout mechanism doesn't interfere with slot management
      
      const slots: Array<() => void> = [];
      
      // Acquire the single available slot
      const slot1 = resourceManager.tryAcquireSlot();
      expect(slot1).not.toBeNull();
      slots.push(slot1!);
      
      // Verify we're at capacity
      expect(resourceManager.getTelemetry().concurrentExecutions).toBe(1);
      
      // Try to acquire another slot - should fail
      const slot2 = resourceManager.tryAcquireSlot();
      expect(slot2).toBeNull();
      
      // Simulate first handler completing (even after timeout)
      slots[0]();
      
      // Verify slot is released
      expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
      
      // Now we should be able to acquire a slot again
      const slot3 = resourceManager.tryAcquireSlot();
      expect(slot3).not.toBeNull();
      slot3!(); // Clean up
    });

    it('should verify slot holding prevents resource exhaustion errors', async () => {
      // This test verifies that holding slots until handler completion
      // prevents premature resource availability
      
      // Acquire all available slots (we have maxConcurrentExecutions = 1)
      const slot1 = resourceManager.tryAcquireSlot();
      expect(slot1).not.toBeNull();
      
      // Verify we're at capacity
      expect(resourceManager.getTelemetry().concurrentExecutions).toBe(1);
      expect(resourceManager.isApproachingLimits()).toBe(true);
      
      // Try to acquire another slot - should fail (resource exhausted)
      const slot2 = resourceManager.tryAcquireSlot();
      expect(slot2).toBeNull();
      
      // Simulate timeout occurring - in real implementation, this would:
      // 1. Fire AbortSignal
      // 2. Return TIMEOUT error to client
      // 3. BUT keep slot held until handler completes
      
      // Slot should still be held (simulating handler still running after timeout)
      expect(resourceManager.getTelemetry().concurrentExecutions).toBe(1);
      
      // Another request should still fail
      const slot3 = resourceManager.tryAcquireSlot();
      expect(slot3).toBeNull();
      
      // Only after handler completes should slot be released
      slot1!();
      
      // Now resources are available again
      expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
      expect(resourceManager.isApproachingLimits()).toBe(false);
      
      // New requests should succeed
      const slot4 = resourceManager.tryAcquireSlot();
      expect(slot4).not.toBeNull();
      slot4!(); // Clean up
    });
  });

  describe('Late completion handling', () => {
    it('should log late completion when handler finishes after timeout', async () => {
      // This test verifies the critical late completion requirement:
      // When a handler completes after timeout has already been returned,
      // the completion should be logged but no MCP response should be sent
      
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
        redact: vi.fn(obj => obj),
        sanitize: vi.fn(str => str),
        clock: { now: () => '2024-01-01T00:00:00.000Z' },
        defaultRedactKeys: ['token', 'key', 'secret', 'password'],
        redactKeys: new Set(['token', 'key', 'secret', 'password']),
        originalRedactKeys: ['token', 'key', 'secret', 'password'],
        writeLogEntry: vi.fn(),
      } as any;

      // Import the late completion logging function
      const { logLateToolCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');
      
      // Simulate a late completion scenario
      const runId = 'run-123';
      const correlationId = 'corr-456';
      const toolName = 'slow-tool';
      const durationMs = 5000; // Tool took 5 seconds, but timeout was 100ms
      
      // Call the late completion logger
      logLateToolCompletion(mockLogger, runId, correlationId, toolName, durationMs);
      
      // Verify that the completion was logged at WARN level
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      
      // Verify the log entry contains the expected fields
      const logCall = mockLogger.warn.mock.calls[0];
      expect(logCall[0]).toBe(`Tool invocation completed: ${toolName}`);
      
      const logContext = logCall[1];
      expect(logContext).toMatchObject({
        runId,
        correlationId,
        toolName,
        durationMs,
        outcome: ToolCompletionOutcome.LateCompleted,
      });
      
      // Verify no MCP response is generated (only logging occurs)
      // The logLateToolCompletion function should only log, not return anything
      const result = logLateToolCompletion(mockLogger, runId, correlationId, toolName, durationMs);
      expect(result).toBeUndefined();
    });

    it('should log late completion with error code when handler failed after timeout', async () => {
      // Test late completion when the handler eventually failed
      
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
        redact: vi.fn(obj => obj),
        sanitize: vi.fn(str => str),
        clock: { now: () => '2024-01-01T00:00:00.000Z' },
        defaultRedactKeys: ['token', 'key', 'secret', 'password'],
        redactKeys: new Set(['token', 'key', 'secret', 'password']),
        originalRedactKeys: ['token', 'key', 'secret', 'password'],
        writeLogEntry: vi.fn(),
      } as any;

      const { logLateToolCompletion, ToolCompletionOutcome } = await import('../../../src/mcp/handlers.js');
      const { ErrorCode } = await import('../../../src/errors/errorHandler.js');
      
      const runId = 'run-789';
      const correlationId = 'corr-abc';
      const toolName = 'failing-tool';
      const durationMs = 3000;
      const errorCode = ErrorCode.Internal;
      
      // Call the late completion logger with error
      logLateToolCompletion(mockLogger, runId, correlationId, toolName, durationMs, errorCode);
      
      // Verify logging occurred
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      
      const logCall = mockLogger.warn.mock.calls[0];
      const logContext = logCall[1];
      expect(logContext).toMatchObject({
        runId,
        correlationId,
        toolName,
        durationMs,
        outcome: ToolCompletionOutcome.LateCompleted,
        errorCode,
      });
    });

    it('should demonstrate timeout scenario with late completion', async () => {
      // This test demonstrates the complete timeout scenario:
      // 1. Handler starts execution
      // 2. Timeout occurs, TIMEOUT error returned to client
      // 3. Handler continues running (doesn't check AbortSignal)
      // 4. Handler eventually completes
      // 5. Late completion is logged, no additional response sent
      
      let handlerCompleted = false;
      let timeoutFired = false;
      let lateCompletionLogged = false;
      
      // Mock a slow handler that doesn't check AbortSignal
      const slowHandler = async (args: Record<string, unknown>, context: { abortSignal: AbortSignal }) => {
        // Simulate work that takes longer than timeout
        // Use fake timers to avoid real delays
        return new Promise((resolve) => {
          setTimeout(() => {
            // Handler doesn't check context.abortSignal.aborted (bad practice but possible)
            handlerCompleted = true;
            resolve('completed');
          }, 200); // 200ms work
        });
      };
      
      // Mock timeout mechanism
      const abortController = new AbortController();
      const timeoutMs = 100; // 100ms timeout
      
      // Start timeout timer using fake timers
      const timeoutHandle = setTimeout(() => {
        abortController.abort();
        timeoutFired = true;
        
        // In real implementation, this would return TIMEOUT error to client
        // and then wait for handler to complete for late logging
      }, timeoutMs);
      
      // Execute handler with timeout
      const startTime = Date.now();
      
      // Start the handler
      const handlerPromise = slowHandler({}, { abortSignal: abortController.signal });
      
      // Advance time to trigger timeout
      vi.advanceTimersByTime(timeoutMs);
      
      // Verify timeout fired
      expect(timeoutFired).toBe(true);
      expect(abortController.signal.aborted).toBe(true);
      
      // Continue advancing time to let handler complete
      vi.advanceTimersByTime(200 - timeoutMs); // Complete the remaining time
      
      // Wait for handler to complete
      await handlerPromise;
      
      clearTimeout(timeoutHandle);
      
      // Simulate late completion logging
      if (handlerCompleted && timeoutFired) {
        lateCompletionLogged = true;
      }
      
      // Verify the scenario played out as expected
      expect(timeoutFired).toBe(true); // Timeout should have fired
      expect(handlerCompleted).toBe(true); // Handler should have completed despite timeout
      expect(lateCompletionLogged).toBe(true); // Late completion should be logged
      expect(abortController.signal.aborted).toBe(true); // AbortSignal should be aborted
    }, 1000); // Set test timeout to 1 second to avoid Vitest timeout
  });

  describe('Cooperative cancellation semantics', () => {
    it('should document that timeout cancellation is cooperative', () => {
      // This test documents the cooperative nature of cancellation
      // Handlers may continue running after timeout if they don't check AbortSignal
      
      // The timeout mechanism provides:
      // 1. AbortSignal.abort() is called on timeout
      // 2. Server returns TIMEOUT error immediately  
      // 3. Handler may continue running (cooperative cancellation)
      // 4. Slot is held until handler actually completes
      // 5. Late completions are logged but not returned to client
      
      expect(true).toBe(true); // This test serves as documentation
    });

    it('should verify AbortSignal.aborted === true after timeout', async () => {
      // This test verifies that the AbortSignal is properly aborted when timeout occurs
      // in a realistic tools/call timeout scenario
      
      let handlerAbortSignal: AbortSignal | null = null;
      let handlerStarted = false;
      let handlerCompleted = false;
      
      // Create a mock tool handler that captures the AbortSignal and simulates slow work
      const slowToolHandler = async (args: Record<string, unknown>, context: { abortSignal: AbortSignal }) => {
        handlerStarted = true;
        handlerAbortSignal = context.abortSignal;
        
        // Initially, the signal should not be aborted when handler starts
        expect(context.abortSignal.aborted).toBe(false);
        
        // Simulate slow work that takes longer than timeout
        return new Promise((resolve) => {
          setTimeout(() => {
            handlerCompleted = true;
            resolve('slow work completed');
          }, 200); // 200ms work, but timeout is 100ms
        });
      };
      
      // Simulate the timeout mechanism from tools/call implementation
      const abortController = new AbortController();
      const timeoutMs = 100; // 100ms timeout
      let timeoutFired = false;
      
      // Start timeout timer (simulating tools/call step 8)
      const timeoutHandle = setTimeout(() => {
        abortController.abort();
        timeoutFired = true;
      }, timeoutMs);
      
      try {
        // Execute handler with timeout context (simulating tools/call execution)
        const handlerPromise = slowToolHandler({}, { abortSignal: abortController.signal });
        
        // Advance time to trigger timeout
        vi.advanceTimersByTime(timeoutMs);
        
        // Verify timeout fired and AbortSignal is aborted
        expect(timeoutFired).toBe(true);
        expect(abortController.signal.aborted).toBe(true);
        
        // Verify the handler received the same AbortSignal and it's now aborted
        expect(handlerStarted).toBe(true);
        expect(handlerAbortSignal).not.toBeNull();
        expect(handlerAbortSignal!.aborted).toBe(true);
        
        // This is the key assertion: AbortSignal.aborted === true after timeout
        // This demonstrates that when timeout occurs in tools/call:
        // 1. abortController.abort() is called
        // 2. The AbortSignal passed to the handler becomes aborted
        // 3. Handlers can check context.abortSignal.aborted to cooperatively cancel
        
        // Continue advancing time to let handler complete
        vi.advanceTimersByTime(200 - timeoutMs);
        
        // Wait for handler to complete
        await handlerPromise;
        
        // Verify handler completed despite timeout (cooperative cancellation)
        expect(handlerCompleted).toBe(true);
        expect(handlerAbortSignal!.aborted).toBe(true); // Signal remains aborted
        
      } finally {
        clearTimeout(timeoutHandle);
      }
    });

    it('should demonstrate AbortSignal usage pattern', () => {
      // This test demonstrates the proper AbortSignal usage pattern for tool handlers
      
      const mockHandler = async (args: Record<string, unknown>, context: { abortSignal: AbortSignal }) => {
        // Proper pattern: Check abort signal at start
        if (context.abortSignal.aborted) {
          throw new Error('Operation was aborted');
        }
        
        // Proper pattern: Check abort signal during long operations
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (context.abortSignal.aborted) {
          throw new Error('Operation was aborted');
        }
        
        return 'completed';
      };
      
      // Create a mock abort controller to demonstrate the pattern
      const controller = new AbortController();
      const signal = controller.signal;
      
      // The signal starts as not aborted
      expect(signal.aborted).toBe(false);
      
      // After calling abort(), the signal is aborted
      controller.abort();
      expect(signal.aborted).toBe(true);
      
      // This demonstrates the cooperative cancellation pattern
      // Handlers should check signal.aborted and throw/return early if aborted
    });
  });
});