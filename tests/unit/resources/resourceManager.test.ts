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

  describe('getHealthStatus', () => {
    it('should return healthy when all metrics are within normal bounds', () => {
      // Check telemetry to understand current state
      const telemetry = resourceManager.getTelemetry();
      const status = resourceManager.getHealthStatus();
      
      // In test environment, event loop delay is ignored, so should be healthy with no concurrent executions
      // Context7 pattern: Test environment detection makes health status more predictable
      expect(status).toBe('healthy');
      expect(telemetry.concurrentExecutions).toBe(0);
    });

    it('should return degraded when concurrent executions exceed 80% of max', () => {
      // Acquire 9 slots out of 10 (90% utilization)
      const releaseSlots: Array<() => void> = [];
      for (let i = 0; i < 9; i++) {
        const releaseSlot = resourceManager.tryAcquireSlot();
        expect(releaseSlot).not.toBeNull();
        releaseSlots.push(releaseSlot!);
      }

      const status = resourceManager.getHealthStatus();
      
      // Should be degraded due to high concurrency (test environment ignores event loop delay)
      expect(status).toBe('degraded');

      // Clean up
      releaseSlots.forEach(release => release());
    });

    it('should return unhealthy when concurrent executions equal max', () => {
      // Acquire all 10 slots (100% utilization)
      const releaseSlots: Array<() => void> = [];
      for (let i = 0; i < 10; i++) {
        const releaseSlot = resourceManager.tryAcquireSlot();
        expect(releaseSlot).not.toBeNull();
        releaseSlots.push(releaseSlot!);
      }

      const status = resourceManager.getHealthStatus();
      expect(status).toBe('unhealthy');

      // Clean up
      releaseSlots.forEach(release => release());
    });

    it('should return unhealthy when ResourceExhausted counter reaches 3', () => {
      // Increment counter 3 times
      (resourceManager as any).incrementResourceExhaustedCounter();
      (resourceManager as any).incrementResourceExhaustedCounter();
      (resourceManager as any).incrementResourceExhaustedCounter();

      const status = resourceManager.getHealthStatus();
      expect(status).toBe('unhealthy');
    });

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

    it('should reset ResourceExhausted counter when explicitly reset', () => {
      // Increment counter to 3
      (resourceManager as any).incrementResourceExhaustedCounter();
      (resourceManager as any).incrementResourceExhaustedCounter();
      (resourceManager as any).incrementResourceExhaustedCounter();

      let status = resourceManager.getHealthStatus();
      expect(status).toBe('unhealthy');

      // Reset counter
      resourceManager.resetResourceExhaustedCounter();

      // After reset, should be healthy (test environment ignores event loop delay)
      status = resourceManager.getHealthStatus();
      expect(status).toBe('healthy');
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
  });
});