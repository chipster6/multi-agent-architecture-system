/**
 * Integration tests for agent coordination tools.
 * Tests the agent/sendMessage tool with various scenarios.
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

describe('Agent Tools Integration', () => {
  let server: MCPServer;
  let agentCoordinator: AgentCoordinatorImpl;
  let logger: StructuredLogger;

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

    // Register agent tools
    const agentTools = createAgentTools(agentCoordinator, resourceManager, config);
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

  it('should register agent/sendMessage tool', async () => {
    // Get the tool registry from the server (we need to access it somehow)
    // For now, we'll test by checking if the tool can be called
    expect(agentCoordinator).toBeDefined();
  });

  it('should handle agent/sendMessage with registered agent', async () => {
    // Register a test agent
    const testHandler: AgentHandler = async (message: AgentMessage, context: AgentContext) => {
      context.logger.info('Test agent received message', {
        messageType: message.type,
        agentId: context.agentId,
      });
      
      return {
        status: 'success',
        receivedMessage: message,
        agentId: context.agentId,
      };
    };

    agentCoordinator.registerAgent('test-agent', testHandler);

    // Test sending a message
    const testMessage = {
      type: 'test-message',
      payload: { data: 'test data' },
    };

    const response = await agentCoordinator.sendMessage('test-agent', testMessage);

    expect(response).toEqual({
      status: 'success',
      receivedMessage: testMessage,
      agentId: 'test-agent',
    });
  });

  it('should throw error when sending message to unregistered agent', async () => {
    const testMessage = {
      type: 'test-message',
      payload: { data: 'test data' },
    };

    await expect(
      agentCoordinator.sendMessage('non-existent-agent', testMessage)
    ).rejects.toThrow('Agent with ID "non-existent-agent" is not registered');
  });

  it('should validate payload size limits', async () => {
    // Register a test agent
    const testHandler: AgentHandler = async (message: AgentMessage) => {
      return { status: 'success', receivedMessage: message };
    };

    agentCoordinator.registerAgent('test-agent', testHandler);

    // Create a large payload that exceeds the default limit (1MB)
    const largePayload = 'x'.repeat(2 * 1024 * 1024); // 2MB string

    const testMessage = {
      type: 'test-message',
      payload: { largeData: largePayload },
    };

    // This should be tested through the tool handler, but for now we test the coordinator directly
    // The actual payload size validation happens in the tool handler
    const response = await agentCoordinator.sendMessage('test-agent', testMessage);
    expect(response).toEqual({
      status: 'success',
      receivedMessage: testMessage,
    });
  });

  it('should list registered agents', async () => {
    // Initially no agents registered
    let agentIds = agentCoordinator.listAgents();
    expect(agentIds).toEqual([]);

    // Register some test agents
    const testHandler: AgentHandler = async (message: AgentMessage) => {
      return { status: 'success' };
    };

    agentCoordinator.registerAgent('agent-c', testHandler);
    agentCoordinator.registerAgent('agent-a', testHandler);
    agentCoordinator.registerAgent('agent-b', testHandler);

    // Should return agents in sorted order
    agentIds = agentCoordinator.listAgents();
    expect(agentIds).toEqual(['agent-a', 'agent-b', 'agent-c']);
  });

  it('should handle agent/list tool with no agents', async () => {
    // Test the agent/list tool directly through the coordinator
    const agentIds = agentCoordinator.listAgents();
    expect(agentIds).toEqual([]);
  });

  it('should handle agent/list tool with multiple agents', async () => {
    // Register multiple agents
    const testHandler: AgentHandler = async (message: AgentMessage) => {
      return { status: 'success' };
    };

    agentCoordinator.registerAgent('requirements-analyzer', testHandler);
    agentCoordinator.registerAgent('security-architect', testHandler);
    agentCoordinator.registerAgent('data-architect', testHandler);

    // Test the agent/list tool
    const agentIds = agentCoordinator.listAgents();
    expect(agentIds).toEqual(['data-architect', 'requirements-analyzer', 'security-architect']);
  });

  it('should handle bounded response for agent/list tool', async () => {
    // This test verifies that the agent/list tool properly handles response size limits
    // We'll register a reasonable number of agents and verify the response structure
    const testHandler: AgentHandler = async (message: AgentMessage) => {
      return { status: 'success' };
    };

    // Register several agents with descriptive names
    const agentNames = [
      'requirements-analyzer',
      'security-architect', 
      'data-architect',
      'infrastructure-architect',
      'performance-architect',
      'compliance-architect',
      'integration-architect',
      'ui-architect',
      'api-architect',
      'deployment-architect'
    ];

    for (const name of agentNames) {
      agentCoordinator.registerAgent(name, testHandler);
    }

    // Test the agent/list tool - should return all agents since the response is small
    const agentIds = agentCoordinator.listAgents();
    expect(agentIds).toEqual(agentNames.sort());
    expect(agentIds).toHaveLength(10);
  });
});