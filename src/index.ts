#!/usr/bin/env node

/**
 * Foundation MCP Runtime (v0.1)
 * MCP Server Entry Point
 *
 * Foundational MCP server providing core infrastructure for hosting
 * and orchestrating AI agents.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
  InitializedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from './config/configManager.js';
import type { AdminRegisterToolRequest } from './mcp/adminHandlers.js';
import type { StructuredLogger } from './logging/structuredLogger.js';
import type { ToolRegistry } from './mcp/toolRegistry.js';
import type { ResourceManager } from './resources/resourceManager.js';
import type { IdGenerator } from './shared/idGenerator.js';
import type { Clock } from './shared/clock.js';
import { createSession, type SessionContext, type SessionState } from './mcp/session.js';
import { ErrorCode, createError } from './errors/errorHandler.js';

/**
 * Tool context interface for tool handlers.
 */
interface ToolContext {
  runId: string;
  correlationId: string;
  logger: StructuredLogger;
  abortSignal: AbortSignal;
  transport?: { type: 'stdio' | 'sse' | 'http' };
}

/**
 * Optional agent coordinator interface for future agent coordination support.
 * Defined here to avoid circular dependencies; full implementation in Phase 6.
 */
export interface AgentCoordinator {
  registerAgent(id: string, handler: unknown): void;
  unregisterAgent(id: string): boolean;
  sendMessage(targetAgentId: string, message: unknown): Promise<unknown>;
  getAgentState(agentId: string): Map<string, unknown> | undefined;
}

/**
 * Server options interface for MCP server initialization.
 * 
 * Provides all required dependencies for the MCP server including:
 * - Configuration management
 * - Logging infrastructure
 * - Tool registry for MCP tools
 * - Resource management for concurrency and limits
 * - ID generation for correlation tracking
 * - Clock for deterministic testing
 * - Optional agent coordinator for multi-agent workflows
 * 
 * Per design specification section "1) MCP Server Entry Point"
 */
export interface ServerOptions {
  /** Server configuration with all settings and defaults */
  config: ServerConfig;
  
  /** Structured logger for JSON output and correlation tracking */
  logger: StructuredLogger;
  
  /** Tool registry for managing MCP tools */
  toolRegistry: ToolRegistry;
  
  /** Resource manager for concurrency and payload limits */
  resourceManager: ResourceManager;
  
  /** ID generator for correlation and run IDs */
  idGenerator: IdGenerator;
  
  /** Clock for timestamp generation (enables deterministic testing) */
  clock: Clock;
  
  /** Optional agent coordinator for multi-agent workflows (Phase 6) */
  agentCoordinator?: AgentCoordinator;
}

/**
 * MCP Server interface representing the initialized server instance.
 * Provides methods for server lifecycle management.
 */
export interface MCPServer {
  /** Start the server and begin accepting connections */
  start(): Promise<void>;
  
  /** Stop the server gracefully */
  stop(): Promise<void>;
}


/**
 * Foundation MCP Server class implementing the MCPServer interface.
 * 
 * Manages the MCP protocol lifecycle including:
 * - Session creation and state management per connection
 * - Protocol handler registration (initialize, initialized, tools/list, tools/call)
 * - Component wiring (registry, config, logger, resources)
 * - Graceful shutdown with resource cleanup
 * 
 * Per design specification section "1) MCP Server Entry Point"
 */
class FoundationMCPServer implements MCPServer {
  private readonly server: Server;
  private readonly options: ServerOptions;
  private transport: StdioServerTransport | null = null;
  private session: SessionContext | null = null;

  /**
   * Creates a new Foundation MCP Server instance.
   * 
   * @param options - Server options with all required dependencies
   */
  constructor(options: ServerOptions) {
    this.options = options;
    
    // Create MCP server with configuration
    this.server = new Server(
      {
        name: options.config.server.name,
        version: options.config.server.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Set up MCP protocol handlers for all supported methods.
   * 
   * Registers handlers for:
   * - initialize: Protocol initialization
   * - initialized: Initialization completion notification
   * - tools/list: List available tools
   * - tools/call: Execute a tool
   * 
   * Properly wires up all components:
   * - ToolRegistry for tool lookup and execution
   * - ResourceManager for concurrency and payload validation
   * - StructuredLogger for structured logging
   * - IdGenerator for correlation and run ID generation
   * - Clock for timestamp generation
   * - Session for connection state management
   * 
   * Enforces strict initialization gate:
   * - Blocks ALL methods except initialize and initialized before RUNNING state
   * - Returns JSON-RPC error -32002 for violations
   * 
   * @private
   */
  private setupHandlers(): void {
    // Handler for initialize request
    this.server.setRequestHandler(InitializeRequestSchema, () => {
      this.options.logger.debug('Received initialize request');
      
      // Initialize is allowed at any state
      if (!this.session) {
        throw new Error('Session not initialized');
      }

      // Transition state from STARTING to INITIALIZING
      if (this.session.state !== 'STARTING') {
        throw createError(
          ErrorCode.NotInitialized,
          `Cannot initialize: session already in ${this.session.state} state`
        );
      }

      // Update session state to INITIALIZING
      (this.session as SessionContext & { state: SessionState }).state = 'INITIALIZING';

      this.session.logger.info('Client initializing');
      
      return {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: this.options.config.server.name,
          version: this.options.config.server.version,
        },
        capabilities: {
          tools: {},
        },
      };
    });

    // Handler for initialized notification
    this.server.setNotificationHandler(InitializedNotificationSchema, () => {
      this.options.logger.debug('Received initialized notification');
      
      // Initialized is allowed at any state
      if (!this.session) {
        throw new Error('Session not initialized');
      }

      // Transition state from INITIALIZING to RUNNING
      if (this.session.state !== 'INITIALIZING') {
        throw createError(
          ErrorCode.NotInitialized,
          `Cannot complete initialization: session in ${this.session.state} state, expected INITIALIZING`
        );
      }

      // Update session state to RUNNING
      (this.session as SessionContext & { state: SessionState }).state = 'RUNNING';

      this.session.logger.info('Protocol initialization complete, session RUNNING');
    });

    // Handler for tools/list request
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      this.options.logger.debug('Received tools/list request');
      
      if (!this.session) {
        throw new Error('Session not initialized');
      }

      // Enforce strict initialization gate: block all methods except initialize/initialized before RUNNING
      if (this.session.state !== 'RUNNING') {
        throw createError(
          ErrorCode.NotInitialized,
          'Server not initialized'
        );
      }
      
      // Get all registered tools from registry (already sorted lexicographically)
      const allTools = this.options.toolRegistry.list();
      
      // Check if dynamic registration is effective
      const isDynamicRegistrationEffective = 
        this.options.config.tools.adminRegistrationEnabled && 
        this.options.config.security.dynamicRegistrationEnabled;
      
      // Filter out admin tools if dynamic registration is not effective
      const filteredTools = allTools.filter((tool) => {
        // If tool is marked as admin tool and dynamic registration is not effective, exclude it
        if ('isAdminTool' in tool && (tool as { isAdminTool: boolean }).isAdminTool && !isDynamicRegistrationEffective) {
          return false;
        }
        return true;
      });
      
      // Map to MCP tools/list response format
      const tools = filteredTools.map((tool) => {
        const toolDef: { name: string; description: string; inputSchema: Record<string, unknown>; version?: string } = {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        };
        
        if ('version' in tool && tool.version) {
          toolDef.version = tool.version;
        }
        
        return toolDef;
      });
      
      this.session.logger.debug('Returning tools list', {
        toolCount: tools.length,
        toolNames: tools.map(t => t.name),
      });
      
      return { tools };
    });

    // Handler for tools/call request
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.session) {
        throw new Error('Session not initialized');
      }

      // Step 1: State gate - verify session.state === 'RUNNING'
      if (this.session.state !== 'RUNNING') {
        throw createError(
          ErrorCode.NotInitialized,
          'Server not initialized'
        );
      }

      // Step 2: JSON-RPC params shape validation
      const { name, arguments: args } = request.params;
      
      if (typeof name !== 'string') {
        throw createError(
          ErrorCode.InvalidArgument,
          'Tool name must be a string'
        );
      }
      
      // Validate arguments - MCP allows null/undefined arguments
      const toolArgs = args ?? {};

      // Step 3: Assign IDs
      const correlationId = this.options.idGenerator.generateCorrelationId();
      const runId = this.options.idGenerator.generateRunId();
      
      // Create child logger with correlation context
      const contextLogger = this.options.logger.child({ 
        runId, 
        correlationId,
        toolName: name,
      });
      
      contextLogger.debug('Received tools/call request');

      // Step 4: Payload size check (fast reject)
      
      try {
        JSON.stringify(toolArgs);
      } catch (error) {
        contextLogger.warn('Tool arguments not serializable', {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                code: 'INVALID_ARGUMENT',
                message: 'Tool arguments are not serializable',
                details: { reason: 'arguments_not_serializable' },
                correlationId,
                runId,
              }),
            },
          ],
          isError: true,
        };
      }

      const payloadValidation = this.options.resourceManager.validatePayloadSize(toolArgs);
      if (!payloadValidation.valid) {
        contextLogger.warn('Payload size validation failed', {
          reason: payloadValidation.errors?.[0]?.message ?? 'Unknown error',
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                code: 'RESOURCE_EXHAUSTED',
                message: 'Tool arguments exceed maximum payload size',
                details: { reason: 'payload_too_large' },
                correlationId,
                runId,
              }),
            },
          ],
          isError: true,
        };
      }

      // Step 5: Tool existence check
      const registeredTool = this.options.toolRegistry.get(name);
      if (!registeredTool) {
        contextLogger.warn('Tool not found', { toolName: name });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                code: 'NOT_FOUND',
                message: `Tool '${name}' not found`,
                correlationId,
                runId,
              }),
            },
          ],
          isError: true,
        };
      }

      // Step 6: Acquire concurrency slot using tryAcquireSlot() (non-blocking)
      const releaseSlot = this.options.resourceManager.tryAcquireSlot();
      if (!releaseSlot) {
        contextLogger.warn('Concurrency limit reached');
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                code: 'RESOURCE_EXHAUSTED',
                message: 'Server is at maximum concurrent executions',
                details: { reason: 'concurrency_limit_exceeded' },
                correlationId,
                runId,
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        // Step 7: Schema validation using precompiled Ajv validator
        if (!registeredTool.validator(toolArgs)) {
          contextLogger.warn('Schema validation failed', {
            errors: registeredTool.validator.errors,
          });
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  code: 'INVALID_ARGUMENT',
                  message: 'Tool arguments failed schema validation',
                  details: { 
                    reason: 'schema_validation_failed',
                    errors: registeredTool.validator.errors 
                  },
                  correlationId,
                  runId,
                }),
              },
            ],
            isError: true,
          };
        }

        // Step 8: Execute handler with timeout and AbortSignal
        const abortController = new AbortController();
        const startTime = Date.now();
        const timeoutHandle = setTimeout(() => {
          abortController.abort();
        }, this.options.config.tools.defaultTimeoutMs);

        try {
          // Create tool context with all required fields
          const toolContext = {
            runId,
            correlationId,
            logger: contextLogger,
            abortSignal: abortController.signal,
            // Add transport info for admin tools
            transport: { type: 'stdio' as const }
          };

          // Execute the tool handler
          const result = await registeredTool.handler(toolArgs, toolContext);
          
          const durationMs = Date.now() - startTime;
          contextLogger.info('Tool execution completed', {
            durationMs,
            outcome: 'success',
          });

          // Step 10: Wrap result into MCP tools/call format
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
            isError: false,
          };
        } catch (error) {
          // Handle tool execution errors
          const durationMs = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorName = error instanceof Error ? error.name : 'Error';
          const errorStack = error instanceof Error ? error.stack : undefined;
          
          contextLogger.error('Tool execution failed', {
            durationMs,
            error: {
              name: errorName,
              message: errorMessage,
              ...(errorStack && { stack: errorStack }),
            },
            outcome: 'tool_error',
          });
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  code: 'INTERNAL',
                  message: errorMessage,
                  correlationId,
                  runId,
                }),
              },
            ],
            isError: true,
          };
        } finally {
          clearTimeout(timeoutHandle);
        }
      } finally {
        // Step 9: Release slot (always, in finally block)
        releaseSlot();
      }
    });
  }

  /**
   * Start the MCP server and begin accepting connections.
   * 
   * Creates a stdio transport and connects the MCP server to it.
   * Creates a session context for the connection with unique connectionCorrelationId.
   * Logs server startup information.
   * 
   * @returns Promise that resolves when the server is started
   */
  async start(): Promise<void> {
    this.transport = new StdioServerTransport();
    
    // Create session context for this connection
    this.session = createSession(
      { type: 'stdio' },
      this.options.idGenerator,
      this.options.logger
    );
    
    this.options.logger.info('Starting Foundation MCP Runtime', {
      version: this.options.config.server.version,
      name: this.options.config.server.name,
      connectionCorrelationId: this.session.connectionCorrelationId,
    });
    
    await this.server.connect(this.transport);
    
    this.options.logger.info('Foundation MCP Runtime started successfully', {
      version: this.options.config.server.version,
      connectionCorrelationId: this.session.connectionCorrelationId,
    });
  }

  /**
   * Stop the MCP server gracefully.
   * 
   * Closes the transport connection and cleans up resources.
   * Marks the session as CLOSED.
   * 
   * @returns Promise that resolves when the server is stopped
   */
  async stop(): Promise<void> {
    this.options.logger.info('Stopping Foundation MCP Runtime', {
      connectionCorrelationId: this.session?.connectionCorrelationId,
    });
    
    if (this.session) {
      this.session.state = 'CLOSED';
    }
    
    if (this.transport) {
      // Close the transport
      await this.transport.close();
    }
    
    this.options.logger.info('Foundation MCP Runtime stopped', {
      connectionCorrelationId: this.session?.connectionCorrelationId,
    });
  }
}

/**
 * Factory function to create an MCP server instance.
 * 
 * Initializes all required components and wires them together.
 * The returned server can be started with the start() method.
 * 
 * @param options - Server options with all required dependencies
 * @returns MCPServer instance ready to be started
 * 
 * @example
 * ```typescript
 * const server = createServer({
 *   config: configManager.load(),
 *   logger: new StructuredLogger(new SystemClock()),
 *   toolRegistry: createToolRegistry(configManager, logger),
 *   resourceManager: createResourceManager(configManager.load()),
 *   idGenerator: new ProductionIdGenerator(),
 *   clock: new SystemClock(),
 * });
 * 
 * await server.start();
 * ```
 */
export function createServer(options: ServerOptions): MCPServer {
  return new FoundationMCPServer(options);
}

/**
 * Start an MCP server instance.
 * 
 * Convenience function that calls the start() method on the server.
 * Useful for simple server startup scenarios.
 * 
 * @param server - MCPServer instance to start
 * @returns Promise that resolves when the server is started
 * 
 * @example
 * ```typescript
 * const server = createServer(options);
 * await startServer(server);
 * ```
 */
export async function startServer(server: MCPServer): Promise<void> {
  await server.start();
}

// Start the server
async function main(): Promise<void> {
  try {
    // Import required modules for initialization
    const { createConfigManager } = await import('./config/configManager.js');
    const { StructuredLogger, SystemClock } = await import('./logging/structuredLogger.js');
    const { createToolRegistry } = await import('./mcp/toolRegistry.js');
    const { createResourceManager } = await import('./resources/resourceManager.js');
    const { ProductionIdGenerator } = await import('./shared/idGenerator.js');
    const { createClock } = await import('./shared/clock.js');

    // Initialize components
    const configManager = createConfigManager();
    const config = configManager.load();
    const clock = createClock(); // Use the Clock interface from shared/clock.ts for ServerOptions
    const logger = new StructuredLogger(new SystemClock(), config.logging.redactKeys);
    const toolRegistry = createToolRegistry(configManager, logger);
    const resourceManager = createResourceManager(config);
    const idGenerator = new ProductionIdGenerator();

    // Register health tool (static tool, always available)
    const { healthToolDefinition, healthToolHandler } = await import('./tools/healthTool.js');
    
    // Create a wrapper handler that matches the ToolHandler interface
    const wrappedHealthHandler = (args: Record<string, unknown>, context: ToolContext): Promise<CallToolResult> => {
      const result = healthToolHandler(args, context, config, resourceManager);
      return Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify(result) }]
      });
    };
    
    toolRegistry.register(healthToolDefinition, wrappedHealthHandler, { isDynamic: false });
    
    logger.info('Health tool registered', {
      toolName: healthToolDefinition.name
    });

    // Register admin tools if dynamic registration is effective
    if (config.tools.adminRegistrationEnabled && config.security.dynamicRegistrationEnabled) {
      const { ADMIN_TOOL_DEFINITIONS } = await import('./mcp/adminHandlers.js');
      
      for (const adminTool of ADMIN_TOOL_DEFINITIONS) {
        // Create a wrapper handler that provides the required dependencies
        const wrappedHandler = async (args: Record<string, unknown>, context: ToolContext): Promise<CallToolResult> => {
          const { createSession } = await import('./mcp/session.js');
          
          // Create a temporary session context for admin operations
          const adminSession = createSession(
            context.transport ?? { type: 'stdio' },
            idGenerator,
            logger
          );
          
          // Create request context
          const requestContext = {
            correlationId: context.correlationId,
            runId: context.runId,
            transport: context.transport ?? { type: 'stdio' },
            connectionCorrelationId: adminSession.connectionCorrelationId,
            logger: context.logger
          };
          
          // Call the actual admin handler with proper typing
          const adminResult = adminTool.handler(
            args as unknown as AdminRegisterToolRequest,
            adminSession,
            toolRegistry,
            config,
            requestContext
          );
          
          // Wrap the result in CallToolResult format
          return {
            content: [{ type: 'text', text: JSON.stringify(adminResult) }]
          };
        };
        
        toolRegistry.register(
          {
            name: adminTool.name,
            description: adminTool.description,
            inputSchema: adminTool.inputSchema
          },
          wrappedHandler,
          { isDynamic: false } // Admin tools are static, not dynamic
        );
      }
      
      logger.info('Admin tools registered', {
        adminToolCount: ADMIN_TOOL_DEFINITIONS.length,
        adminToolNames: ADMIN_TOOL_DEFINITIONS.map(t => t.name)
      });
    } else {
      logger.info('Admin tools not registered - dynamic registration not effective', {
        adminRegistrationEnabled: config.tools.adminRegistrationEnabled,
        dynamicRegistrationEnabled: config.security.dynamicRegistrationEnabled
      });
    }

    // Create and start server
    const server = createServer({
      config,
      logger,
      toolRegistry,
      resourceManager,
      idGenerator,
      clock,
    });

    await startServer(server);
  } catch (error) {
    // Use stderr for startup errors since logger may not be available
    process.stderr.write(`Failed to start MCP server: ${error}\n`);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  process.stderr.write('Received SIGINT, shutting down gracefully\n');
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.stderr.write('Received SIGTERM, shutting down gracefully\n');
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    process.stderr.write(`Unhandled error in main: ${error}\n`);
    process.exit(1);
  });
}
