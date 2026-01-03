/**
 * Unit tests for the health tool implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { healthToolHandler, healthToolDefinition, type HealthResponse } from '../../../src/tools/healthTool.js';
import type { ServerConfig } from '../../../src/config/configManager.js';
import type { ResourceManager, ResourceTelemetry } from '../../../src/resources/resourceManager.js';
import type { StructuredLogger } from '../../../src/logging/structuredLogger.js';

describe('Health Tool', () => {
  let mockConfig: ServerConfig;
  let mockResourceManager: ResourceManager;
  let mockLogger: StructuredLogger;
  let mockAbortSignal: AbortSignal;

  beforeEach(() => {
    // Mock server config
    mockConfig = {
      server: {
        name: 'test-mcp-server',
        version: '1.0.0',
      },
      tools: {
        defaultTimeoutMs: 30000,
        maxPayloadBytes: 1048576,
        maxStateBytes: 524288,
        adminRegistrationEnabled: false,
      },
      resources: {
        maxConcurrentExecutions: 10,
      },
      security: {
        dynamicRegistrationEnabled: false,
      },
      logging: {
        redactKeys: ['token', 'key', 'secret'],
      },
    } as ServerConfig;

    // Mock resource telemetry
    const mockTelemetry: ResourceTelemetry = {
      memoryUsageBytes: 123456789,
      eventLoopDelayMs: 5.2,
      concurrentExecutions: 2,
      maxConcurrentExecutions: 10,
    };

    // Mock resource manager
    mockResourceManager = {
      getTelemetry: vi.fn().mockReturnValue(mockTelemetry),
      getHealthStatus: vi.fn().mockReturnValue('healthy'),
      acquireSlot: vi.fn(),
      tryAcquireSlot: vi.fn(),
      validatePayloadSize: vi.fn(),
      isApproachingLimits: vi.fn(),
      resetResourceExhaustedCounter: vi.fn(),
    };

    // Mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
      redact: vi.fn(),
      sanitize: vi.fn(),
    } as unknown as StructuredLogger;

    // Mock abort signal
    mockAbortSignal = {
      aborted: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onabort: null,
      reason: undefined,
      throwIfAborted: vi.fn(),
    };
  });

  describe('healthToolDefinition', () => {
    it('should have correct tool definition', () => {
      expect(healthToolDefinition.name).toBe('health');
      expect(healthToolDefinition.description).toContain('comprehensive health information');
      expect(healthToolDefinition.inputSchema.type).toBe('object');
      expect(healthToolDefinition.inputSchema.properties).toEqual({});
      expect(healthToolDefinition.inputSchema.additionalProperties).toBe(false);
      expect(healthToolDefinition.version).toBe('1.0.0');
    });
  });

  describe('healthToolHandler', () => {
    it('should return comprehensive health information', async () => {
      const context = {
        runId: 'test-run-id',
        correlationId: 'test-correlation-id',
        logger: mockLogger,
        abortSignal: mockAbortSignal,
      };

      const result = await healthToolHandler({}, context, mockConfig, mockResourceManager);

      expect(result).toEqual({
        server: {
          name: 'test-mcp-server',
          version: '1.0.0',
        },
        config: {
          toolTimeoutMs: 30000,
          maxConcurrentExecutions: 10,
          maxPayloadBytes: 1048576,
          maxStateBytes: 524288,
        },
        resources: {
          memoryUsageBytes: 123456789,
          eventLoopDelayMs: 5.2,
          concurrentExecutions: 2,
          maxConcurrentExecutions: 10,
        },
        status: 'healthy',
      });

      // Verify resource manager methods were called
      expect(mockResourceManager.getTelemetry).toHaveBeenCalledOnce();
      expect(mockResourceManager.getHealthStatus).toHaveBeenCalledOnce();

      // Verify logging
      expect(mockLogger.debug).toHaveBeenCalledWith('Executing health tool', {
        runId: 'test-run-id',
        correlationId: 'test-correlation-id',
      });
      expect(mockLogger.debug).toHaveBeenCalledWith('Health check completed successfully', {
        runId: 'test-run-id',
        correlationId: 'test-correlation-id',
        status: 'healthy',
        memoryUsageBytes: 123456789,
        concurrentExecutions: 2,
      });
    });

    it('should handle different health statuses', async () => {
      const context = {
        runId: 'test-run-id',
        correlationId: 'test-correlation-id',
        logger: mockLogger,
        abortSignal: mockAbortSignal,
      };

      // Test degraded status
      vi.mocked(mockResourceManager.getHealthStatus).mockReturnValue('degraded');
      
      const result = await healthToolHandler({}, context, mockConfig, mockResourceManager);
      expect(result.status).toBe('degraded');

      // Test unhealthy status
      vi.mocked(mockResourceManager.getHealthStatus).mockReturnValue('unhealthy');
      
      const result2 = await healthToolHandler({}, context, mockConfig, mockResourceManager);
      expect(result2.status).toBe('unhealthy');
    });

    it('should throw error when cancelled', async () => {
      const cancelledAbortSignal = {
        ...mockAbortSignal,
        aborted: true,
      };

      const context = {
        runId: 'test-run-id',
        correlationId: 'test-correlation-id',
        logger: mockLogger,
        abortSignal: cancelledAbortSignal,
      };

      expect(() => healthToolHandler({}, context, mockConfig, mockResourceManager))
        .toThrow('Health check was cancelled');
    });

    it('should handle resource manager errors', async () => {
      const context = {
        runId: 'test-run-id',
        correlationId: 'test-correlation-id',
        logger: mockLogger,
        abortSignal: mockAbortSignal,
      };

      const testError = new Error('Resource manager failed');
      vi.mocked(mockResourceManager.getTelemetry).mockImplementation(() => {
        throw testError;
      });

      expect(() => healthToolHandler({}, context, mockConfig, mockResourceManager))
        .toThrow('Resource manager failed');

      // Verify error logging
      expect(mockLogger.error).toHaveBeenCalledWith('Health check failed', {
        runId: 'test-run-id',
        correlationId: 'test-correlation-id',
        error: {
          name: 'Error',
          message: 'Resource manager failed',
          stack: expect.any(String),
        },
      });
    });

    it('should handle non-Error exceptions', async () => {
      const context = {
        runId: 'test-run-id',
        correlationId: 'test-correlation-id',
        logger: mockLogger,
        abortSignal: mockAbortSignal,
      };

      vi.mocked(mockResourceManager.getTelemetry).mockImplementation(() => {
        throw 'String error';
      });

      expect(() => healthToolHandler({}, context, mockConfig, mockResourceManager))
        .toThrow('String error');

      // Verify error logging with string conversion
      expect(mockLogger.error).toHaveBeenCalledWith('Health check failed', {
        runId: 'test-run-id',
        correlationId: 'test-correlation-id',
        error: {
          name: 'UnknownError',
          message: 'String error'
        },
      });
    });

    it('should include all required config fields', async () => {
      const context = {
        runId: 'test-run-id',
        correlationId: 'test-correlation-id',
        logger: mockLogger,
        abortSignal: mockAbortSignal,
      };

      const result = await healthToolHandler({}, context, mockConfig, mockResourceManager);

      // Verify all config fields are present
      expect(result.config).toHaveProperty('toolTimeoutMs');
      expect(result.config).toHaveProperty('maxConcurrentExecutions');
      expect(result.config).toHaveProperty('maxPayloadBytes');
      expect(result.config).toHaveProperty('maxStateBytes');

      // Verify values match config
      expect(result.config.toolTimeoutMs).toBe(mockConfig.tools.defaultTimeoutMs);
      expect(result.config.maxConcurrentExecutions).toBe(mockConfig.resources.maxConcurrentExecutions);
      expect(result.config.maxPayloadBytes).toBe(mockConfig.tools.maxPayloadBytes);
      expect(result.config.maxStateBytes).toBe(mockConfig.tools.maxStateBytes);
    });

    it('should include all required server fields', async () => {
      const context = {
        runId: 'test-run-id',
        correlationId: 'test-correlation-id',
        logger: mockLogger,
        abortSignal: mockAbortSignal,
      };

      const result = await healthToolHandler({}, context, mockConfig, mockResourceManager);

      // Verify server fields are present and correct
      expect(result.server).toHaveProperty('name');
      expect(result.server).toHaveProperty('version');
      expect(result.server.name).toBe(mockConfig.server.name);
      expect(result.server.version).toBe(mockConfig.server.version);
    });

    it('should include all required resource telemetry fields', async () => {
      const context = {
        runId: 'test-run-id',
        correlationId: 'test-correlation-id',
        logger: mockLogger,
        abortSignal: mockAbortSignal,
      };

      const result = await healthToolHandler({}, context, mockConfig, mockResourceManager);

      // Verify resource telemetry fields are present
      expect(result.resources).toHaveProperty('memoryUsageBytes');
      expect(result.resources).toHaveProperty('eventLoopDelayMs');
      expect(result.resources).toHaveProperty('concurrentExecutions');
      expect(result.resources).toHaveProperty('maxConcurrentExecutions');

      // Verify types
      expect(typeof result.resources.memoryUsageBytes).toBe('number');
      expect(typeof result.resources.eventLoopDelayMs).toBe('number');
      expect(typeof result.resources.concurrentExecutions).toBe('number');
      expect(typeof result.resources.maxConcurrentExecutions).toBe('number');
    });
  });
});