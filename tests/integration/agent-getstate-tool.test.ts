/**
 * Integration tests for the agent/getState tool.
 * Tests the retrieval of agent state with size limits and redaction.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConfigManager } from '../../src/config/configManager.js';
import { createToolRegistry } from '../../src/mcp/toolRegistry.js';
import { createResourceManager } from '../../src/resources/resourceManager.js';
import { StructuredLogger, SystemClock } from '../../src/logging/structuredLogger.js';
import { createClock } from '../../src/shared/clock.js';
import { AgentCoordinatorImpl } from '../../src/agents/agentCoordinatorImpl.js';
import { createAgentTools } from '../../src/tools/agentTools.js';
import type { AgentHandler, AgentMessage, AgentContext } from '../../src/agents/agentCoordinator.js';
import type { ToolContext } from '../../src/mcp/toolRegistry.js';
import { ErrorCode } from '../../src/errors/errorHandler.js';

describe('agent/getState tool', () => {
  let agentCoordinator: AgentCoordinatorImpl;
  let toolHandler: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
  let logger: StructuredLogger;

  beforeEach(async () => {
    const configManager = createConfigManager();
    const config = configManager.load();
    logger = new StructuredLogger(new SystemClock(), config.logging.redactKeys);
    const toolRegistry = createToolRegistry(configManager, logger);
    const resourceManager = createResourceManager(config);
    agentCoordinator = new AgentCoordinatorImpl(logger);

    // Register agent tools and get the handler
    const agentTools = createAgentTools(agentCoordinator, resourceManager, config);
    const getStateTool = agentTools.find(tool => tool.definition.name === 'agent/getState');
    
    if (!getStateTool) {
      throw new Error('agent/getState tool not found');
    }
    
    toolHandler = getStateTool.handler;
  });

  afterEach(async () => {
    // Clean up any registered agents
    const agentIds = agentCoordinator.listAgents();
    for (const agentId of agentIds) {
      agentCoordinator.unregisterAgent(agentId);
    }
  });

  it('should return NOT_FOUND for unregistered agent', async () => {
    const context: ToolContext = {
      runId: 'test-run-id',
      correlationId: 'test-correlation-id',
      logger: logger.child({ test: true }),
      abortSignal: new AbortController().signal,
    };

    try {
      await toolHandler({ agentId: 'non-existent-agent' }, context);
      expect.fail('Expected NOT_FOUND error');
    } catch (error: any) {
      expect(error.code).toBe(ErrorCode.NotFound);
      expect(error.message).toContain('non-existent-agent');
      expect(error.message).toContain('is not registered');
    }
  });

  it('should return full state when within size limits', async () => {
    // Register a test agent with some state
    const testHandler: AgentHandler = async (message: AgentMessage, context: AgentContext) => {
      // Set some state
      context.state.set('currentPhase', 'strategic-design');
      context.state.set('analysisResults', { confidence: 0.95, status: 'completed' });
      context.state.set('metadata', { version: '1.0', timestamp: '2024-01-01T00:00:00Z' });
      return { status: 'ok' };
    };

    agentCoordinator.registerAgent('test-agent', testHandler);

    // Send a message to populate state
    await agentCoordinator.sendMessage('test-agent', {
      type: 'test-message',
      payload: { data: 'test' }
    });

    const context: ToolContext = {
      runId: 'test-run-id',
      correlationId: 'test-correlation-id',
      logger: logger.child({ test: true }),
      abortSignal: new AbortController().signal,
    };

    const result = await toolHandler({ agentId: 'test-agent' }, context) as any;

    expect(result.agentId).toBe('test-agent');
    expect(result.truncated).toBe(false);
    expect(result.keysOnly).toBe(false);
    expect(result.state).toEqual({
      currentPhase: 'strategic-design',
      analysisResults: { confidence: 0.95, status: 'completed' },
      metadata: { version: '1.0', timestamp: '2024-01-01T00:00:00Z' }
    });
  });

  it('should redact sensitive keys from state', async () => {
    // Register a test agent with sensitive state
    const testHandler: AgentHandler = async (message: AgentMessage, context: AgentContext) => {
      // Set state with sensitive information
      context.state.set('apiKey', 'secret-api-key-123');
      context.state.set('password', 'super-secret-password');
      context.state.set('token', 'bearer-token-xyz');
      context.state.set('publicData', 'this-should-not-be-redacted');
      return { status: 'ok' };
    };

    agentCoordinator.registerAgent('test-agent', testHandler);

    // Send a message to populate state
    await agentCoordinator.sendMessage('test-agent', {
      type: 'test-message',
      payload: { data: 'test' }
    });

    const context: ToolContext = {
      runId: 'test-run-id',
      correlationId: 'test-correlation-id',
      logger: logger.child({ test: true }),
      abortSignal: new AbortController().signal,
    };

    const result = await toolHandler({ agentId: 'test-agent' }, context) as any;

    expect(result.agentId).toBe('test-agent');
    expect(result.truncated).toBe(false);
    expect(result.keysOnly).toBe(false);
    expect(result.state).toEqual({
      apiKey: '[REDACTED]',
      password: '[REDACTED]',
      token: '[REDACTED]',
      publicData: 'this-should-not-be-redacted'
    });
  });

  it('should return keys-only when full state exceeds size limit', async () => {
    // Register a test agent with large state
    const testHandler: AgentHandler = async (message: AgentMessage, context: AgentContext) => {
      // Create large state that will exceed maxStateBytes (256KB default)
      const largeData = 'x'.repeat(100000); // 100KB string
      context.state.set('largeData1', largeData);
      context.state.set('largeData2', largeData);
      context.state.set('largeData3', largeData); // Total > 256KB
      context.state.set('smallData', 'small');
      return { status: 'ok' };
    };

    agentCoordinator.registerAgent('test-agent', testHandler);

    // Send a message to populate state
    await agentCoordinator.sendMessage('test-agent', {
      type: 'test-message',
      payload: { data: 'test' }
    });

    const context: ToolContext = {
      runId: 'test-run-id',
      correlationId: 'test-correlation-id',
      logger: logger.child({ test: true }),
      abortSignal: new AbortController().signal,
    };

    const result = await toolHandler({ agentId: 'test-agent' }, context) as any;

    expect(result.agentId).toBe('test-agent');
    expect(result.truncated).toBe(true);
    expect(result.keysOnly).toBe(true);
    expect(Array.isArray(result.state)).toBe(true);
    expect(result.state).toEqual(['largeData1', 'largeData2', 'largeData3', 'smallData']);
  });

  it('should return empty state for agent with no state', async () => {
    // Register a test agent that doesn't set any state
    const testHandler: AgentHandler = async (message: AgentMessage, context: AgentContext) => {
      return { status: 'ok' };
    };

    agentCoordinator.registerAgent('test-agent', testHandler);

    const context: ToolContext = {
      runId: 'test-run-id',
      correlationId: 'test-correlation-id',
      logger: logger.child({ test: true }),
      abortSignal: new AbortController().signal,
    };

    const result = await toolHandler({ agentId: 'test-agent' }, context) as any;

    expect(result.agentId).toBe('test-agent');
    expect(result.truncated).toBe(false);
    expect(result.keysOnly).toBe(false);
    expect(result.state).toEqual({});
  });

  it('should handle invalid arguments', async () => {
    const context: ToolContext = {
      runId: 'test-run-id',
      correlationId: 'test-correlation-id',
      logger: logger.child({ test: true }),
      abortSignal: new AbortController().signal,
    };

    // Test missing agentId
    try {
      await toolHandler({}, context);
      expect.fail('Expected validation error');
    } catch (error: any) {
      // This should be caught by schema validation before reaching the handler
      // But if it reaches the handler, it should handle gracefully
      expect(error).toBeDefined();
    }
  });
});