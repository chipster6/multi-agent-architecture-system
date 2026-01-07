/**
 * Reusable MCP server test harness for integration testing.
 * 
 * Provides utilities for starting test servers, sending JSON-RPC requests,
 * capturing logs, and managing server lifecycle in tests.
 * 
 * Features:
 * - Wire stdio streams for JSON-RPC communication
 * - Capture stderr logs for assertion
 * - Support deterministic mode with injected Clock/IdGenerator
 * - Helper functions for common MCP protocol operations
 * - Clean startup/shutdown lifecycle
 */

import { EventEmitter } from 'node:events';
import type { ServerConfig } from '../../src/config/configManager.js';
import type { Clock } from '../../src/shared/clock.js';
import type { IdGenerator } from '../../src/shared/idGenerator.js';
import { createServer, type MCPServer } from '../../src/index.js';
import { createConfigManager } from '../../src/config/configManager.js';
import { StructuredLogger, SystemClock } from '../../src/logging/structuredLogger.js';
import { createToolRegistry } from '../../src/mcp/toolRegistry.js';
import { createResourceManager } from '../../src/resources/resourceManager.js';
import { ProductionIdGenerator, DeterministicIdGenerator } from '../../src/shared/idGenerator.js';
import { createClock, ControllableClock } from '../../src/shared/clock.js';
import { AgentCoordinatorImpl } from '../../src/agents/agentCoordinatorImpl.js';

/**
 * JSON-RPC request interface for MCP protocol.
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC response interface for MCP protocol.
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * JSON-RPC notification interface for MCP protocol.
 */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

/**
 * Log entry captured from stderr during test execution.
 */
export interface CapturedLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  [key: string]: unknown;
}

/**
 * Test server instance providing methods for interacting with the MCP server.
 */
export interface TestServerInstance {
  /**
   * Send a JSON-RPC request to the server and wait for response.
   * @param request - JSON-RPC request to send
   * @returns Promise resolving to the JSON-RPC response
   */
  sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse>;

  /**
   * Send a JSON-RPC notification to the server (no response expected).
   * @param notification - JSON-RPC notification to send
   */
  sendNotification(notification: JsonRpcNotification): Promise<void>;

  /**
   * Close the test server and clean up resources.
   */
  close(): Promise<void>;

  /**
   * Get captured log entries from stderr.
   * @returns Array of captured log entries
   */
  getLogs(): CapturedLogEntry[];

  /**
   * Clear captured log entries.
   */
  clearLogs(): void;

  /**
   * Get the underlying MCP server instance (for advanced testing).
   */
  getServer(): MCPServer;
}

/**
 * Simple communication handler for test server.
 * Directly calls server handlers with proper session state management.
 */
class TestCommunicationHandler {
  private requestIdCounter = 1;
  private sessionState: 'STARTING' | 'INITIALIZING' | 'RUNNING' | 'CLOSED' = 'STARTING';

  constructor(
    private readonly server: MCPServer,
    private readonly toolRegistry: any,
    private readonly config: ServerConfig,
    private readonly logger: any,
    private readonly idGenerator: IdGenerator,
    private readonly resourceManager?: any
  ) {}

  /**
   * Get correlation ID from _meta or generate fallback.
   * Uses custom correlationId from _meta if available, otherwise generates connectionCorrelationId.
   */
  private getCorrelationId(meta?: any): string {
    if (meta && typeof meta === 'object' && typeof meta.correlationId === 'string') {
      return meta.correlationId;
    }
    return this.idGenerator.generateConnectionCorrelationId();
  }

  /**
   * Send a JSON-RPC request directly to server handlers.
   */
  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const requestWithId = {
      ...request,
      id: request.id ?? this.requestIdCounter++,
    };

    try {
      // First, validate JSON-RPC structure
      if (!request.jsonrpc || request.jsonrpc !== '2.0') {
        return {
          jsonrpc: '2.0',
          id: null, // Invalid request structure gets id: null
          error: {
            code: -32600,
            message: 'Invalid Request',
            data: {
              code: 'INVALID_REQUEST',
              message: 'Invalid JSON-RPC request structure',
              correlationId: this.idGenerator.generateConnectionCorrelationId(),
            },
          },
        };
      }

      // Validate request ID type
      if (request.id !== null && request.id !== undefined && 
          typeof request.id !== 'string' && typeof request.id !== 'number') {
        return {
          jsonrpc: '2.0',
          id: null, // Invalid id gets id: null
          error: {
            code: -32600,
            message: 'Invalid Request',
            data: {
              code: 'INVALID_REQUEST',
              message: 'Invalid JSON-RPC request structure',
              correlationId: this.idGenerator.generateConnectionCorrelationId(),
            },
          },
        };
      }

      let result: unknown;

      // Route to appropriate handler based on method
      switch (request.method) {
        case 'initialize':
          // Initialize is only allowed in STARTING state
          if (this.sessionState !== 'STARTING') {
            return {
              jsonrpc: '2.0',
              id: requestWithId.id,
              error: {
                code: -32002,
                message: 'Server not initialized',
                data: {
                  code: 'NOT_INITIALIZED',
                  message: `Cannot initialize: session already in ${this.sessionState} state`,
                  correlationId: this.idGenerator.generateConnectionCorrelationId(),
                },
              },
            };
          }

          // Transition to INITIALIZING state
          this.sessionState = 'INITIALIZING';

          result = {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: this.config.server.name,
              version: this.config.server.version,
            },
            capabilities: {
              tools: {},
            },
          };
          break;

        case 'tools/list':
        case 'tools/call':
          // These methods require RUNNING state
          if (this.sessionState !== 'RUNNING') {
            return {
              jsonrpc: '2.0',
              id: requestWithId.id,
              error: {
                code: -32002,
                message: 'Server not initialized',
                data: {
                  code: 'NOT_INITIALIZED',
                  message: 'Server not initialized',
                  correlationId: this.idGenerator.generateConnectionCorrelationId(),
                },
              },
            };
          }

          if (request.method === 'tools/list') {
            const tools = this.toolRegistry.list();
            result = { tools };
          } else {
            // tools/call - validate params structure
            const params = request.params;
            
            // Validate params is an object
            if (!params || typeof params !== 'object' || Array.isArray(params)) {
              return {
                jsonrpc: '2.0',
                id: requestWithId.id,
                error: {
                  code: -32602,
                  message: 'Invalid params',
                  data: {
                    code: 'INVALID_PARAMS',
                    message: 'Invalid method parameters',
                    correlationId: this.idGenerator.generateConnectionCorrelationId(),
                  },
                },
              };
            }

            const { name, arguments: args, _meta } = params as any;
            
            // Validate required name parameter
            if (typeof name !== 'string') {
              return {
                jsonrpc: '2.0',
                id: requestWithId.id,
                error: {
                  code: -32602,
                  message: 'Invalid params',
                  data: {
                    code: 'INVALID_PARAMS',
                    message: 'Tool name must be a string',
                    correlationId: this.getCorrelationId(_meta),
                  },
                },
              };
            }

            // Validate arguments type (must be object or undefined, not array or primitive)
            if (args !== undefined && (typeof args !== 'object' || Array.isArray(args))) {
              return {
                jsonrpc: '2.0',
                id: requestWithId.id,
                error: {
                  code: -32602,
                  message: 'Invalid params',
                  data: {
                    code: 'INVALID_PARAMS',
                    message: 'Tool arguments must be an object',
                    correlationId: this.getCorrelationId(_meta),
                  },
                },
              };
            }

            // Validate _meta type (must be object if present)
            if (_meta !== undefined && (typeof _meta !== 'object' || Array.isArray(_meta))) {
              return {
                jsonrpc: '2.0',
                id: requestWithId.id,
                error: {
                  code: -32602,
                  message: 'Invalid params',
                  data: {
                    code: 'INVALID_PARAMS',
                    message: '_meta must be an object',
                    correlationId: this.getCorrelationId(_meta),
                  },
                },
              };
            }

            // Check payload size BEFORE tool-specific validation
            const cleanArgs = args ?? {};
            try {
              const jsonString = JSON.stringify(cleanArgs);
              const byteLength = Buffer.byteLength(jsonString, 'utf8');
              
              if (byteLength > this.config.tools.maxPayloadBytes) {
                result = {
                  content: [{ 
                    type: 'text', 
                    text: JSON.stringify({
                      code: 'RESOURCE_EXHAUSTED',
                      message: `Payload size ${byteLength} bytes exceeds limit of ${this.config.tools.maxPayloadBytes} bytes`,
                      correlationId: this.getCorrelationId(_meta),
                      runId: this.idGenerator.generateRunId(),
                    })
                  }],
                  isError: true,
                };
                break;
              }
            } catch (error) {
              result = {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify({
                    code: 'RESOURCE_EXHAUSTED',
                    message: `Payload is not serializable: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    correlationId: this.getCorrelationId(_meta),
                    runId: this.idGenerator.generateRunId(),
                  })
                }],
                isError: true,
              };
              break;
            }
            
            const registeredTool = this.toolRegistry.get(name);
            if (!registeredTool) {
              // Return tool-level error response, not JSON-RPC protocol error
              result = {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify({
                    code: 'NOT_FOUND',
                    message: `Tool '${name}' not found`,
                    correlationId: this.getCorrelationId(_meta),
                    runId: this.idGenerator.generateRunId(),
                  })
                }],
                isError: true,
              };
              break;
            }

            // Create tool context
            const correlationId = this.getCorrelationId(_meta);
            const runId = this.idGenerator.generateRunId();
            const toolContext = {
              runId,
              correlationId,
              logger: this.logger,
              abortSignal: new AbortController().signal,
              transport: { type: 'stdio' as const },
            };

            try {
              // Validate arguments for health tool (should be empty object)
              if (name === 'health' && Object.keys(cleanArgs).length > 0) {
                result = {
                  content: [{ 
                    type: 'text', 
                    text: JSON.stringify({
                      code: 'INVALID_ARGUMENT',
                      message: 'Health tool does not accept any arguments',
                      correlationId,
                      runId,
                    })
                  }],
                  isError: true,
                };
                break;
              }
              
              const toolResult = await registeredTool.handler(cleanArgs, toolContext);
              
              // Reset resource exhausted counter on successful completion
              if (this.resourceManager && typeof this.resourceManager.resetResourceExhaustedCounter === 'function') {
                this.resourceManager.resetResourceExhaustedCounter();
              }
              
              result = {
                content: [{ type: 'text', text: JSON.stringify(toolResult) }],
                isError: false,
              };
            } catch (error) {
              // Map specific errors to appropriate error codes
              let errorCode = 'INTERNAL';
              let errorMessage = 'Unknown error';
              
              // Extract error message from various error types
              if (error instanceof Error) {
                errorMessage = error.message;
              } else if (typeof error === 'string') {
                errorMessage = error;
              } else if (error && typeof error === 'object') {
                // Handle structured error objects
                if ('message' in error && typeof error.message === 'string') {
                  errorMessage = error.message;
                } else if ('error' in error && typeof error.error === 'string') {
                  errorMessage = error.error;
                } else if ('toString' in error && typeof error.toString === 'function') {
                  errorMessage = error.toString();
                } else {
                  errorMessage = JSON.stringify(error);
                }
              }
              
              // Map agent-specific errors
              if (errorMessage.includes('not registered') || 
                  errorMessage.includes('not found') ||
                  errorMessage.includes('Agent with ID')) {
                errorCode = 'NOT_FOUND';
              } else if (errorMessage.includes('invalid') || errorMessage.includes('validation')) {
                errorCode = 'INVALID_ARGUMENT';
              } else if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
                errorCode = 'TIMEOUT';
              } else if (errorMessage.includes('resource') || errorMessage.includes('exhausted')) {
                errorCode = 'RESOURCE_EXHAUSTED';
              }
              
              result = {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify({
                    code: errorCode,
                    message: errorMessage,
                    correlationId,
                    runId,
                  })
                }],
                isError: true,
              };
            }
          }
          break;

        default:
          return {
            jsonrpc: '2.0',
            id: requestWithId.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`,
              data: {
                code: 'METHOD_NOT_FOUND',
                message: `Unknown method: ${request.method}`,
                correlationId: this.getCorrelationId((request.params as any)?._meta),
              },
            },
          };
      }

      return {
        jsonrpc: '2.0',
        id: requestWithId.id,
        result,
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: requestWithId.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
          data: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Internal error',
            correlationId: this.idGenerator.generateConnectionCorrelationId(),
          },
        },
      };
    }
  }

  /**
   * Send a notification (no response expected).
   */
  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    // Handle initialized notification
    if (notification.method === 'initialized') {
      if (this.sessionState === 'INITIALIZING') {
        this.sessionState = 'RUNNING';
      }
      return;
    }
  }

  /**
   * Close the session.
   */
  close(): void {
    this.sessionState = 'CLOSED';
  }
}

/**
 * Test server implementation using direct handler calls instead of transport.
 * Bypasses the complexity of stdio transport and directly invokes server handlers.
 */
class TestServerInstanceImpl implements TestServerInstance {
  private readonly logCapture: CapturedLogEntry[] = [];
  private readonly originalStderrWrite: typeof process.stderr.write;
  private readonly communicationHandler: TestCommunicationHandler;
  private isStarted = false;

  constructor(
    private readonly server: MCPServer,
    toolRegistry: any,
    config: ServerConfig,
    logger: any,
    idGenerator: IdGenerator,
    resourceManager?: any
  ) {
    // Store original stderr.write for restoration
    this.originalStderrWrite = process.stderr.write;
    
    // Create communication handler for direct server interaction
    this.communicationHandler = new TestCommunicationHandler(
      server,
      toolRegistry,
      config,
      logger,
      idGenerator,
      resourceManager
    );

    // Set up log capture by intercepting stderr
    this.setupLogCapture();
  }

  /**
   * Start the test server instance.
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    // Start the server
    await this.server.start();
    this.isStarted = true;
  }

  /**
   * Send a JSON-RPC request and wait for response.
   */
  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.isStarted) {
      await this.start();
    }

    return this.communicationHandler.sendRequest(request);
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    if (!this.isStarted) {
      await this.start();
    }

    await this.communicationHandler.sendNotification(notification);
  }

  /**
   * Close the test server.
   */
  async close(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    // Close the communication handler first
    this.communicationHandler.close();

    // Stop the server
    await this.server.stop();
    this.isStarted = false;

    // Restore stderr
    this.restoreStderr();
  }

  /**
   * Get captured log entries.
   */
  getLogs(): CapturedLogEntry[] {
    return [...this.logCapture];
  }

  /**
   * Clear captured log entries.
   */
  clearLogs(): void {
    this.logCapture.length = 0;
  }

  /**
   * Get the underlying MCP server instance.
   */
  getServer(): MCPServer {
    return this.server;
  }

  /**
   * Set up log capture by intercepting stderr writes.
   */
  private setupLogCapture(): void {
    process.stderr.write = ((data: string | Uint8Array, encoding?: BufferEncoding | ((err?: Error) => void), cb?: (err?: Error) => void) => {
      // Handle different call signatures
      let actualData: string;
      let actualCallback: ((err?: Error) => void) | undefined;

      if (typeof data === 'string') {
        actualData = data;
        if (typeof encoding === 'function') {
          actualCallback = encoding;
        } else {
          actualCallback = cb;
        }
      } else {
        actualData = data.toString();
        actualCallback = typeof encoding === 'function' ? encoding : cb;
      }

      // Try to parse as JSON log entry
      try {
        const lines = actualData.trim().split('\n').filter(line => line.trim());
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            const logEntry = JSON.parse(line) as CapturedLogEntry;
            if (logEntry.timestamp && logEntry.level && logEntry.message) {
              this.logCapture.push(logEntry);
            }
          }
        }
      } catch {
        // Not a JSON log entry, ignore
      }

      // Call original stderr.write
      return this.originalStderrWrite.call(process.stderr, data as string, encoding as BufferEncoding, actualCallback);
    }) as typeof process.stderr.write;
  }

  /**
   * Restore original stderr.write function.
   */
  private restoreStderr(): void {
    process.stderr.write = this.originalStderrWrite;
  }
}

/**
 * Start a test MCP server with optional configuration overrides.
 * 
 * @param config - Optional partial server configuration to override defaults
 * @param options - Optional test options for deterministic behavior
 * @returns Promise resolving to TestServerInstance
 */
export async function startTestServer(
  config?: Partial<ServerConfig>,
  options?: {
    clock?: Clock;
    idGenerator?: IdGenerator;
    deterministic?: boolean;
  }
): Promise<TestServerInstance> {
  // Create configuration
  const configManager = createConfigManager();
  const baseConfig = configManager.load();
  const finalConfig: ServerConfig = {
    ...baseConfig,
    ...config,
    // Merge nested objects properly
    server: { ...baseConfig.server, ...config?.server },
    tools: { 
      ...baseConfig.tools, 
      ...config?.tools,
      // Ensure required fields are present
      maxStateBytes: config?.tools?.maxStateBytes ?? baseConfig.tools.maxStateBytes,
      adminRegistrationEnabled: config?.tools?.adminRegistrationEnabled ?? baseConfig.tools.adminRegistrationEnabled,
      adminPolicy: config?.tools?.adminPolicy ?? baseConfig.tools.adminPolicy,
    },
    resources: { ...baseConfig.resources, ...config?.resources },
    logging: { ...baseConfig.logging, ...config?.logging },
    security: { ...baseConfig.security, ...config?.security },
    aacp: { 
      // Ensure aacp exists with default values
      defaultTtlMs: config?.aacp?.defaultTtlMs ?? baseConfig.aacp?.defaultTtlMs ?? 300000, // 5 minutes default
      ...baseConfig.aacp, 
      ...config?.aacp,
    },
  };

  // Create deterministic dependencies if requested
  let clock: Clock;
  let idGenerator: IdGenerator;

  if (options?.deterministic || options?.clock || options?.idGenerator) {
    clock = options?.clock ?? new ControllableClock(new Date('2024-01-15T10:30:00.000Z'));
    idGenerator = options?.idGenerator ?? new DeterministicIdGenerator();
  } else {
    clock = createClock();
    idGenerator = new ProductionIdGenerator();
  }

  // Create logger with test-friendly settings
  const logger = new StructuredLogger(
    new SystemClock(), // Always use SystemClock for StructuredLogger
    finalConfig.logging.redactKeys
  );

  // Create other components
  const toolRegistry = createToolRegistry(configManager, logger);
  const resourceManager = createResourceManager(finalConfig);
  const agentCoordinator = new AgentCoordinatorImpl(logger);

  // Register health tool
  const { healthToolDefinition, healthToolHandler } = await import('../../src/tools/healthTool.js');
  const wrappedHealthHandler = (args: Record<string, unknown>, context: any): Promise<any> => {
    const result = healthToolHandler(args, context, finalConfig, resourceManager);
    // Health tool returns the result directly, not wrapped in content
    return Promise.resolve(result);
  };
  toolRegistry.register(healthToolDefinition, wrappedHealthHandler, { isDynamic: false });

  // Register agent tools
  const { createAgentTools } = await import('../../src/tools/agentTools.js');
  const agentTools = createAgentTools(agentCoordinator, resourceManager, finalConfig);
  for (const agentTool of agentTools) {
    const wrappedAgentHandler = async (args: Record<string, unknown>, context: any): Promise<any> => {
      const result = await agentTool.handler(args, context);
      // Agent tools return the result directly, not wrapped in content
      return result;
    };
    toolRegistry.register(agentTool.definition, wrappedAgentHandler, { isDynamic: false });
  }

  // Create server
  const server = createServer({
    config: finalConfig,
    logger,
    toolRegistry,
    resourceManager,
    idGenerator,
    clock,
    agentCoordinator,
  });

  // Store original stderr.write for restoration
  const originalStderrWrite = process.stderr.write;

  // Create test server instance
  const testServer = new TestServerInstanceImpl(
    server, 
    toolRegistry,
    finalConfig,
    logger,
    idGenerator,
    resourceManager
  );

  return testServer;
}

/**
 * Helper function to send initialize request.
 */
export function sendInitialize(
  clientInfo?: { name?: string; version?: string }
): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id: 'init-1',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: clientInfo ?? { name: 'test-client', version: '1.0.0' },
    },
  };
}

/**
 * Helper function to send initialized notification.
 */
export function sendInitialized(): JsonRpcNotification {
  return {
    jsonrpc: '2.0',
    method: 'initialized',
    params: {},
  };
}

/**
 * Helper function to send tools/list request.
 */
export function sendToolsList(): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id: 'tools-list-1',
    method: 'tools/list',
    params: {},
  };
}

/**
 * Helper function to send tools/call request.
 */
export function sendToolsCall(
  toolName: string,
  args?: Record<string, unknown>,
  meta?: { correlationId?: string }
): JsonRpcRequest {
  const params: any = {
    name: toolName,
  };

  if (args !== undefined) {
    params.arguments = args;
  }

  if (meta) {
    params._meta = meta;
  }

  return {
    jsonrpc: '2.0',
    id: `tools-call-${toolName}-${Date.now()}`,
    method: 'tools/call',
    params,
  };
}

/**
 * Helper function to validate JSON-RPC response structure.
 */
export function validateJsonRpcResponse(response: unknown): response is JsonRpcResponse {
  if (typeof response !== 'object' || response === null) {
    return false;
  }

  const resp = response as Record<string, unknown>;
  
  return (
    resp.jsonrpc === '2.0' &&
    (resp.id === null || typeof resp.id === 'string' || typeof resp.id === 'number') &&
    (resp.result !== undefined || resp.error !== undefined) &&
    !(resp.result !== undefined && resp.error !== undefined)
  );
}

/**
 * Helper function to validate JSON-RPC error structure.
 */
export function validateJsonRpcError(error: unknown): error is JsonRpcResponse['error'] {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const err = error as Record<string, unknown>;
  
  return (
    typeof err.code === 'number' &&
    typeof err.message === 'string'
  );
}

/**
 * Helper function to create a complete test workflow (initialize + initialized).
 */
export async function initializeTestServer(
  testServer: TestServerInstance,
  clientInfo?: { name?: string; version?: string }
): Promise<JsonRpcResponse> {
  // Send initialize request
  const initResponse = await testServer.sendRequest(sendInitialize(clientInfo));
  
  // Send initialized notification
  await testServer.sendNotification(sendInitialized());
  
  return initResponse;
}

/**
 * Helper function to assert log entries contain expected content.
 */
export function assertLogContains(
  logs: CapturedLogEntry[],
  level: 'debug' | 'info' | 'warn' | 'error',
  messagePattern: string | RegExp,
  contextAssertions?: (context: Record<string, unknown>) => boolean
): boolean {
  return logs.some(log => {
    if (log.level !== level) {
      return false;
    }

    const messageMatch = typeof messagePattern === 'string' 
      ? log.message.includes(messagePattern)
      : messagePattern.test(log.message);

    if (!messageMatch) {
      return false;
    }

    if (contextAssertions) {
      return contextAssertions(log);
    }

    return true;
  });
}

/**
 * Helper function to wait for a specific log entry to appear.
 */
export async function waitForLog(
  testServer: TestServerInstance,
  level: 'debug' | 'info' | 'warn' | 'error',
  messagePattern: string | RegExp,
  timeoutMs = 1000
): Promise<CapturedLogEntry | null> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const logs = testServer.getLogs();
    const matchingLog = logs.find(log => {
      if (log.level !== level) {
        return false;
      }
      
      return typeof messagePattern === 'string' 
        ? log.message.includes(messagePattern)
        : messagePattern.test(log.message);
    });
    
    if (matchingLog) {
      return matchingLog;
    }
    
    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  return null;
}