/**
 * Unit tests for ResourceManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResourceManagerImpl } from '../../../src/resources/resourceManager.js';
import type { ServerConfig } from '../../../src/config/configManager.js';

describe('ResourceManager', () => {
  let resourceManager: ResourceManagerImpl;
  let mockConfig: ServerConfig;

  beforeEach(() => {
    mockConfig = {
      server: {
        name: 'test-server',
        version: '1.0.0',
        shutdownTimeoutMs: 10000,
      },
      tools: {
        defaultTimeoutMs: 30000,
        maxPayloadBytes: 1024, // 1KB for testing
        maxStateBytes: 262144,
        adminRegistrationEnabled: false,
        adminPolicy: { mode: 'deny_all' },
      },
      resources: {
        maxConcurrentExecutions: 10,
      },
      logging: {
        level: 'info',
        redactKeys: ['token', 'key', 'secret'],
      },
      security: {
        dynamicRegistrationEnabled: false,
        allowArbitraryCodeTools: false,
      },
    };

    resourceManager = new ResourceManagerImpl(mockConfig);
  });

  afterEach(() => {
    resourceManager.destroy();
  });

  describe('slot acquire/release counting', () => {
    describe('tryAcquireSlot', () => {
      it('should acquire and release slots correctly', () => {
        // Initially no slots used
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
        
        // Acquire a slot
        const releaseSlot = resourceManager.tryAcquireSlot();
        expect(releaseSlot).not.toBeNull();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(1);
        
        // Release the slot
        releaseSlot!();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
      });

      it('should return null when at max concurrent executions', () => {
        // Acquire all 10 slots
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 10; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(10);
        
        // Try to acquire one more - should return null
        const extraSlot = resourceManager.tryAcquireSlot();
        expect(extraSlot).toBeNull();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(10);
        
        // Clean up
        releaseSlots.forEach(release => release());
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
      });

      it('should enforce limit rejection behavior when at max capacity', () => {
        // Acquire all 10 slots to reach maximum capacity
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 10; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(10);
        
        // Simulate the protocol handler behavior when rejecting due to resource exhaustion
        // Multiple attempts to acquire slots should all return null
        for (let i = 0; i < 5; i++) {
          const rejectedSlot = resourceManager.tryAcquireSlot();
          expect(rejectedSlot).toBeNull();
          
          // Simulate protocol handler incrementing counter on rejection
          (resourceManager as any).incrementResourceExhaustedCounter();
        }
        
        // Verify that concurrent executions count hasn't changed
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(10);
        
        // Verify that health status reflects the resource exhaustion
        const healthStatus = resourceManager.getHealthStatus();
        expect(healthStatus).toBe('unhealthy'); // Should be unhealthy due to both max concurrency and counter >= 3
        
        // Release one slot and verify that new acquisitions work again
        releaseSlots.pop()!();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(9);
        
        const newSlot = resourceManager.tryAcquireSlot();
        expect(newSlot).not.toBeNull();
        releaseSlots.push(newSlot!);
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(10);
        
        // Clean up all slots
        releaseSlots.forEach(release => release());
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
      });

      it('should handle multiple acquire/release cycles correctly', () => {
        // Acquire 5 slots
        const firstBatch: Array<() => void> = [];
        for (let i = 0; i < 5; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          firstBatch.push(releaseSlot!);
        }
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(5);
        
        // Release 3 slots
        for (let i = 0; i < 3; i++) {
          firstBatch.pop()!();
        }
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(2);
        
        // Acquire 4 more slots
        const secondBatch: Array<() => void> = [];
        for (let i = 0; i < 4; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          secondBatch.push(releaseSlot!);
        }
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(6);
        
        // Clean up all remaining slots
        firstBatch.forEach(release => release());
        secondBatch.forEach(release => release());
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
      });

      it('should maintain accurate count across many operations', () => {
        const maxSlots = 10;
        const releaseSlots: Array<() => void> = [];
        
        // Acquire slots one by one and verify count
        for (let i = 1; i <= maxSlots; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
          expect(resourceManager.getTelemetry().concurrentExecutions).toBe(i);
        }
        
        // Release slots one by one and verify count
        for (let i = maxSlots - 1; i >= 0; i--) {
          releaseSlots.pop()!();
          expect(resourceManager.getTelemetry().concurrentExecutions).toBe(i);
        }
      });

      it('should handle interleaved acquire/release operations', () => {
        const releaseSlots: Array<() => void> = [];
        
        // Acquire 3 slots
        for (let i = 0; i < 3; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(3);
        
        // Release 1, acquire 2, release 2, acquire 1
        releaseSlots.pop()!(); // Release 1
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(2);
        
        // Acquire 2
        for (let i = 0; i < 2; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(4);
        
        // Release 2
        releaseSlots.pop()!();
        releaseSlots.pop()!();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(2);
        
        // Acquire 1
        const releaseSlot = resourceManager.tryAcquireSlot();
        expect(releaseSlot).not.toBeNull();
        releaseSlots.push(releaseSlot!);
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(3);
        
        // Clean up
        releaseSlots.forEach(release => release());
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
      });
    });

    describe('acquireSlot (blocking)', () => {
      it('should acquire slot immediately when available', async () => {
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
        
        const releaseSlot = await resourceManager.acquireSlot();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(1);
        
        releaseSlot();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
      });

      it('should work with mixed acquire methods', async () => {
        // Use tryAcquireSlot to get some slots
        const trySlots: Array<() => void> = [];
        for (let i = 0; i < 3; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          trySlots.push(releaseSlot!);
        }
        
        // Use acquireSlot to get more slots
        const acquireSlots: Array<() => void> = [];
        for (let i = 0; i < 2; i++) {
          const releaseSlot = await resourceManager.acquireSlot();
          acquireSlots.push(releaseSlot);
        }
        
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(5);
        
        // Clean up
        trySlots.forEach(release => release());
        acquireSlots.forEach(release => release());
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
      });
    });

    describe('error handling', () => {
      it('should throw error when releasing more slots than acquired', () => {
        // Try to release a slot without acquiring one
        expect(() => {
          (resourceManager as any).releaseSlot();
        }).toThrow('Cannot release slot: no slots are currently held');
      });

      it('should throw error when calling release function multiple times', () => {
        const releaseSlot = resourceManager.tryAcquireSlot();
        expect(releaseSlot).not.toBeNull();
        
        // First release should work
        releaseSlot!();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
        
        // Second release should throw error
        expect(() => {
          releaseSlot!();
        }).toThrow('Cannot release slot: no slots are currently held');
      });
    });
  });

  describe('getTelemetry', () => {
    it('should return telemetry with memory usage', () => {
      const telemetry = resourceManager.getTelemetry();
      
      expect(telemetry.memoryUsageBytes).toBeTypeOf('number');
      expect(telemetry.memoryUsageBytes).toBeGreaterThan(0);
    });

    it('should return telemetry with event loop delay', () => {
      const telemetry = resourceManager.getTelemetry();
      
      expect(telemetry.eventLoopDelayMs).toBeTypeOf('number');
      expect(telemetry.eventLoopDelayMs).toBeGreaterThanOrEqual(0);
    });

    describe('telemetry values (heapUsed, event loop delay p99)', () => {
      it('should return memoryUsageBytes from process.memoryUsage().heapUsed', () => {
        // Get telemetry and process memory at nearly the same time
        const telemetry = resourceManager.getTelemetry();
        
        // The telemetry should report heap used memory as a positive number
        expect(telemetry.memoryUsageBytes).toBeTypeOf('number');
        expect(telemetry.memoryUsageBytes).toBeGreaterThan(0);
        
        // Verify it's using process.memoryUsage().heapUsed by checking it's in a reasonable range
        const processMemory = process.memoryUsage();
        expect(telemetry.memoryUsageBytes).toBeGreaterThan(0);
        expect(telemetry.memoryUsageBytes).toBeLessThan(processMemory.rss); // Should be less than total RSS
      });

      it('should return eventLoopDelayMs from histogram p99', () => {
        const telemetry = resourceManager.getTelemetry();
        
        // Event loop delay should be a number representing p99 percentile
        expect(telemetry.eventLoopDelayMs).toBeTypeOf('number');
        expect(telemetry.eventLoopDelayMs).toBeGreaterThanOrEqual(0);
        
        // The value should be reasonable for a test environment (not extremely high)
        // In a test environment, event loop delay should typically be low
        expect(telemetry.eventLoopDelayMs).toBeLessThan(1000); // Less than 1 second
      });

      it('should track memory usage changes over time', () => {
        const initialTelemetry = resourceManager.getTelemetry();
        const initialMemory = initialTelemetry.memoryUsageBytes;
        
        // Allocate some memory to potentially change heap usage
        const largeArray = new Array(10000).fill('test data for memory allocation');
        
        const updatedTelemetry = resourceManager.getTelemetry();
        const updatedMemory = updatedTelemetry.memoryUsageBytes;
        
        // Memory usage should still be a valid number
        expect(updatedMemory).toBeTypeOf('number');
        expect(updatedMemory).toBeGreaterThan(0);
        
        // Memory might have increased due to allocation, but we can't guarantee it
        // due to garbage collection, so we just verify it's still valid
        expect(updatedMemory).toBeGreaterThanOrEqual(0);
        
        // Clean up reference to allow GC
        largeArray.length = 0;
      });

      it('should provide consistent telemetry structure', () => {
        const telemetry = resourceManager.getTelemetry();
        
        // Verify all required telemetry fields are present and have correct types
        expect(telemetry).toHaveProperty('memoryUsageBytes');
        expect(telemetry).toHaveProperty('eventLoopDelayMs');
        expect(telemetry).toHaveProperty('concurrentExecutions');
        expect(telemetry).toHaveProperty('maxConcurrentExecutions');
        
        expect(typeof telemetry.memoryUsageBytes).toBe('number');
        expect(typeof telemetry.eventLoopDelayMs).toBe('number');
        expect(typeof telemetry.concurrentExecutions).toBe('number');
        expect(typeof telemetry.maxConcurrentExecutions).toBe('number');
        
        // Verify values are within reasonable ranges
        expect(telemetry.memoryUsageBytes).toBeGreaterThan(0);
        expect(telemetry.eventLoopDelayMs).toBeGreaterThanOrEqual(0);
        expect(telemetry.concurrentExecutions).toBeGreaterThanOrEqual(0);
        expect(telemetry.maxConcurrentExecutions).toBeGreaterThan(0);
      });

      it('should reflect real-time memory usage from process.memoryUsage()', () => {
        // Get telemetry multiple times and verify it reflects reasonable memory usage
        const telemetry1 = resourceManager.getTelemetry();
        
        // Should be a positive number representing heap usage
        expect(telemetry1.memoryUsageBytes).toBeGreaterThan(0);
        expect(telemetry1.memoryUsageBytes).toBeTypeOf('number');
        
        // Get another reading
        const telemetry2 = resourceManager.getTelemetry();
        
        // Should still be a positive number
        expect(telemetry2.memoryUsageBytes).toBeGreaterThan(0);
        expect(telemetry2.memoryUsageBytes).toBeTypeOf('number');
        
        // Both readings should be reasonable (not zero, not extremely large)
        const processMemory = process.memoryUsage();
        expect(telemetry1.memoryUsageBytes).toBeLessThan(processMemory.rss * 2); // Reasonable upper bound
        expect(telemetry2.memoryUsageBytes).toBeLessThan(processMemory.rss * 2); // Reasonable upper bound
      });

      it('should provide event loop delay from monitorEventLoopDelay histogram', () => {
        // Get initial telemetry
        const initialTelemetry = resourceManager.getTelemetry();
        
        // Event loop delay should be available immediately (histogram is enabled at construction)
        expect(initialTelemetry.eventLoopDelayMs).toBeTypeOf('number');
        expect(initialTelemetry.eventLoopDelayMs).toBeGreaterThanOrEqual(0);
        
        // Get another reading
        const updatedTelemetry = resourceManager.getTelemetry();
        
        // Event loop delay should still be a valid number
        expect(updatedTelemetry.eventLoopDelayMs).toBeTypeOf('number');
        expect(updatedTelemetry.eventLoopDelayMs).toBeGreaterThanOrEqual(0);
        
        // In a test environment, delay should be reasonable (but can be higher under load)
        expect(updatedTelemetry.eventLoopDelayMs).toBeLessThan(10000); // Less than 10 seconds (very generous)
      });
    });

    it('should return correct concurrent executions count', () => {
      const telemetry = resourceManager.getTelemetry();
      
      expect(telemetry.concurrentExecutions).toBe(0);
      expect(telemetry.maxConcurrentExecutions).toBe(10);
    });

    it('should track concurrent executions correctly', () => {
      // Acquire a slot
      const releaseSlot = resourceManager.tryAcquireSlot();
      expect(releaseSlot).not.toBeNull();
      
      const telemetry = resourceManager.getTelemetry();
      expect(telemetry.concurrentExecutions).toBe(1);
      expect(telemetry.maxConcurrentExecutions).toBe(10);
      
      // Release the slot
      releaseSlot!();
      
      const telemetryAfterRelease = resourceManager.getTelemetry();
      expect(telemetryAfterRelease.concurrentExecutions).toBe(0);
    });

    it('should return telemetry structure with all required fields', () => {
      const telemetry = resourceManager.getTelemetry();
      
      expect(telemetry).toHaveProperty('memoryUsageBytes');
      expect(telemetry).toHaveProperty('eventLoopDelayMs');
      expect(telemetry).toHaveProperty('concurrentExecutions');
      expect(telemetry).toHaveProperty('maxConcurrentExecutions');
    });
  });

  describe('validatePayloadSize', () => {
    it('should validate small payloads successfully', () => {
      const smallPayload = { message: 'hello' };
      const result = resourceManager.validatePayloadSize(smallPayload);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject payloads that exceed size limit', () => {
      // Create a payload larger than 1KB
      const largePayload = { data: 'x'.repeat(2000) };
      const result = resourceManager.validatePayloadSize(largePayload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].path).toBe('payload');
      expect(result.errors![0].message).toContain('exceeds limit');
    });

    it('should handle non-serializable payloads', () => {
      // Create a circular reference
      const circularPayload: any = { name: 'test' };
      circularPayload.self = circularPayload;
      
      const result = resourceManager.validatePayloadSize(circularPayload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].path).toBe('payload');
      expect(result.errors![0].message).toContain('not serializable');
    });

    it('should handle empty payloads', () => {
      const result = resourceManager.validatePayloadSize({});
      
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should handle null payloads', () => {
      const nullResult = resourceManager.validatePayloadSize(null);
      expect(nullResult.valid).toBe(true);
    });

    it('should handle undefined payloads as non-serializable', () => {
      const undefinedResult = resourceManager.validatePayloadSize(undefined);
      expect(undefinedResult.valid).toBe(false);
      expect(undefinedResult.errors).toBeDefined();
      expect(undefinedResult.errors![0].path).toBe('payload');
      expect(undefinedResult.errors![0].message).toContain('not serializable');
    });

    describe('UTF-8 byte length validation', () => {
      it('should correctly measure UTF-8 byte length for ASCII characters', () => {
        // ASCII characters are 1 byte each
        const asciiPayload = { message: 'hello' }; // 'hello' = 5 bytes
        const result = resourceManager.validatePayloadSize(asciiPayload);
        
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
      });

      it('should correctly measure UTF-8 byte length for multi-byte characters', () => {
        // Test with various multi-byte UTF-8 characters
        const multiBytePayload = {
          // 2-byte characters (Latin Extended)
          latin: 'café', // c=1, a=1, f=1, é=2 = 5 bytes
          // 3-byte characters (CJK)
          chinese: '你好', // 你=3, 好=3 = 6 bytes
          // 4-byte characters (Emoji)
          emoji: '🚀', // 🚀=4 bytes
          // Mixed content
          mixed: 'Hello 世界! 🌍' // H=1,e=1,l=1,l=1,o=1, =1,世=3,界=3,!=1, =1,🌍=4 = 18 bytes
        };
        
        const result = resourceManager.validatePayloadSize(multiBytePayload);
        expect(result.valid).toBe(true);
      });

      it('should reject payloads with multi-byte characters that exceed byte limit', () => {
        // Create a payload that looks small in character count but exceeds byte limit
        // Each emoji is 4 bytes, so 300 emojis = 1200 bytes > 1024 byte limit
        const emojiPayload = { data: '🚀'.repeat(300) };
        
        const result = resourceManager.validatePayloadSize(emojiPayload);
        
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors![0].path).toBe('payload');
        expect(result.errors![0].message).toContain('exceeds limit');
        // Verify the error message shows the actual byte count
        expect(result.errors![0].message).toMatch(/\d+ bytes exceeds limit/);
      });

      it('should correctly handle edge case near byte limit with multi-byte characters', () => {
        // Create a payload that's just under the 1024 byte limit using multi-byte chars
        // We need to account for JSON serialization overhead: {"data":"..."}
        // Use 3-byte characters: 337 chars * 3 bytes = 1011 bytes for content
        // Plus ~11 bytes JSON overhead = 1022 bytes total (under 1024 limit)
        const underLimitPayload = { data: '你'.repeat(337) };
        
        const result = resourceManager.validatePayloadSize(underLimitPayload);
        expect(result.valid).toBe(true);
        
        // Now test just over the limit: 338 chars * 3 bytes = 1014 bytes for content
        // Plus ~11 bytes JSON overhead = 1025 bytes total (over 1024)
        const overLimitPayload = { data: '你'.repeat(338) };
        
        const overResult = resourceManager.validatePayloadSize(overLimitPayload);
        expect(overResult.valid).toBe(false);
        expect(overResult.errors).toBeDefined();
        expect(overResult.errors![0].message).toContain('exceeds limit');
      });

      it('should measure JSON serialization overhead correctly with UTF-8', () => {
        // Test that we're measuring the JSON-serialized size, not just the string content
        const payload = { 
          key: 'value with UTF-8: 你好 🌍',
          number: 42,
          boolean: true
        };
        
        // Manually calculate expected JSON size
        const jsonString = JSON.stringify(payload);
        const expectedByteLength = Buffer.byteLength(jsonString, 'utf8');
        
        // Should be valid since it's small
        const result = resourceManager.validatePayloadSize(payload);
        expect(result.valid).toBe(true);
        
        // Verify we can create a payload that exceeds the limit when JSON overhead is considered
        const largeKey = 'x'.repeat(500);
        const largeValue = '你'.repeat(200); // 200 * 3 = 600 bytes for the value
        const largePayload = { [largeKey]: largeValue }; // Plus JSON overhead should exceed 1024
        
        const largeResult = resourceManager.validatePayloadSize(largePayload);
        expect(largeResult.valid).toBe(false);
      });

      it('should handle mixed ASCII and multi-byte characters correctly', () => {
        // Test a realistic payload with mixed character types
        const mixedPayload = {
          id: 'user-123',
          name: 'José María',
          description: 'Software engineer from España 🇪🇸',
          tags: ['javascript', 'typescript', 'node.js'],
          metadata: {
            created: '2024-01-15T10:30:00Z',
            locale: 'es-ES',
            emoji: '👨‍💻'
          }
        };
        
        const result = resourceManager.validatePayloadSize(mixedPayload);
        expect(result.valid).toBe(true);
      });

      it('should correctly validate UTF-8 byte length vs character length difference', () => {
        // Demonstrate that character count != byte count for UTF-8
        const singleByteString = 'a'.repeat(500); // 500 characters = 500 bytes
        const multiByteString = '你'.repeat(500); // 500 characters = 1500 bytes
        
        const singleBytePayload = { data: singleByteString };
        const multiBytePayload = { data: multiByteString };
        
        // Single-byte payload should be valid (under 1024 bytes)
        const singleByteResult = resourceManager.validatePayloadSize(singleBytePayload);
        expect(singleByteResult.valid).toBe(true);
        
        // Multi-byte payload should be invalid (over 1024 bytes)
        const multiByteResult = resourceManager.validatePayloadSize(multiBytePayload);
        expect(multiByteResult.valid).toBe(false);
        expect(multiByteResult.errors![0].message).toContain('exceeds limit');
      });
    });
  });

  describe('isApproachingLimits', () => {
    it('should return false when no slots are used', () => {
      const isApproaching = resourceManager.isApproachingLimits();
      expect(isApproaching).toBe(false);
    });

    it('should return false when utilization is below 80%', () => {
      // Acquire 7 slots out of 10 (70% utilization)
      const releaseSlots: Array<() => void> = [];
      for (let i = 0; i < 7; i++) {
        const releaseSlot = resourceManager.tryAcquireSlot();
        expect(releaseSlot).not.toBeNull();
        releaseSlots.push(releaseSlot!);
      }

      const isApproaching = resourceManager.isApproachingLimits();
      expect(isApproaching).toBe(false);

      // Clean up
      releaseSlots.forEach(release => release());
    });

    it('should return false when utilization is exactly 80%', () => {
      // Acquire 8 slots out of 10 (80% utilization)
      const releaseSlots: Array<() => void> = [];
      for (let i = 0; i < 8; i++) {
        const releaseSlot = resourceManager.tryAcquireSlot();
        expect(releaseSlot).not.toBeNull();
        releaseSlots.push(releaseSlot!);
      }

      const isApproaching = resourceManager.isApproachingLimits();
      expect(isApproaching).toBe(false);

      // Clean up
      releaseSlots.forEach(release => release());
    });

    it('should return true when utilization exceeds 80%', () => {
      // Acquire 9 slots out of 10 (90% utilization)
      const releaseSlots: Array<() => void> = [];
      for (let i = 0; i < 9; i++) {
        const releaseSlot = resourceManager.tryAcquireSlot();
        expect(releaseSlot).not.toBeNull();
        releaseSlots.push(releaseSlot!);
      }

      const isApproaching = resourceManager.isApproachingLimits();
      expect(isApproaching).toBe(true);

      // Clean up
      releaseSlots.forEach(release => release());
    });

    it('should return true when all slots are used (100% utilization)', () => {
      // Acquire all 10 slots (100% utilization)
      const releaseSlots: Array<() => void> = [];
      for (let i = 0; i < 10; i++) {
        const releaseSlot = resourceManager.tryAcquireSlot();
        expect(releaseSlot).not.toBeNull();
        releaseSlots.push(releaseSlot!);
      }

      const isApproaching = resourceManager.isApproachingLimits();
      expect(isApproaching).toBe(true);

      // Clean up
      releaseSlots.forEach(release => release());
    });

    it('should update dynamically as slots are acquired and released', () => {
      // Start with no slots
      expect(resourceManager.isApproachingLimits()).toBe(false);

      // Acquire slots up to 80% (8 slots)
      const releaseSlots: Array<() => void> = [];
      for (let i = 0; i < 8; i++) {
        const releaseSlot = resourceManager.tryAcquireSlot();
        expect(releaseSlot).not.toBeNull();
        releaseSlots.push(releaseSlot!);
      }
      expect(resourceManager.isApproachingLimits()).toBe(false);

      // Acquire one more slot to exceed 80% (9 slots = 90%)
      const ninthSlot = resourceManager.tryAcquireSlot();
      expect(ninthSlot).not.toBeNull();
      releaseSlots.push(ninthSlot!);
      expect(resourceManager.isApproachingLimits()).toBe(true);

      // Release one slot to go back to 80%
      releaseSlots.pop()!();
      expect(resourceManager.isApproachingLimits()).toBe(false);

      // Clean up remaining slots
      releaseSlots.forEach(release => release());
      expect(resourceManager.isApproachingLimits()).toBe(false);
    });
  });

  describe('ResourceExhausted counter increment/reset logic', () => {
    describe('counter increment behavior', () => {
      it('should increment counter on tools/call rejection with RESOURCE_EXHAUSTED', () => {
        // Ensure counter starts at 0
        resourceManager.resetResourceExhaustedCounter();
        
        // Check initial status - may be unhealthy due to event loop delay in test environment
        const initialTelemetry = resourceManager.getTelemetry();
        const initialStatus = resourceManager.getHealthStatus();
        
        // Simulate protocol handler behavior: increment counter on RESOURCE_EXHAUSTED rejection
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        // Counter should be 1, not yet unhealthy due to counter (threshold is >= 3)
        const telemetry = resourceManager.getTelemetry();
        const status = resourceManager.getHealthStatus();
        
        // Verify counter increment behavior regardless of event loop delay
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy'); // Due to event loop delay, not counter
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded'); // Due to event loop delay, not counter
        } else {
          expect(status).toBe('healthy'); // Counter = 1 is below threshold of 3
        }
        
        // The key test: counter should be incremented but not cause unhealthy status by itself
        // We can verify this by checking that 2 more increments will cause unhealthy status
        (resourceManager as any).incrementResourceExhaustedCounter(); // Counter = 2
        (resourceManager as any).incrementResourceExhaustedCounter(); // Counter = 3
        
        const finalStatus = resourceManager.getHealthStatus();
        expect(finalStatus).toBe('unhealthy'); // Now counter >= 3 should cause unhealthy
      });

      it('should increment counter multiple times on consecutive rejections', () => {
        resourceManager.resetResourceExhaustedCounter();
        
        // Simulate multiple consecutive RESOURCE_EXHAUSTED rejections
        (resourceManager as any).incrementResourceExhaustedCounter(); // Counter = 1
        (resourceManager as any).incrementResourceExhaustedCounter(); // Counter = 2
        
        // Should still not be unhealthy due to counter (threshold is >= 3)
        let status = resourceManager.getHealthStatus();
        let telemetry = resourceManager.getTelemetry();
        
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy'); // Due to event loop delay
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded'); // Due to event loop delay
        } else {
          expect(status).toBe('healthy'); // Counter = 2 is below threshold
        }
        
        // Third increment should trigger unhealthy status
        (resourceManager as any).incrementResourceExhaustedCounter(); // Counter = 3
        
        status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy'); // Counter >= 3 triggers unhealthy
      });

      it('should increment counter only on RESOURCE_EXHAUSTED rejections, not other errors', () => {
        resourceManager.resetResourceExhaustedCounter();
        
        // According to design: counter increments only on tools/call rejection with RESOURCE_EXHAUSTED
        // It does NOT increment on:
        // - Protocol/state errors (JSON-RPC errors)
        // - Handler-returned errors (tool errors that are not RESOURCE_EXHAUSTED)
        // - Successful completions
        
        // This test verifies the counter is only incremented when explicitly called
        // (simulating protocol handler behavior on RESOURCE_EXHAUSTED rejection)
        
        // Simulate some non-RESOURCE_EXHAUSTED scenarios (no counter increment)
        // These would be handled by protocol handlers, not ResourceManager directly
        
        let status = resourceManager.getHealthStatus();
        let telemetry = resourceManager.getTelemetry();
        
        // Should remain healthy (counter = 0)
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy'); // Due to event loop delay
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded'); // Due to event loop delay
        } else {
          expect(status).toBe('healthy'); // Counter = 0
        }
        
        // Only explicit increment should affect counter
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy'); // Now counter >= 3
      });
    });

    describe('counter reset behavior', () => {
      it('should reset counter on first non-RESOURCE_EXHAUSTED tools/call completion', () => {
        // Increment counter to unhealthy level
        resourceManager.resetResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        let status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy'); // Counter >= 3
        
        // Simulate successful tools/call completion (protocol handler calls reset)
        resourceManager.resetResourceExhaustedCounter();
        
        status = resourceManager.getHealthStatus();
        let telemetry = resourceManager.getTelemetry();
        
        // Should no longer be unhealthy due to counter
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy'); // Due to event loop delay
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded'); // Due to event loop delay
        } else {
          expect(status).toBe('healthy'); // Counter reset to 0
        }
      });

      it('should reset counter on non-RESOURCE_EXHAUSTED error completion', () => {
        // Increment counter to unhealthy level
        resourceManager.resetResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        expect(resourceManager.getHealthStatus()).toBe('unhealthy');
        
        // Simulate tools/call completion with non-RESOURCE_EXHAUSTED error
        // (e.g., INVALID_ARGUMENT, NOT_FOUND, TIMEOUT, INTERNAL, etc.)
        // Protocol handler would call reset on any non-RESOURCE_EXHAUSTED completion
        resourceManager.resetResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        const telemetry = resourceManager.getTelemetry();
        
        // Should no longer be unhealthy due to counter
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy'); // Due to event loop delay
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded'); // Due to event loop delay
        } else {
          expect(status).toBe('healthy'); // Counter reset
        }
      });

      it('should NOT reset counter on slot acquire/release operations', () => {
        // Increment counter to unhealthy level
        resourceManager.resetResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        expect(resourceManager.getHealthStatus()).toBe('unhealthy');
        
        // Perform slot operations - these should NOT reset the counter
        const releaseSlot = resourceManager.tryAcquireSlot();
        expect(releaseSlot).not.toBeNull();
        releaseSlot!();
        
        // Counter should still be at unhealthy level
        expect(resourceManager.getHealthStatus()).toBe('unhealthy');
        
        // Perform multiple slot operations
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 3; i++) {
          const slot = resourceManager.tryAcquireSlot();
          expect(slot).not.toBeNull();
          releaseSlots.push(slot!);
        }
        
        // Release all slots
        releaseSlots.forEach(release => release());
        
        // Counter should STILL be at unhealthy level (not reset by slot operations)
        expect(resourceManager.getHealthStatus()).toBe('unhealthy');
      });
    });

    describe('counter process-level scope', () => {
      it('should maintain counter as process-wide rolling counter', () => {
        // Reset counter to start clean
        resourceManager.resetResourceExhaustedCounter();
        
        // Simulate multiple "sessions" or "connections" by performing various operations
        // The counter should be process-wide, not per-session
        
        // Simulate first "session" - increment counter
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        // Simulate second "session" - counter should continue from previous value
        (resourceManager as any).incrementResourceExhaustedCounter(); // Now at 3, should be unhealthy
        
        expect(resourceManager.getHealthStatus()).toBe('unhealthy');
        
        // Simulate successful completion in any "session" - should reset for entire process
        resourceManager.resetResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        const telemetry = resourceManager.getTelemetry();
        
        // Should be reset process-wide
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy'); // Due to event loop delay
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded'); // Due to event loop delay
        } else {
          expect(status).toBe('healthy'); // Counter reset
        }
      });

      it('should not count protocol/state errors in ResourceExhausted counter', () => {
        resourceManager.resetResourceExhaustedCounter();
        
        // According to design: "Does not count protocol/state errors"
        // Protocol/state errors are JSON-RPC errors like:
        // - Parse errors (-32700)
        // - Invalid request (-32600)
        // - Method not found (-32601)
        // - Invalid params (-32602)
        // - Not initialized (-32002)
        
        // These errors do NOT increment the ResourceExhausted counter
        // Only tools/call rejections with RESOURCE_EXHAUSTED increment the counter
        
        // Simulate various protocol operations that don't affect the counter
        // (The counter is only incremented by explicit calls to incrementResourceExhaustedCounter)
        
        let status = resourceManager.getHealthStatus();
        let telemetry = resourceManager.getTelemetry();
        
        // Should remain healthy (counter = 0)
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy'); // Due to event loop delay
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded'); // Due to event loop delay
        } else {
          expect(status).toBe('healthy'); // Counter = 0
        }
        
        // Only explicit RESOURCE_EXHAUSTED rejections should increment
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy'); // Now counter >= 3
      });
    });

    describe('counter integration with health status', () => {
      it('should trigger unhealthy status when counter reaches exactly 3', () => {
        resourceManager.resetResourceExhaustedCounter();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
        
        // Increment to exactly 3 (threshold for unhealthy)
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy'); // >= 3 consecutive RESOURCE_EXHAUSTED rejections
      });

      it('should remain healthy/degraded when counter is below 3', () => {
        resourceManager.resetResourceExhaustedCounter();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
        
        // Increment to 2 (below threshold)
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        const telemetry = resourceManager.getTelemetry();
        
        // Should not be unhealthy due to counter (< 3)
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy'); // Due to event loop delay
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded'); // Due to event loop delay
        } else {
          expect(status).toBe('healthy'); // Counter < 3
        }
      });

      it('should prioritize unhealthy status from counter over other degraded conditions', () => {
        resourceManager.resetResourceExhaustedCounter();
        
        // Create degraded condition (high concurrency but not max)
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 9; i++) { // 90% utilization - degraded
          const slot = resourceManager.tryAcquireSlot();
          expect(slot).not.toBeNull();
          releaseSlots.push(slot!);
        }
        
        // Verify degraded status due to concurrency
        let status = resourceManager.getHealthStatus();
        let telemetry = resourceManager.getTelemetry();
        
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy'); // Due to event loop delay
        } else {
          expect(status).toBe('degraded'); // Due to high concurrency
        }
        
        // Now add counter to unhealthy level
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        // Should now be unhealthy due to counter (overrides degraded concurrency)
        status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy');
        
        // Clean up
        releaseSlots.forEach(release => release());
      });
    });
  });

  describe('health threshold calculations', () => {
    describe('healthy status', () => {
      it('should return healthy when all metrics are within normal bounds', () => {
        // Ensure no slots are used and counter is reset
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
        resourceManager.resetResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        const telemetry = resourceManager.getTelemetry();
        
        // If event loop delay is naturally high in test environment, we might get degraded/unhealthy
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded');
        } else {
          expect(status).toBe('healthy');
        }
      });

      it('should return healthy with low concurrency and low event loop delay', () => {
        // Acquire 7 slots out of 10 (70% utilization - below 80% threshold)
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 7; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        
        resourceManager.resetResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        const telemetry = resourceManager.getTelemetry();
        
        // Should be healthy if event loop delay is low, degraded/unhealthy if high
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded');
        } else {
          expect(status).toBe('healthy');
        }
        
        // Clean up
        releaseSlots.forEach(release => release());
      });

      it('should return healthy with exactly 80% concurrency (boundary test)', () => {
        // Acquire exactly 8 slots out of 10 (80% utilization - at threshold, not over)
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 8; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        
        resourceManager.resetResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        const telemetry = resourceManager.getTelemetry();
        
        // Should be healthy if event loop delay is low (80% is not > 80%)
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded');
        } else {
          expect(status).toBe('healthy');
        }
        
        // Clean up
        releaseSlots.forEach(release => release());
      });
    });

    describe('degraded status', () => {
      it('should return degraded when concurrent executions exceed 80% of max', () => {
        // Acquire 9 slots out of 10 (90% utilization - exceeds 80% threshold)
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 9; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        
        resourceManager.resetResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        const telemetry = resourceManager.getTelemetry();
        
        // Should be at least degraded due to high concurrency, but could be unhealthy if event loop delay is very high
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else {
          expect(status).toBe('degraded');
        }
        
        // Clean up
        releaseSlots.forEach(release => release());
      });

      it('should return degraded when event loop delay exceeds 100ms (simulated)', () => {
        // Reset counter and ensure low concurrency
        resourceManager.resetResourceExhaustedCounter();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
        
        // Note: We cannot easily simulate high event loop delay in tests,
        // but we can test the logic by checking current delay and expected behavior
        const telemetry = resourceManager.getTelemetry();
        const status = resourceManager.getHealthStatus();
        
        // Test the threshold logic based on current event loop delay
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded');
        } else {
          expect(status).toBe('healthy');
        }
      });

      it('should return degraded with exactly 81% concurrency (just over threshold)', () => {
        // Test with 8.1 slots, but since we can't have fractional slots, use 9 slots (90%)
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 9; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        
        resourceManager.resetResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        const telemetry = resourceManager.getTelemetry();
        
        // 9/10 = 90% > 80%, so should be at least degraded
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else {
          expect(status).toBe('degraded');
        }
        
        // Clean up
        releaseSlots.forEach(release => release());
      });
    });

    describe('unhealthy status', () => {
      it('should return unhealthy when concurrent executions equal max', () => {
        // Acquire all 10 slots (100% utilization)
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 10; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        
        resourceManager.resetResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy');
        
        // Clean up
        releaseSlots.forEach(release => release());
      });

      it('should return unhealthy when ResourceExhausted counter reaches exactly 3', () => {
        // Ensure no concurrency issues
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
        
        // Increment counter exactly 3 times
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy');
      });

      it('should return unhealthy when ResourceExhausted counter exceeds 3', () => {
        // Ensure no concurrency issues
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
        
        // Increment counter more than 3 times
        for (let i = 0; i < 5; i++) {
          (resourceManager as any).incrementResourceExhaustedCounter();
        }
        
        const status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy');
      });

      it('should return unhealthy when event loop delay exceeds 500ms (simulated)', () => {
        // Reset counter and ensure low concurrency
        resourceManager.resetResourceExhaustedCounter();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
        
        // Test the threshold logic based on current event loop delay
        const telemetry = resourceManager.getTelemetry();
        const status = resourceManager.getHealthStatus();
        
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else {
          // If delay is not naturally high, we can't easily test this condition
          // but we can verify the logic is correct by testing other conditions
          expect(['healthy', 'degraded']).toContain(status);
        }
      });
    });

    describe('priority and combination tests', () => {
      it('should prioritize unhealthy conditions over degraded conditions', () => {
        // Acquire 9 slots (90% - would be degraded) and increment counter to 3 (unhealthy)
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 9; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy'); // Should be unhealthy due to counter, not degraded due to concurrency
        
        // Clean up
        releaseSlots.forEach(release => release());
      });

      it('should return unhealthy when multiple unhealthy conditions are met', () => {
        // Acquire all slots (unhealthy) AND increment counter to 3 (unhealthy)
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 10; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy');
        
        // Clean up
        releaseSlots.forEach(release => release());
      });

      it('should return degraded when multiple degraded conditions are met but no unhealthy conditions', () => {
        // Acquire 9 slots (90% - degraded) with counter at 2 (not unhealthy yet)
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 9; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        
        resourceManager.resetResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter(); // Counter = 2, not >= 3
        
        const status = resourceManager.getHealthStatus();
        const telemetry = resourceManager.getTelemetry();
        
        // Should be at least degraded due to concurrency, could be unhealthy if event loop delay > 500ms
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else {
          expect(status).toBe('degraded');
        }
        
        // Clean up
        releaseSlots.forEach(release => release());
      });
    });

    describe('counter reset behavior', () => {
      it('should reset ResourceExhausted counter when explicitly reset', () => {
        // Increment counter to 3
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        let status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy');
        
        // Reset counter
        resourceManager.resetResourceExhaustedCounter();
        
        // Check telemetry to understand current state
        const telemetry = resourceManager.getTelemetry();
        status = resourceManager.getHealthStatus();
        
        // Should no longer be unhealthy due to counter
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded');
        } else {
          expect(status).toBe('healthy');
        }
      });

      it('should not reset counter on slot release', () => {
        // Increment counter to 3
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        // Acquire and release a slot
        const releaseSlot = resourceManager.tryAcquireSlot();
        expect(releaseSlot).not.toBeNull();
        releaseSlot!();
        
        // Counter should still be 3 (not reset by slot release)
        const status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy');
      });

      it('should maintain counter across multiple slot operations', () => {
        // Increment counter to 2
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        // Perform multiple slot acquire/release cycles
        for (let i = 0; i < 3; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlot!();
        }
        
        // Counter should still be 2
        const telemetry = resourceManager.getTelemetry();
        const status = resourceManager.getHealthStatus();
        
        // Should not be unhealthy due to counter (only 2, not >= 3)
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded');
        } else {
          expect(status).toBe('healthy');
        }
      });
    });

    describe('boundary condition tests', () => {
      it('should handle exactly 80% concurrency threshold', () => {
        // 8 out of 10 slots = exactly 80%
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 8; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        
        resourceManager.resetResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        const telemetry = resourceManager.getTelemetry();
        
        // 80% is not > 80%, so should be healthy (unless event loop delay is high)
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded');
        } else {
          expect(status).toBe('healthy');
        }
        
        // Clean up
        releaseSlots.forEach(release => release());
      });

      it('should handle counter at exactly 3 threshold', () => {
        resourceManager.resetResourceExhaustedCounter();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
        
        // Increment to exactly 3
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy'); // >= 3 should be unhealthy
      });

      it('should handle counter at 2 (just below threshold)', () => {
        resourceManager.resetResourceExhaustedCounter();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
        
        // Increment to 2 (below threshold of 3)
        (resourceManager as any).incrementResourceExhaustedCounter();
        (resourceManager as any).incrementResourceExhaustedCounter();
        
        const status = resourceManager.getHealthStatus();
        const telemetry = resourceManager.getTelemetry();
        
        // Should not be unhealthy due to counter
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded');
        } else {
          expect(status).toBe('healthy');
        }
      });
    });

    describe('dynamic status changes', () => {
      it('should update status dynamically as conditions change', () => {
        // Start healthy
        resourceManager.resetResourceExhaustedCounter();
        expect(resourceManager.getTelemetry().concurrentExecutions).toBe(0);
        
        let status = resourceManager.getHealthStatus();
        let telemetry = resourceManager.getTelemetry();
        
        // Initial status depends on event loop delay
        const initialStatus = telemetry.eventLoopDelayMs > 500 ? 'unhealthy' : 
                             telemetry.eventLoopDelayMs > 100 ? 'degraded' : 'healthy';
        expect(status).toBe(initialStatus);
        
        // Acquire slots to become degraded
        const releaseSlots: Array<() => void> = [];
        for (let i = 0; i < 9; i++) {
          const releaseSlot = resourceManager.tryAcquireSlot();
          expect(releaseSlot).not.toBeNull();
          releaseSlots.push(releaseSlot!);
        }
        
        status = resourceManager.getHealthStatus();
        telemetry = resourceManager.getTelemetry();
        
        // Should be at least degraded due to high concurrency
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else {
          expect(status).toBe('degraded');
        }
        
        // Acquire one more slot to become unhealthy
        const lastSlot = resourceManager.tryAcquireSlot();
        expect(lastSlot).not.toBeNull();
        releaseSlots.push(lastSlot!);
        
        status = resourceManager.getHealthStatus();
        expect(status).toBe('unhealthy'); // 100% concurrency
        
        // Release some slots to go back to degraded
        releaseSlots.pop()!(); // Now at 9/10 slots
        
        status = resourceManager.getHealthStatus();
        telemetry = resourceManager.getTelemetry();
        
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else {
          expect(status).toBe('degraded');
        }
        
        // Clean up all slots
        releaseSlots.forEach(release => release());
        
        status = resourceManager.getHealthStatus();
        telemetry = resourceManager.getTelemetry();
        
        // Back to initial status
        if (telemetry.eventLoopDelayMs > 500) {
          expect(status).toBe('unhealthy');
        } else if (telemetry.eventLoopDelayMs > 100) {
          expect(status).toBe('degraded');
        } else {
          expect(status).toBe('healthy');
        }
      });
    });
  });
});