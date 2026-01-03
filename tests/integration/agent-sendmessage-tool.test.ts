/**
 * Integration tests for the agent/sendMessage MCP tool.
 * Tests the tool through the MCP protocol with payload size validation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type MCPServer } from '../../src/index.js';
import { createConfigManager } from '../../src/config/configManager.js';
import { StructuredLogger, SystemClock } from '../../src/logging/structuredLogger.js';
import { createToolRegistry } from '../../src/mcp/toolRegistry.js';
import { createResourceManager } from '../../src/resources/resourceManager.js';
import { ProductionIdGenerator } from '../../src/shared/idGenerator.js';
import { createClock } from '../../src/shared/clock.js';
import { AgentCoordinatorImpl } from '../../src/agents/agentCoordinatorImpl.js';
import { createAgentTools } from '../../src/tools/agentTools.js';
import type { AgentHandler, AgentMessage, AgentContext } from '../../src/agents/agentCoordinator.js';
import type { ToolContext } from '../../src/mcp/toolRegistry.js';

describe('agent/sendMessage MCP Tool Integration', () => {
  let server: MCPServer;
  let agentCoordinator: AgentCoordinatorImpl;
  let logger: StructuredLogger;
  let toolHandler: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>;

  beforeEach(async () => {
    // Initialize components
    const configManager = createConfigManager();
    const config = configManager.load();
    const clock = createClock();
    logger = new StructuredLogger(new SystemClock(), config.logging.redactKeys);
    const toolRegistry = createToolRegistry(configManager, logger);
    const resourceManager = createResourceManager(config);
    const idGenerator = new ProductionIdGenerator();
    agentCoordinator = new AgentCoordinatorImpl(logger);

    // Register agent tools and get the handler
    const agentTools = createAgentTools(agentCoordinator, resourceManager, config);
    const sendMessageTool = agentTools.find(tool => tool.definition.name === 'agent/sendMessage');
    
    if (!sendMessageTool) {
      throw new Error('agent/sendMessage tool not found');
    }
    
    toolHandler = sendMessageTool.handler;
    
    for (const agentTool of agentTools) {
      toolRegistry.register(agentTool.definition, agentTool.handler, { isDynamic: false });
    }

    // Create server
    server = createServer({
      config,
      logger,
      toolRegistry,
      resourceManager,
      idGenerator,
      clock,
      agentCoordinator,
    });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  it('should successfully send message to registered agent', async () => {
    // Register a test agent
    const testHandler: AgentHandler = async (message: AgentMessage, context: AgentContext) => {
      return {
        status: 'success',
        receivedMessage: message,
        agentId: context.agentId,
        timestamp: new Date().toISOString(),
      };
    };

    agentCoordinator.registerAgent('test-agent', testHandler);

    // Create tool context
    const toolContext: ToolContext = {
      runId: 'test-run-id',
      correlationId: 'test-correlation-id',
      logger: logger.child({ test: true }),
      abortSignal: new AbortController().signal,
    };

    // Call the tool handler directly
    const args = {
      targetAgentId: 'test-agent',
      message: {
        type: 'test-message',
        payload: { data: 'test data', number: 42 },
      },
    };

    const response = await toolHandler(args, toolContext);

    expect(response).toMatchObject({
      status: 'success',
      receivedMessage: {
        type: 'test-message',
        payload: { data: 'test data', number: 42 },
      },
      agentId: 'test-agent',
    });
    expect(response).toHaveProperty('timestamp');
  });

  it('should return NOT_FOUND error for unregistered agent', async () => {
    // Create tool context
    const toolContext: ToolContext = {
      runId: 'test-run-id',
      correlationId: 'test-correlation-id',
      logger: logger.child({ test: true }),
      abortSignal: new AbortController().signal,
    };

    // Call the tool handler directly
    const args = {
      targetAgentId: 'non-existent-agent',
      message: {
        type: 'test-message',
        payload: { data: 'test data' },
      },
    };

    await expect(toolHandler(args, toolContext)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Agent with ID "non-existent-agent" is not registered',
      details: {
        targetAgentId: 'non-existent-agent',
        messageType: 'test-message',
      },
    });
  });

  it('should reject oversized payload with RESOURCE_EXHAUSTED', async () => {
    // Register a test agent
    const testHandler: AgentHandler = async (message: AgentMessage) => {
      return { status: 'success', receivedMessage: message };
    };

    agentCoordinator.registerAgent('test-agent', testHandler);

    // Create tool context
    const toolContext: ToolContext = {
      runId: 'test-run-id',
      correlationId: 'test-correlation-id',
      logger: logger.child({ test: true }),
      abortSignal: new AbortController().signal,
    };

    // Create a large payload that exceeds the default limit (1MB)
    const largePayload = 'x'.repeat(2 * 1024 * 1024); // 2MB string

    const args = {
      targetAgentId: 'test-agent',
      message: {
        type: 'test-message',
        payload: { largeData: largePayload },
      },
    };

    await expect(toolHandler(args, toolContext)).rejects.toMatchObject({
      code: 'RESOURCE_EXHAUSTED',
      message: 'Message payload size exceeds maximum allowed size',
      details: {
        reason: 'payload_size_exceeded',
      },
    });
  });

  it('should handle complex message payloads', async () => {
    // Register a test agent
    const testHandler: AgentHandler = async (message: AgentMessage, context: AgentContext) => {
      return {
        status: 'processed',
        messageType: message.type,
        payloadKeys: Object.keys(message.payload as Record<string, unknown>),
        agentId: context.agentId,
      };
    };

    agentCoordinator.registerAgent('complex-agent', testHandler);

    // Create tool context
    const toolContext: ToolContext = {
      runId: 'test-run-id',
      correlationId: 'test-correlation-id',
      logger: logger.child({ test: true }),
      abortSignal: new AbortController().signal,
    };

    // Call with complex payload
    const args = {
      targetAgentId: 'complex-agent',
      message: {
        type: 'complex-message',
        payload: {
          requirements: ['req1', 'req2', 'req3'],
          constraints: { budget: 10000, timeline: '3 months' },
          metadata: { priority: 'high', tags: ['urgent', 'customer-facing'] },
          nested: {
            deep: {
              value: 'test',
              array: [1, 2, 3],
            },
          },
        },
      },
    };

    const response = await toolHandler(args, toolContext);

    expect(response).toEqual({
      status: 'processed',
      messageType: 'complex-message',
      payloadKeys: ['requirements', 'constraints', 'metadata', 'nested'],
      agentId: 'complex-agent',
    });
  });

  it('should handle agent errors gracefully', async () => {
    // Register a test agent that throws an error
    const errorHandler: AgentHandler = async () => {
      throw new Error('Agent processing failed');
    };

    agentCoordinator.registerAgent('error-agent', errorHandler);

    // Create tool context
    const toolContext: ToolContext = {
      runId: 'test-run-id',
      correlationId: 'test-correlation-id',
      logger: logger.child({ test: true }),
      abortSignal: new AbortController().signal,
    };

    const args = {
      targetAgentId: 'error-agent',
      message: {
        type: 'test-message',
        payload: { data: 'test data' },
      },
    };

    // The tool should propagate the agent error as an INTERNAL error
    await expect(toolHandler(args, toolContext)).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'Failed to send message to agent',
      details: {
        targetAgentId: 'error-agent',
        messageType: 'test-message',
        originalError: 'Agent processing failed',
      },
    });
  });
});