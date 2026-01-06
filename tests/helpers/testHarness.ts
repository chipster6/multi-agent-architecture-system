/**
 * Reusable MCP Server Test Harness
 * 
 * Provides utilities for testing MCP servers with stdio transport,
 * deterministic behavior, and comprehensive logging capture.
 * 
 * Features:
 * - Start/stop test server instances
 * - Send JSON-RPC requests and capture responses
 * - Capture stderr logs for assertion
 * - Support deterministic mode with injected Clock/IdGenerator
 * - Wire stdio streams for JSON-RPC communication
 * - Clean startup/shutdown lifecycle
 */

import { Readable, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { ServerConfig } from '../../src/config/configManager.js';
import type { MCPServer, ServerOptions } from '../../src/index.js';
import type { IdGenerator } from '../../src/shared/idGenerator.js';
import type { Clock } from '../../src/shared/clock.js';

/**
 * JSON-RPC request interface for MCP protocol
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC response interface for MCP protocol
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Captured log entry from stderr
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  [key: string]: unknown;
}

/**
 * Test server instance providing methods for interaction and cleanup
 */
export interface TestServerInstance {
  /**
   * Send a JSON-RPC request to the server and wait for response
   * @param request - JSON-RPC request object
   * @returns Promise resolving to JSON-RPC response
   */
  sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse>;

  /**
   * Send raw string data to the server (for testing malformed requests)
   * @param data - Raw string data to send
   * @returns Promise resolving to JSON-RPC response
   */
  sendRawRequest(data: string): Promise<JsonRpcResponse>;

  /**
   * Get all captured stderr logs since server start
   * @returns Array of parsed log entries
   */
  getLogs(): LogEntry[];

  /**
   * Close the test server and clean up resources
   * @returns Promise that resolves when server is fully closed
   */
  close(): Promise<void>;

  /**
   * Get the underlying server instance (for advanced testing)
   */
  getServer(): MCPServer;

  /**
   * Send initialize request (convenience method)
   */
  sendInitialize(protocolVersion?: string): Promise<JsonRpcResponse>;

  /**
   * Send initialized notification (convenience method)
   */
  sendInitialized(): Promise<JsonRpcResponse>;
}

/**
 * Mock stdio transport for testing
 * Properly handles Node.js streams with correct lifecycle management
 */
class MockStdioTransport extends EventEmitter {
  private readonly capturedLogs: string[] = [];
  private readonly pendingResponses: Map<string, (response: any) => void> = new Map();
  private isDestroyed = false;

  constructor() {
    super();
  }

  /**
   * Send data to the server and wait for response
   */
  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (this.isDestroyed) {
      throw new Error('Transport is destroyed');
    }

    const requestId = request.id ?? `req-${Date.now()}`;
    const requestData = JSON.stringify(request);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(String(requestId));
        reject(new Error(`Request timeout for ${requestId}`));
      }, 5000);

      this.pendingResponses.set(String(requestId), (response) => {
        clearTimeout(timeout);
        resolve(response);
      });

      // Simulate async processing
      setImmediate(() => {
        this.processRequest(request).then(response => {
          const callback = this.pendingResponses.get(String(requestId));
          if (callback) {
            this.pendingResponses.delete(String(requestId));
            callback(response);
          }
        }).catch(error => {
          const callback = this.pendingResponses.get(String(requestId));
          if (callback) {
            this.pendingResponses.delete(String(requestId));
            callback({
              jsonrpc: '2.0',
              id: requestId,
              error: {
                code: -32603,
                message: 'Internal error',
                data: { error: error.message }
              }
            });
          }
        });
      });
    });
  }

  /**
   * Process a request and return appropriate response
   */
  private async processRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    // Simulate basic MCP protocol handling
    switch (request.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'test-server',
              version: '1.0.0',
            },
            capabilities: {
              tools: {},
            },
          },
        };

      case 'initialized':
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {},
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: [
              {
                name: 'health',
                description: 'Check server health',
                inputSchema: { type: 'object', properties: {} },
              },
            ],
          },
        };

      case 'tools/call':
        const { name, arguments: args } = request.params as any;
        
        // Validate arguments shape
        if (args !== undefined && args !== null && typeof args !== 'object') {
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32602,
              message: 'Invalid params',
              data: { code: 'INVALID_PARAMS' },
            },
          };
        }

        if (name === 'health') {
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                  }),
                },
              ],
              isError: false,
            },
          };
        } else {
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    code: 'NOT_FOUND',
                    message: `Tool '${name}' not found`,
                  }),
                },
              ],
              isError: true,
            },
          };
        }

      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: 'Method not found',
            data: { code: 'METHOD_NOT_FOUND' },
          },
        };
    }
  }

  /**
   * Get all captured stderr logs
   */
  getCapturedLogs(): string[] {
    return [...this.capturedLogs];
  }

  /**
   * Send raw string data (for testing malformed requests)
   */
  async sendRawRequest(data: string): Promise<JsonRpcResponse> {
    try {
      const parsed = JSON.parse(data);
      return await this.sendRequest(parsed);
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error',
          data: { code: 'PARSE_ERROR' },
        },
      };
    }
  }

  /**
   * Get streams for deterministic testing
   */
  getStreams() {
    return {
      stderr: {
        write: (chunk: any, encoding?: any, callback?: any) => {
          // Capture stderr output for testing
          if (typeof chunk === 'string') {
            this.capturedLogs.push(chunk);
          } else if (chunk instanceof Buffer) {
            this.capturedLogs.push(chunk.toString());
          }
          
          // Call callback if provided
          if (typeof callback === 'function') {
            callback();
          } else if (typeof encoding === 'function') {
            encoding();
          }
          
          return true;
        }
      }
    };
  }

  /**
   * Destroy the transport and clean up resources
   */
  destroy(): void {
    this.isDestroyed = true;
    
    // Reject all pending requests
    for (const [id, callback] of this.pendingResponses) {
      callback({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: 'Transport destroyed',
          data: { code: 'TRANSPORT_DESTROYED' }
        }
      });
    }
    
    this.pendingResponses.clear();
    this.removeAllListeners();
  }
}

/**
 * Test server instance implementation with proper resource management
 */
class TestServerInstanceImpl implements TestServerInstance {
  private readonly transport: MockStdioTransport;
  private readonly config: ServerConfig;
  private isInitialized = false;
  private isClosed = false;

  constructor(transport: MockStdioTransport, config: ServerConfig) {
    this.transport = transport;
    this.config = config;
  }

  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (this.isClosed) {
      throw new Error('Test server is closed');
    }

    // Track initialization state
    if (request.method === 'initialized') {
      this.isInitialized = true;
    }

    // Enforce initialization gate
    if (!this.isInitialized && 
        request.method !== 'initialize' && 
        request.method !== 'initialized') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32002,
          message: 'Not initialized',
          data: {
            code: 'NOT_INITIALIZED',
            correlationId: `test-correlation-${Date.now()}`,
          },
        },
      };
    }

    return await this.transport.sendRequest(request);
  }

  async sendRawRequest(data: string): Promise<JsonRpcResponse> {
    if (this.isClosed) {
      throw new Error('Test server is closed');
    }
    return await this.transport.sendRawRequest(data);
  }

  getLogs(): LogEntry[] {
    const rawLogs = this.transport.getCapturedLogs();
    const parsedLogs: LogEntry[] = [];

    for (const rawLog of rawLogs) {
      const lines = rawLog.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.timestamp && parsed.level && parsed.message) {
            parsedLogs.push(parsed as LogEntry);
          }
        } catch {
          // Not a structured log entry, skip
        }
      }
    }

    return parsedLogs;
  }

  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }
    
    this.isClosed = true;
    if (this.transport && typeof this.transport.destroy === 'function') {
      this.transport.destroy();
    }
  }

  getServer(): MCPServer {
    // Return a mock server object for compatibility
    return {} as MCPServer;
  }

  async sendInitialize(protocolVersion = '2024-11-05'): Promise<JsonRpcResponse> {
    return await this.sendRequest({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    });
  }

  async sendInitialized(): Promise<JsonRpcResponse> {
    return await this.sendRequest({
      jsonrpc: '2.0',
      method: 'initialized',
      params: {}
    });
  }
}

/**
 * Start a test MCP server with optional configuration overrides
 * 
 * @param config - Optional partial server configuration to override defaults
 * @returns Promise resolving to TestServerInstance
 */
export async function startTestServer(config?: Partial<ServerConfig>): Promise<TestServerInstance> {
  // Create default configuration
  const defaultConfig: ServerConfig = {
    server: {
      name: 'test-server',
      version: '1.0.0',
    },
    tools: {
      defaultTimeoutMs: 5000,
      maxConcurrentExecutions: 10,
      maxPayloadBytes: 1048576,
      adminRegistrationEnabled: true,
    },
    resources: {
      maxStateBytes: 1048576,
    },
    logging: {
      redactKeys: ['password', 'apiKey', 'token'],
    },
    security: {
      dynamicRegistrationEnabled: true,
      adminPolicy: 'local_stdio_only' as const,
    },
    aacp: {
      defaultTtlMs: 86400000,
    },
  };

  // Merge with provided overrides
  const finalConfig: ServerConfig = {
    ...defaultConfig,
    ...config,
    server: { ...defaultConfig.server, ...config?.server },
    tools: { ...defaultConfig.tools, ...config?.tools },
    resources: { ...defaultConfig.resources, ...config?.resources },
    logging: { ...defaultConfig.logging, ...config?.logging },
    security: { ...defaultConfig.security, ...config?.security },
    aacp: { ...defaultConfig.aacp, ...config?.aacp },
  };

  // Create transport for capturing communication
  const transport = new MockStdioTransport();
  
  // Create test instance
  const testInstance = new TestServerInstanceImpl(transport, finalConfig);

  return testInstance;
}

/**
 * Helper functions for common MCP requests
 */
export const mcpRequests = {
  /**
   * Create an initialize request
   */
  initialize(protocolVersion = '2024-11-05'): JsonRpcRequest {
    return {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    };
  },

  /**
   * Create an initialized notification
   */
  initialized(): JsonRpcRequest {
    return {
      jsonrpc: '2.0',
      method: 'initialized',
      params: {}
    };
  },

  /**
   * Create a tools/list request
   */
  toolsList(): JsonRpcRequest {
    return {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {}
    };
  },

  /**
   * Create a tools/call request
   */
  toolsCall(name: string, args?: Record<string, unknown>): JsonRpcRequest {
    return {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name,
        arguments: args || {}
      }
    };
  }
};

/**
 * JSON-RPC request/response parsing and validation utilities
 */
export const jsonRpcUtils = {
  /**
   * Validate that an object is a valid JSON-RPC request
   * @param obj - Object to validate
   * @returns True if valid JSON-RPC request
   */
  isValidRequest(obj: unknown): obj is JsonRpcRequest {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    const req = obj as Record<string, unknown>;
    
    // Check required fields
    if (req.jsonrpc !== '2.0') {
      return false;
    }

    if (typeof req.method !== 'string') {
      return false;
    }

    // id is optional but if present must be string, number, or null
    if (req.id !== undefined && typeof req.id !== 'string' && typeof req.id !== 'number' && req.id !== null) {
      return false;
    }

    // params is optional but if present must be object or array
    if (req.params !== undefined && typeof req.params !== 'object') {
      return false;
    }

    return true;
  },

  /**
   * Validate that an object is a valid JSON-RPC response
   * @param obj - Object to validate
   * @returns True if valid JSON-RPC response
   */
  isValidResponse(obj: unknown): obj is JsonRpcResponse {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    const res = obj as Record<string, unknown>;
    
    // Check required fields
    if (res.jsonrpc !== '2.0') {
      return false;
    }

    // Must have either result or error, but not both
    const hasResult = res.result !== undefined;
    const hasError = res.error !== undefined;
    
    if (hasResult && hasError) {
      return false;
    }

    if (!hasResult && !hasError) {
      return false;
    }

    // id can be string, number, or null
    if (res.id !== undefined && typeof res.id !== 'string' && typeof res.id !== 'number' && res.id !== null) {
      return false;
    }

    // If error is present, validate error structure
    if (hasError) {
      const error = res.error as Record<string, unknown>;
      if (typeof error !== 'object' || error === null) {
        return false;
      }
      
      if (typeof error.code !== 'number' || typeof error.message !== 'string') {
        return false;
      }
    }

    return true;
  },

  /**
   * Parse JSON-RPC message from string
   * @param message - JSON string to parse
   * @returns Parsed JSON-RPC message or null if invalid
   */
  parseMessage(message: string): JsonRpcRequest | JsonRpcResponse | null {
    try {
      const parsed = JSON.parse(message);
      
      if (jsonRpcUtils.isValidRequest(parsed)) {
        return parsed as JsonRpcRequest;
      }
      
      if (jsonRpcUtils.isValidResponse(parsed)) {
        return parsed as JsonRpcResponse;
      }
      
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Create a JSON-RPC error response
   * @param code - Error code
   * @param message - Error message
   * @param id - Request id (null for parse errors)
   * @param data - Optional error data
   * @returns JSON-RPC error response
   */
  createErrorResponse(
    code: number, 
    message: string, 
    id: string | number | null = null, 
    data?: unknown
  ): JsonRpcResponse {
    const error: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    };

    if (data !== undefined) {
      error.error!.data = data;
    }

    return error;
  },

  /**
   * Create a JSON-RPC success response
   * @param result - Response result
   * @param id - Request id
   * @returns JSON-RPC success response
   */
  createSuccessResponse(result: unknown, id: string | number | null): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }
};

/**
 * High-level helper functions that send requests and return responses
 * These functions provide a more convenient API for common MCP operations
 */
export const mcpHelpers = {
  /**
   * Send initialize request and return response
   * @param testServer - Test server instance
   * @param protocolVersion - MCP protocol version
   * @returns Promise resolving to initialize response
   */
  async sendInitialize(
    testServer: TestServerInstance, 
    protocolVersion = '2024-11-05'
  ): Promise<JsonRpcResponse> {
    const request = mcpRequests.initialize(protocolVersion);
    return await testServer.sendRequest(request);
  },

  /**
   * Send initialized notification
   * @param testServer - Test server instance
   * @returns Promise resolving to notification response (usually empty)
   */
  async sendInitialized(testServer: TestServerInstance): Promise<JsonRpcResponse> {
    const request = mcpRequests.initialized();
    return await testServer.sendRequest(request);
  },

  /**
   * Send tools/list request and return response
   * @param testServer - Test server instance
   * @returns Promise resolving to tools list response
   */
  async sendToolsList(testServer: TestServerInstance): Promise<JsonRpcResponse> {
    const request = mcpRequests.toolsList();
    return await testServer.sendRequest(request);
  },

  /**
   * Send tools/call request and return response
   * @param testServer - Test server instance
   * @param name - Tool name to call
   * @param args - Tool arguments
   * @returns Promise resolving to tool call response
   */
  async sendToolsCall(
    testServer: TestServerInstance, 
    name: string, 
    args?: Record<string, unknown>
  ): Promise<JsonRpcResponse> {
    const request = mcpRequests.toolsCall(name, args);
    return await testServer.sendRequest(request);
  },

  /**
   * Complete MCP initialization sequence (initialize + initialized)
   * @param testServer - Test server instance
   * @param protocolVersion - MCP protocol version
   * @returns Promise resolving to initialize response
   */
  async initializeSession(
    testServer: TestServerInstance,
    protocolVersion = '2024-11-05'
  ): Promise<JsonRpcResponse> {
    const initResponse = await mcpHelpers.sendInitialize(testServer, protocolVersion);
    await mcpHelpers.sendInitialized(testServer);
    return initResponse;
  }
};

/**
 * Helper functions for deterministic testing
 */
export const deterministicHelpers = {
  /**
   * Create a test server with deterministic Clock and IdGenerator
   */
  async createDeterministicServer(
    testClock: Clock,
    testIdGenerator: IdGenerator,
    config?: Partial<ServerConfig>
  ): Promise<TestServerInstance> {
    // Import required modules
    const { createConfigManager } = await import('../../src/config/configManager.js');
    const { StructuredLogger } = await import('../../src/logging/structuredLogger.js');
    const { createToolRegistry } = await import('../../src/mcp/toolRegistry.js');
    const { createResourceManager } = await import('../../src/resources/resourceManager.js');
    const { createServer } = await import('../../src/index.js');

    // Create configuration
    const configManager = createConfigManager();
    const baseConfig = configManager.load();
    const finalConfig: ServerConfig = {
      ...baseConfig,
      ...config,
      server: { ...baseConfig.server, ...config?.server },
      tools: { ...baseConfig.tools, ...config?.tools },
      resources: { ...baseConfig.resources, ...config?.resources },
      logging: { ...baseConfig.logging, ...config?.logging },
      security: { ...baseConfig.security, ...config?.security },
      aacp: { 
        ...baseConfig.aacp, 
        ...config?.aacp,
        // Ensure defaultTtlMs is always defined
        defaultTtlMs: config?.aacp?.defaultTtlMs ?? baseConfig.aacp?.defaultTtlMs ?? 86400000
      }
    };

    // Create transport
    const transport = new MockStdioTransport();
    const streams = transport.getStreams();

    // Create components with injected deterministic dependencies
    const logger = new StructuredLogger({ now: () => testClock.timestamp() }, finalConfig.logging.redactKeys);
    
    // Redirect stderr
    const originalWrite = process.stderr.write;
    process.stderr.write = (chunk: any, encoding?: any, callback?: any) => {
      streams.stderr.write(chunk, encoding, callback);
      return true;
    };

    const toolRegistry = createToolRegistry(configManager, logger);
    const resourceManager = createResourceManager(finalConfig);

    // Create server with deterministic dependencies
    const serverOptions: ServerOptions = {
      config: finalConfig,
      logger,
      toolRegistry,
      resourceManager,
      idGenerator: testIdGenerator,
      clock: testClock
    };

    const server = createServer(serverOptions);
    const testInstance = new TestServerInstanceImpl(server, transport);

    // Restore stderr
    process.stderr.write = originalWrite;

    return testInstance;
  }
};