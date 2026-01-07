/**
 * Health tool implementation for the MCP server.
 * Provides comprehensive health information including server details,
 * configuration, resource telemetry, and health status.
 */

import type { ServerConfig } from '../config/configManager.js';
import type { ResourceManager, ResourceTelemetry } from '../resources/resourceManager.js';
import type { StructuredLogger } from '../logging/structuredLogger.js';

/**
 * Health response interface per design specification.
 * Contains server information, configuration summary, resource telemetry, and health status.
 */
export interface HealthResponse {
  /** Server information */
  server: {
    name: string;
    version: string;
  };
  
  /** Configuration summary */
  config: {
    toolTimeoutMs: number;
    maxConcurrentExecutions: number;
    maxPayloadBytes: number;
    maxStateBytes: number;
  };
  
  /** Resource telemetry from ResourceManager */
  resources: ResourceTelemetry;
  
  /** Health status from ResourceManager */
  status: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * Tool context interface for health tool handler.
 */
export interface HealthToolContext {
  runId: string;
  correlationId: string;
  logger: StructuredLogger;
  abortSignal: AbortSignal;
}

/**
 * Health tool handler implementation.
 * 
 * Returns comprehensive health information about the MCP server including:
 * - Server name and version from configuration
 * - Key configuration parameters (timeouts, limits)
 * - Current resource telemetry (memory, CPU, concurrency)
 * - Overall health status assessment
 * 
 * This tool is registered as a static tool (always available) and provides
 * essential monitoring capabilities for the MCP server.
 * 
 * @param args - Empty arguments object (health tool takes no parameters)
 * @param context - Tool execution context with logging and cancellation
 * @param config - Server configuration for extracting server info and limits
 * @param resourceManager - Resource manager for telemetry and health status
 * @returns Promise resolving to HealthResponse with comprehensive health data
 * 
 * @example
 * ```typescript
 * const result = await healthToolHandler({}, context, config, resourceManager);
 * // Returns: {
 * //   server: { name: "foundation-mcp-runtime", version: "0.1.0" },
 * //   config: { toolTimeoutMs: 30000, maxConcurrentExecutions: 10, ... },
 * //   resources: { memoryUsageBytes: 123456, eventLoopDelayMs: 5.2, ... },
 * //   status: "healthy"
 * // }
 * ```
 */
export function healthToolHandler(
  _args: Record<string, unknown>,
  context: HealthToolContext,
  config: ServerConfig,
  resourceManager: ResourceManager
): HealthResponse {
  const { logger, abortSignal } = context;
  
  // Check for cancellation
  if (abortSignal.aborted) {
    throw new Error('Health check was cancelled');
  }
  
  logger.debug('Executing health tool', {
    runId: context.runId,
    correlationId: context.correlationId,
  });
  
  try {
    // Get current resource telemetry
    const resources = resourceManager.getTelemetry();
    
    // Get health status assessment
    const status = resourceManager.getHealthStatus();
    
    // Build health response
    const healthResponse: HealthResponse = {
      server: {
        name: config.server.name,
        version: config.server.version,
      },
      config: {
        toolTimeoutMs: config.tools.defaultTimeoutMs,
        maxConcurrentExecutions: config.resources.maxConcurrentExecutions,
        maxPayloadBytes: config.tools.maxPayloadBytes,
        maxStateBytes: config.resources.maxStateBytes,
      },
      resources,
      status,
    };
    
    logger.debug('Health check completed successfully', {
      runId: context.runId,
      correlationId: context.correlationId,
      status,
      memoryUsageBytes: resources.memoryUsageBytes,
      concurrentExecutions: resources.concurrentExecutions,
    });
    
    return healthResponse;
  } catch (error: unknown) {
    logger.error('Health check failed', {
      runId: context.runId,
      correlationId: context.correlationId,
      error: error instanceof Error 
        ? { 
            name: error.name, 
            message: error.message, 
            ...(error.stack && { stack: error.stack }) 
          }
        : { 
            name: 'UnknownError',
            message: String(error) 
          },
    });
    
    throw error;
  }
}

/**
 * Health tool definition for registration with the tool registry.
 * 
 * The health tool provides a standardized way to check the MCP server's
 * operational status and resource utilization. It requires no input parameters
 * and returns comprehensive health information.
 * 
 * This tool should be registered at server startup as a static tool
 * (not dynamic) to ensure it's always available for monitoring purposes.
 */
export const healthToolDefinition = {
  name: 'health',
  description: 'Get comprehensive health information about the MCP server including resource usage and status',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    additionalProperties: false,
  },
  version: '1.0.0',
};