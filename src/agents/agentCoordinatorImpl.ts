/**
 * Agent Coordinator Implementation
 * 
 * Provides the concrete implementation of the AgentCoordinator interface.
 * Manages agent registration, message routing, and per-agent state.
 * 
 * For v0.1, all state is maintained in-memory. Future versions will support
 * persistence and the full Agent-to-Agent Communication Protocol (AACP).
 */

import { StructuredLogger } from '../logging/structuredLogger.js';
import type {
  AgentCoordinator,
  AgentHandler,
  AgentMessage,
  AgentContext,
  AgentResponse,
} from './agentCoordinator.js';

/**
 * Internal representation of a registered agent.
 * Tracks the handler and state for each agent.
 */
interface RegisteredAgent {
  id: string;
  handler: AgentHandler;
  state: Map<string, unknown>;
  messageQueue: Array<{
    message: AgentMessage;
    resolve: (response: AgentResponse) => void;
    reject: (error: Error) => void;
  }>;
  isProcessing: boolean;
}

/**
 * Concrete implementation of the AgentCoordinator interface.
 * 
 * Manages:
 * - Agent registration and lifecycle
 * - Per-agent FIFO message queues for sequential processing
 * - Agent state management
 * - Message routing between agents
 * 
 * @example
 * ```typescript
 * const coordinator = new AgentCoordinatorImpl(logger);
 * 
 * // Register agents
 * coordinator.registerAgent('requirements-analyzer', requirementsHandler);
 * coordinator.registerAgent('security-architect', securityHandler);
 * 
 * // Send messages
 * const response = await coordinator.sendMessage('security-architect', {
 *   type: 'review-architecture',
 *   payload: { architecture: {...} },
 *   sourceAgentId: 'requirements-analyzer'
 * });
 * ```
 */
export class AgentCoordinatorImpl implements AgentCoordinator {
  private agents: Map<string, RegisteredAgent> = new Map();
  private logger: StructuredLogger;

  /**
   * Creates a new AgentCoordinator instance.
   * 
   * @param logger Structured logger for logging coordinator operations
   */
  constructor(logger: StructuredLogger) {
    this.logger = logger;
  }

  /**
   * Registers an agent with the coordinator.
   * 
   * The agent becomes available for receiving messages immediately after registration.
   * Attempting to register an agent with a duplicate ID will throw an error.
   * 
   * @param id Unique identifier for the agent
   * @param handler Function to handle incoming messages for this agent
   * @throws Error if an agent with the same ID is already registered
   */
  registerAgent(id: string, handler: AgentHandler): void {
    // Check for duplicate registration
    if (this.agents.has(id)) {
      const error = new Error(`Agent with ID "${id}" is already registered`);
      this.logger.warn('Duplicate agent registration attempted', {
        agentId: id,
        error: {
          name: error.name,
          message: error.message,
        },
      });
      throw error;
    }

    // Create new agent entry
    const agent: RegisteredAgent = {
      id,
      handler,
      state: new Map(),
      messageQueue: [],
      isProcessing: false,
    };

    // Register the agent
    this.agents.set(id, agent);

    this.logger.info('Agent registered', {
      agentId: id,
      totalAgents: this.agents.size,
    });
  }

  /**
   * Unregisters an agent from the coordinator.
   * 
   * The agent will no longer receive messages after unregistration.
   * In-flight messages for the agent will complete normally.
   * 
   * @param id Unique identifier of the agent to unregister
   * @returns true if the agent was registered and has been unregistered, false if not found
   */
  unregisterAgent(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) {
      this.logger.debug('Attempted to unregister non-existent agent', {
        agentId: id,
      });
      return false;
    }

    this.agents.delete(id);

    this.logger.info('Agent unregistered', {
      agentId: id,
      totalAgents: this.agents.size,
    });

    return true;
  }

  /**
   * Sends a message to a target agent and waits for the response.
   * 
   * Messages are processed sequentially per agent (FIFO queue), ensuring
   * that messages from the same agent are processed in order. Different agents
   * may process messages concurrently.
   * 
   * @param targetAgentId Unique identifier of the target agent
   * @param message The message to send
   * @returns A promise resolving to the agent's response
   * @throws Error if the target agent is not registered
   */
  async sendMessage(targetAgentId: string, message: AgentMessage): Promise<AgentResponse> {
    const agent = this.agents.get(targetAgentId);
    if (!agent) {
      const error = new Error(`Agent with ID "${targetAgentId}" is not registered`);
      this.logger.warn('Message sent to unregistered agent', {
        targetAgentId,
        messageType: message.type,
        sourceAgentId: message.sourceAgentId,
        error: {
          name: error.name,
          message: error.message,
        },
      });
      throw error;
    }

    // Create a promise for this message
    return new Promise<AgentResponse>((resolve, reject) => {
      // Add message to queue
      agent.messageQueue.push({
        message,
        resolve,
        reject,
      });

      this.logger.debug('Message queued for agent', {
        targetAgentId,
        messageType: message.type,
        sourceAgentId: message.sourceAgentId,
        queueLength: agent.messageQueue.length,
      });

      // Process queue if not already processing
      this.processAgentQueue(agent);
    });
  }

  /**
   * Retrieves the current state of an agent.
   * 
   * Returns the agent's state map if the agent is registered, or undefined if not found.
   * The returned map is the actual state object (not a copy), so modifications will
   * affect the agent's state. Use with caution to avoid unintended side effects.
   * 
   * @param agentId Unique identifier of the agent
   * @returns The agent's state map, or undefined if the agent is not registered
   */
  getAgentState(agentId: string): Map<string, unknown> | undefined {
    const agent = this.agents.get(agentId);
    return agent?.state;
  }

  /**
   * Lists all registered agent IDs.
   * 
   * Returns an array of agent IDs for all currently registered agents.
   * The array is sorted lexicographically for deterministic ordering.
   * 
   * @returns Array of registered agent IDs, sorted alphabetically
   */
  listAgents(): string[] {
    return Array.from(this.agents.keys()).sort();
  }

  /**
   * Optional callback hook for state change notifications.
   * 
   * If provided, this callback will be invoked whenever an agent's state changes.
   * Useful for implementing state change listeners, persistence, or monitoring.
   */
  onStateChange?: (agentId: string, state: Map<string, unknown>) => void;

  /**
   * Processes the message queue for an agent sequentially.
   * 
   * Ensures that messages are processed one at a time per agent (FIFO order).
   * Different agents process messages concurrently.
   * 
   * @param agent The agent whose queue should be processed
   */
  private async processAgentQueue(agent: RegisteredAgent): Promise<void> {
    // If already processing, let the current processor handle the queue
    if (agent.isProcessing) {
      return;
    }

    agent.isProcessing = true;

    try {
      while (agent.messageQueue.length > 0) {
        const item = agent.messageQueue.shift();
        if (!item) {
          break;
        }

        const { message, resolve, reject } = item;

        try {
          // Create agent context
          const context: AgentContext = {
            agentId: agent.id,
            state: agent.state,
            logger: this.logger.child({
              agentId: agent.id,
              messageType: message.type,
              sourceAgentId: message.sourceAgentId,
            }),
          };

          this.logger.debug('Processing message for agent', {
            agentId: agent.id,
            messageType: message.type,
            sourceAgentId: message.sourceAgentId,
          });

          // Execute handler
          const response = await agent.handler(message, context);

          // Notify state change if callback is registered
          if (this.onStateChange) {
            this.onStateChange(agent.id, agent.state);
          }

          this.logger.debug('Message processed successfully', {
            agentId: agent.id,
            messageType: message.type,
            sourceAgentId: message.sourceAgentId,
          });

          resolve(response);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          this.logger.error('Error processing message for agent', {
            agentId: agent.id,
            messageType: message.type,
            sourceAgentId: message.sourceAgentId,
            error: {
              name: error instanceof Error ? error.name : 'Unknown',
              message: errorMessage,
            },
          });

          reject(error instanceof Error ? error : new Error(errorMessage));
        }
      }
    } finally {
      agent.isProcessing = false;
    }
  }
}
