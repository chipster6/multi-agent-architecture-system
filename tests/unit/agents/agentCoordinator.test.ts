/**
 * Unit tests for AgentCoordinator
 * 
 * Tests the core functionality of agent registration, message routing,
 * and state management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentCoordinatorImpl } from '../../../src/agents/agentCoordinatorImpl.js';
import type { AgentHandler, AgentMessage, AgentContext } from '../../../src/agents/agentCoordinator.js';
import { StructuredLogger } from '../../../src/logging/structuredLogger.js';
import { Clock } from '../../../src/shared/clock.js';

// Mock logger for testing
class MockLogger implements StructuredLogger {
  debug = vi.fn();
  info = vi.fn();
  warn = vi.fn();
  error = vi.fn();
  child = vi.fn(() => this);
  redact = vi.fn((obj) => obj);
  sanitize = vi.fn((str) => str);
}

describe('AgentCoordinatorImpl', () => {
  let coordinator: AgentCoordinatorImpl;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = new MockLogger();
    coordinator = new AgentCoordinatorImpl(mockLogger as unknown as StructuredLogger);
  });

  describe('registerAgent', () => {
    it('should register an agent successfully', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      expect(() => {
        coordinator.registerAgent('test-agent', handler);
      }).not.toThrow();

      // Verify the agent was registered by checking we can get its state
      const state = coordinator.getAgentState('test-agent');
      expect(state).toBeDefined();
      expect(state).toBeInstanceOf(Map);
    });

    it('should throw error when registering duplicate agent ID', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      coordinator.registerAgent('test-agent', handler);

      expect(() => {
        coordinator.registerAgent('test-agent', handler);
      }).toThrow(`Agent with ID "test-agent" is already registered`);
    });

    it('should log duplicate registration attempt at WARN level', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      coordinator.registerAgent('test-agent', handler);

      try {
        coordinator.registerAgent('test-agent', handler);
      } catch {
        // Expected to throw
      }

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Duplicate agent registration attempted',
        expect.objectContaining({
          agentId: 'test-agent',
        })
      );
    });

    it('should log successful registration at INFO level', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      coordinator.registerAgent('test-agent', handler);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Agent registered',
        expect.objectContaining({
          agentId: 'test-agent',
          totalAgents: 1,
        })
      );
    });

    it('should allow registering multiple agents with different IDs', () => {
      const handler1: AgentHandler = async () => ({ status: 'ok' });
      const handler2: AgentHandler = async () => ({ status: 'ok' });

      coordinator.registerAgent('agent-1', handler1);
      coordinator.registerAgent('agent-2', handler2);

      expect(coordinator.getAgentState('agent-1')).toBeDefined();
      expect(coordinator.getAgentState('agent-2')).toBeDefined();
    });

    it('should initialize agent state as empty Map', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      coordinator.registerAgent('test-agent', handler);

      const state = coordinator.getAgentState('test-agent');
      expect(state?.size).toBe(0);
    });

    it('should make agent available for receiving messages immediately', async () => {
      const handler: AgentHandler = async (message, context) => {
        return { received: message.type };
      };

      coordinator.registerAgent('test-agent', handler);

      const response = await coordinator.sendMessage('test-agent', {
        type: 'test-message',
        payload: { data: 'test' },
      });

      expect(response).toEqual({ received: 'test-message' });
    });

    it('should preserve handler function reference', async () => {
      const handlerCalls: AgentMessage[] = [];
      const handler: AgentHandler = async (message) => {
        handlerCalls.push(message);
        return { ok: true };
      };

      coordinator.registerAgent('test-agent', handler);

      await coordinator.sendMessage('test-agent', {
        type: 'message-1',
        payload: {},
      });

      expect(handlerCalls).toHaveLength(1);
      expect(handlerCalls[0].type).toBe('message-1');
    });

    it('should handle special characters in agent ID', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });
      const specialId = 'agent-with-dashes_and_underscores.123';

      coordinator.registerAgent(specialId, handler);

      expect(coordinator.getAgentState(specialId)).toBeDefined();
    });

    it('should throw error with descriptive message for duplicate', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });
      const agentId = 'my-special-agent';

      coordinator.registerAgent(agentId, handler);

      expect(() => {
        coordinator.registerAgent(agentId, handler);
      }).toThrow(`Agent with ID "${agentId}" is already registered`);
    });

    it('should update total agents count in log', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      coordinator.registerAgent('agent-1', handler);
      expect(mockLogger.info).toHaveBeenLastCalledWith(
        'Agent registered',
        expect.objectContaining({ totalAgents: 1 })
      );

      coordinator.registerAgent('agent-2', handler);
      expect(mockLogger.info).toHaveBeenLastCalledWith(
        'Agent registered',
        expect.objectContaining({ totalAgents: 2 })
      );
    });
  });

  describe('unregisterAgent', () => {
    it('should unregister a registered agent', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      coordinator.registerAgent('test-agent', handler);
      const result = coordinator.unregisterAgent('test-agent');

      expect(result).toBe(true);
      expect(coordinator.getAgentState('test-agent')).toBeUndefined();
    });

    it('should return false when unregistering non-existent agent', () => {
      const result = coordinator.unregisterAgent('non-existent');

      expect(result).toBe(false);
    });

    it('should log unregistration at INFO level', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      coordinator.registerAgent('test-agent', handler);
      coordinator.unregisterAgent('test-agent');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Agent unregistered',
        expect.objectContaining({
          agentId: 'test-agent',
          totalAgents: 0,
        })
      );
    });
  });

  describe('sendMessage', () => {
    it('should throw error when sending to unregistered agent', async () => {
      await expect(
        coordinator.sendMessage('non-existent', {
          type: 'test',
          payload: {},
        })
      ).rejects.toThrow(`Agent with ID "non-existent" is not registered`);
    });

    it('should process messages sequentially per agent (FIFO)', async () => {
      const results: string[] = [];
      const handler: AgentHandler = async (message) => {
        results.push(message.type);
        return { ok: true };
      };

      coordinator.registerAgent('test-agent', handler);

      await Promise.all([
        coordinator.sendMessage('test-agent', { type: 'msg-1', payload: {} }),
        coordinator.sendMessage('test-agent', { type: 'msg-2', payload: {} }),
        coordinator.sendMessage('test-agent', { type: 'msg-3', payload: {} }),
      ]);

      expect(results).toEqual(['msg-1', 'msg-2', 'msg-3']);
    });

    it('should process messages concurrently across different agents', async () => {
      const results: string[] = [];
      const handler: AgentHandler = async (message) => {
        results.push(message.type);
        return { ok: true };
      };

      coordinator.registerAgent('agent-1', handler);
      coordinator.registerAgent('agent-2', handler);

      await Promise.all([
        coordinator.sendMessage('agent-1', { type: 'msg-1', payload: {} }),
        coordinator.sendMessage('agent-2', { type: 'msg-2', payload: {} }),
      ]);

      // Both messages should be processed (order may vary due to concurrency)
      expect(results).toContain('msg-1');
      expect(results).toContain('msg-2');
      expect(results).toHaveLength(2);
    });

    it('should return handler response', async () => {
      const handler: AgentHandler = async () => ({
        status: 'completed',
        data: { result: 42 },
      });

      coordinator.registerAgent('test-agent', handler);

      const response = await coordinator.sendMessage('test-agent', {
        type: 'test',
        payload: {},
      });

      expect(response).toEqual({
        status: 'completed',
        data: { result: 42 },
      });
    });

    it('should propagate handler errors', async () => {
      const handler: AgentHandler = async () => {
        throw new Error('Handler error');
      };

      coordinator.registerAgent('test-agent', handler);

      await expect(
        coordinator.sendMessage('test-agent', {
          type: 'test',
          payload: {},
        })
      ).rejects.toThrow('Handler error');
    });

    it('should provide agent context to handler', async () => {
      let receivedContext: AgentContext | null = null;

      const handler: AgentHandler = async (message, context) => {
        receivedContext = context;
        return { ok: true };
      };

      coordinator.registerAgent('test-agent', handler);

      await coordinator.sendMessage('test-agent', {
        type: 'test',
        payload: {},
      });

      expect(receivedContext).toBeDefined();
      expect(receivedContext?.agentId).toBe('test-agent');
      expect(receivedContext?.state).toBeInstanceOf(Map);
      expect(receivedContext?.logger).toBeDefined();
    });
  });

  describe('getAgentState', () => {
    it('should return undefined for non-existent agent', () => {
      const state = coordinator.getAgentState('non-existent');

      expect(state).toBeUndefined();
    });

    it('should return agent state map', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      coordinator.registerAgent('test-agent', handler);

      const state = coordinator.getAgentState('test-agent');

      expect(state).toBeInstanceOf(Map);
    });

    it('should allow modifying agent state', async () => {
      const handler: AgentHandler = async (message, context) => {
        context.state.set('processed', true);
        return { ok: true };
      };

      coordinator.registerAgent('test-agent', handler);

      await coordinator.sendMessage('test-agent', {
        type: 'test',
        payload: {},
      });

      const state = coordinator.getAgentState('test-agent');
      expect(state?.get('processed')).toBe(true);
    });

    it('should persist state across multiple messages', async () => {
      let callCount = 0;

      const handler: AgentHandler = async (message, context) => {
        callCount++;
        const count = (context.state.get('count') as number) || 0;
        context.state.set('count', count + 1);
        return { count: count + 1 };
      };

      coordinator.registerAgent('test-agent', handler);

      await coordinator.sendMessage('test-agent', { type: 'msg-1', payload: {} });
      await coordinator.sendMessage('test-agent', { type: 'msg-2', payload: {} });
      await coordinator.sendMessage('test-agent', { type: 'msg-3', payload: {} });

      const state = coordinator.getAgentState('test-agent');
      expect(state?.get('count')).toBe(3);
    });
  });

  describe('listAgents', () => {
    it('should return empty array when no agents registered', () => {
      const agentIds = coordinator.listAgents();

      expect(agentIds).toEqual([]);
    });

    it('should return single agent ID when one agent registered', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      coordinator.registerAgent('test-agent', handler);

      const agentIds = coordinator.listAgents();

      expect(agentIds).toEqual(['test-agent']);
    });

    it('should return multiple agent IDs sorted lexicographically', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      // Register in non-alphabetical order
      coordinator.registerAgent('zebra-agent', handler);
      coordinator.registerAgent('alpha-agent', handler);
      coordinator.registerAgent('beta-agent', handler);

      const agentIds = coordinator.listAgents();

      expect(agentIds).toEqual(['alpha-agent', 'beta-agent', 'zebra-agent']);
    });

    it('should update list when agents are unregistered', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      coordinator.registerAgent('agent-1', handler);
      coordinator.registerAgent('agent-2', handler);
      coordinator.registerAgent('agent-3', handler);

      expect(coordinator.listAgents()).toEqual(['agent-1', 'agent-2', 'agent-3']);

      coordinator.unregisterAgent('agent-2');

      expect(coordinator.listAgents()).toEqual(['agent-1', 'agent-3']);
    });

    it('should handle special characters in agent IDs correctly', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      coordinator.registerAgent('agent-with-dashes', handler);
      coordinator.registerAgent('agent_with_underscores', handler);
      coordinator.registerAgent('agent.with.dots', handler);

      const agentIds = coordinator.listAgents();

      expect(agentIds).toEqual([
        'agent-with-dashes',
        'agent.with.dots',
        'agent_with_underscores'
      ]);
    });

    it('should return deterministic ordering across multiple calls', () => {
      const handler: AgentHandler = async () => ({ status: 'ok' });

      coordinator.registerAgent('c-agent', handler);
      coordinator.registerAgent('a-agent', handler);
      coordinator.registerAgent('b-agent', handler);

      const firstCall = coordinator.listAgents();
      const secondCall = coordinator.listAgents();
      const thirdCall = coordinator.listAgents();

      expect(firstCall).toEqual(secondCall);
      expect(secondCall).toEqual(thirdCall);
      expect(firstCall).toEqual(['a-agent', 'b-agent', 'c-agent']);
    });
  });

  describe('onStateChange callback', () => {
    it('should invoke callback when agent state changes', async () => {
      const stateChangeCallback = vi.fn();

      const handler: AgentHandler = async (message, context) => {
        context.state.set('key', 'value');
        return { ok: true };
      };

      coordinator.registerAgent('test-agent', handler);
      coordinator.onStateChange = stateChangeCallback;

      await coordinator.sendMessage('test-agent', {
        type: 'test',
        payload: {},
      });

      expect(stateChangeCallback).toHaveBeenCalledWith(
        'test-agent',
        expect.any(Map)
      );
    });

    it('should not invoke callback if not set', async () => {
      const handler: AgentHandler = async (message, context) => {
        context.state.set('key', 'value');
        return { ok: true };
      };

      coordinator.registerAgent('test-agent', handler);

      // Should not throw even though onStateChange is not set
      await expect(
        coordinator.sendMessage('test-agent', {
          type: 'test',
          payload: {},
        })
      ).resolves.toBeDefined();
    });
  });
});
