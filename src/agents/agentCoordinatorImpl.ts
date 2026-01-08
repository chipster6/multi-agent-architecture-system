/**
 * Agent Coordinator Implementation
 * 
 * Provides the concrete implementation of the AgentCoordinator interface.
 * Manages agent registration, message routing, and per-agent state.
 * 
 * For v0.1, all state is maintained in-memory. Future versions will support
 * persistence and the full Agent-to-Agent Communication Protocol (AACP).
 */

import { randomUUID } from 'node:crypto';

import type { CoordinatorMemory } from '../coordinator/memory/coordinatorMemory.js';
import { ErrorCode, type StructuredError } from '../errors/index.js';
import type { StructuredLogger } from '../logging/structuredLogger.js';
import type { AACPLedger, AACPSessionManager } from '../aacp/interfaces.js';
import type { AACPEnvelope } from '../aacp/types.js';
import { AACPOutcome } from '../aacp/types.js';
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
    messageId: string;
    requestId?: string;
    aacpEnvelope?: AACPEnvelope | null;
    enqueuedAt: number;
    resolve: (response: AgentResponse) => void;
    reject: (error: Error) => void;
  }>;
  isProcessing: boolean;
}

interface AgentCoordinatorOptions {
  memory?: CoordinatorMemory;
  aacp?: {
    ledger: AACPLedger;
    sessionManager: AACPSessionManager;
  };
  idFactory?: () => string;
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
  private readonly agents: Map<string, RegisteredAgent> = new Map();
  private readonly logger: StructuredLogger;
  private readonly memory: CoordinatorMemory | undefined;
  private readonly aacp: {
    ledger: AACPLedger;
    sessionManager: AACPSessionManager;
  } | undefined;
  private readonly idFactory: () => string;

  /**
   * Creates a new AgentCoordinator instance.
   * 
   * @param logger Structured logger for logging coordinator operations
   */
  constructor(logger: StructuredLogger, options: AgentCoordinatorOptions = {}) {
    this.logger = logger;
    this.memory = options.memory;
    this.aacp = options.aacp;
    this.idFactory = options.idFactory ?? randomUUID;
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

    const sourceAgentId = message.sourceAgentId ?? 'system';
    let messageId = this.idFactory();
    let requestId: string | undefined;
    let aacpEnvelope: AACPEnvelope | null = null;
    if (this.aacp) {
      const init = await this.initializeAacpMessage(sourceAgentId, targetAgentId, message);
      if (init) {
        messageId = init.messageId;
        requestId = init.requestId;
        aacpEnvelope = init.envelope;
      }
    }
    const enqueuedAt = Date.now();

    // Create a promise for this message
    return new Promise<AgentResponse>((resolve, reject) => {
      // Add message to queue
      const queueEntry: RegisteredAgent['messageQueue'][number] = {
        message,
        messageId,
        aacpEnvelope,
        enqueuedAt,
        resolve,
        reject,
      };
      if (requestId !== undefined) {
        queueEntry.requestId = requestId;
      }
      agent.messageQueue.push(queueEntry);

      this.logger.debug('Message queued for agent', {
        targetAgentId,
        messageType: message.type,
        sourceAgentId: message.sourceAgentId,
        queueLength: agent.messageQueue.length,
      });

      // Process queue if not already processing
      void this.processAgentQueue(agent);
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
  onMessageReceived?: (targetAgentId: string, message: AgentMessage, messageId: string) => void;
  onMessageCompleted?: (
    targetAgentId: string,
    message: AgentMessage,
    messageId: string,
    response: AgentResponse,
    durationMs: number
  ) => void;
  onMessageFailed?: (
    targetAgentId: string,
    message: AgentMessage,
    messageId: string,
    error: Error,
    durationMs: number
  ) => void;

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

        const { message, resolve, reject, messageId, requestId, enqueuedAt, aacpEnvelope } = item;
        const startedAt = Date.now();
        const sourceAgentId = message.sourceAgentId ?? 'system';

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

          if (this.onMessageReceived) {
            this.onMessageReceived(agent.id, message, messageId);
          }

          await this.safeAacpAcknowledge(sourceAgentId, agent.id, aacpEnvelope?.seq);

          // Execute handler
          const response = await agent.handler(message, context);

          // Notify state change if callback is registered
          if (this.onStateChange) {
            this.onStateChange(agent.id, agent.state);
          }

          if (requestId && this.aacp) {
            await this.safeMarkAacpCompleted(requestId);
          }

          const durationMs = Date.now() - startedAt;
          if (this.onMessageCompleted) {
            this.onMessageCompleted(agent.id, message, messageId, response, durationMs);
          }

          await this.safeRecordMessageSummary({
            messageId,
            sourceAgentId,
            targetAgentId: agent.id,
            messageType: message.type,
            durationMs,
            enqueuedAt,
            startedAt,
            response,
            payload: message.payload,
            aacpEnvelope: aacpEnvelope ?? null,
          });

          this.logger.debug('Message processed successfully', {
            agentId: agent.id,
            messageType: message.type,
            sourceAgentId: message.sourceAgentId,
          });

          resolve(response);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          const durationMs = Date.now() - startedAt;

          this.logger.error('Error processing message for agent', {
            agentId: agent.id,
            messageType: message.type,
            sourceAgentId: message.sourceAgentId,
            error: {
              name: error instanceof Error ? error.name : 'Unknown',
              message: errorMessage,
            },
          });

          const errorObject = error instanceof Error ? error : new Error(errorMessage);
          if (this.onMessageFailed) {
            this.onMessageFailed(agent.id, message, messageId, errorObject, durationMs);
          }

          if (requestId && this.aacp) {
            await this.safeMarkAacpFailed(requestId, errorObject);
          }

          await this.safeRecordMessageFailure({
            messageId,
            sourceAgentId,
            targetAgentId: agent.id,
            messageType: message.type,
            durationMs,
            enqueuedAt,
            startedAt,
            error: errorObject,
            payload: message.payload,
          });

          reject(errorObject);
        }
      }
    } finally {
      agent.isProcessing = false;
    }
  }

  private async initializeAacpMessage(
    sourceAgentId: string,
    targetAgentId: string,
    message: AgentMessage
  ): Promise<{ messageId: string; requestId?: string; envelope: AACPEnvelope | null } | null> {
    if (!this.aacp) {
      return null;
    }

    try {
      const session = await this.aacp.sessionManager.createSession(sourceAgentId, targetAgentId);
      const messageId = await session.sendMessage(
        {
          messageType: message.type,
          payload: message.payload,
        },
        'REQUEST'
      );

      const record = await this.aacp.ledger.getByMessageId(messageId);
      const result: { messageId: string; requestId?: string; envelope: AACPEnvelope | null } = {
        messageId,
        envelope: record?.envelope ?? null,
      };
      if (record?.requestId !== undefined) {
        result.requestId = record.requestId;
      }
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to initialize AACP message', {
        sourceAgentId,
        targetAgentId,
        error: {
          name: error instanceof Error ? error.name : 'Unknown',
          message: errorMessage,
        },
      });
      return null;
    }
  }

  private async safeAacpAcknowledge(
    sourceAgentId: string,
    targetAgentId: string,
    seq?: number
  ): Promise<void> {
    if (!this.aacp || seq === undefined) {
      return;
    }
    try {
      const session = await this.aacp.sessionManager.createSession(sourceAgentId, targetAgentId);
      await session.acknowledgeMessage(seq);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to acknowledge AACP message', {
        sourceAgentId,
        targetAgentId,
        seq,
        error: {
          name: error instanceof Error ? error.name : 'Unknown',
          message: errorMessage,
        },
      });
    }
  }

  private async safeMarkAacpCompleted(requestId: string): Promise<void> {
    if (!this.aacp) {
      return;
    }
    try {
      await this.aacp.ledger.markCompleted(requestId, AACPOutcome.COMPLETED);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to mark AACP request completed', {
        requestId,
        error: {
          name: error instanceof Error ? error.name : 'Unknown',
          message: errorMessage,
        },
      });
    }
  }

  private async safeMarkAacpFailed(requestId: string, error: Error): Promise<void> {
    if (!this.aacp) {
      return;
    }
    const structuredError: StructuredError = {
      code: ErrorCode.Internal,
      message: error.message,
      details: {
        name: error.name,
      },
    };
    try {
      await this.aacp.ledger.markFailed(requestId, structuredError);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn('Failed to mark AACP request failed', {
        requestId,
        error: {
          name: err instanceof Error ? err.name : 'Unknown',
          message: errorMessage,
        },
      });
    }
  }

  private async safeRecordMessageSummary(input: {
    messageId: string;
    sourceAgentId: string;
    targetAgentId: string;
    messageType: string;
    durationMs: number;
    enqueuedAt: number;
    startedAt: number;
    response: AgentResponse;
    payload: unknown;
    aacpEnvelope: AACPEnvelope | null;
  }): Promise<void> {
    if (!this.memory) {
      return;
    }
    const summaryText = [
      `Message ${input.messageId} (${input.messageType})`,
      `from ${input.sourceAgentId} to ${input.targetAgentId}`,
      `completed in ${input.durationMs}ms`,
    ].join(' ');
    const payload = {
      request: input.payload,
      response: input.response,
      timings: {
        enqueuedAt: new Date(input.enqueuedAt).toISOString(),
        startedAt: new Date(input.startedAt).toISOString(),
        durationMs: input.durationMs,
      },
      aacpEnvelope: input.aacpEnvelope,
    };
    try {
      await this.memory.recordMessageSummary({
        id: input.messageId,
        sourceAgentId: input.sourceAgentId,
        targetAgentId: input.targetAgentId,
        messageType: input.messageType,
        summaryText,
        payload,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to record message summary', {
        messageId: input.messageId,
        error: {
          name: error instanceof Error ? error.name : 'Unknown',
          message: errorMessage,
        },
      });
    }
  }

  private async safeRecordMessageFailure(input: {
    messageId: string;
    sourceAgentId: string;
    targetAgentId: string;
    messageType: string;
    durationMs: number;
    enqueuedAt: number;
    startedAt: number;
    error: Error;
    payload: unknown;
  }): Promise<void> {
    if (!this.memory) {
      return;
    }
    const summaryText = [
      `Message ${input.messageId} (${input.messageType})`,
      `from ${input.sourceAgentId} to ${input.targetAgentId}`,
      `failed in ${input.durationMs}ms`,
      `error=${input.error.message}`,
    ].join(' ');
    const payload = {
      request: input.payload,
      error: {
        name: input.error.name,
        message: input.error.message,
      },
      timings: {
        enqueuedAt: new Date(input.enqueuedAt).toISOString(),
        startedAt: new Date(input.startedAt).toISOString(),
        durationMs: input.durationMs,
      },
    };
    try {
      await this.memory.recordMessageSummary({
        id: input.messageId,
        sourceAgentId: input.sourceAgentId,
        targetAgentId: input.targetAgentId,
        messageType: `${input.messageType}.failed`,
        summaryText,
        payload,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to record message failure summary', {
        messageId: input.messageId,
        error: {
          name: error instanceof Error ? error.name : 'Unknown',
          message: errorMessage,
        },
      });
    }
  }
}
