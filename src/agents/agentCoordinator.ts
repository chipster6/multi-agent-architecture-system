/**
 * Agent Coordinator Module
 * 
 * Provides basic agent coordination capabilities for the Multi-Agent Architecture Design System.
 * This module defines the core interfaces and types for agent-to-agent communication and
 * coordination within the MCP server.
 * 
 * The Agent Coordinator enables:
 * - Agent registration and lifecycle management
 * - Message passing between registered agents
 * - Per-agent state management
 * - Sequential message processing per agent (FIFO queue)
 * - Concurrent processing across different agents
 * 
 * For v0.1, state is maintained in-memory only. Future iterations (v0.2+) will add
 * persistent storage and the full Agent-to-Agent Communication Protocol (AACP).
 */

import { StructuredLogger } from '../logging/structuredLogger.js';

/**
 * Message sent from one agent to another.
 * 
 * Agents communicate through typed messages with optional source identification.
 * The message type allows agents to route and handle different message categories,
 * while the payload carries the actual message content.
 * 
 * @example
 * ```typescript
 * const message: AgentMessage = {
 *   type: 'requirements-analysis-request',
 *   payload: {
 *     businessRequirements: [...],
 *     constraints: [...]
 *   },
 *   sourceAgentId: 'requirements-analyzer'
 * };
 * ```
 */
export interface AgentMessage {
  /**
   * Message type identifier for routing and handling.
   * Allows agents to distinguish between different message categories
   * and apply appropriate handlers.
   * 
   * @example 'requirements-analysis-request', 'architecture-decision', 'conflict-resolution'
   */
  type: string;

  /**
   * Message payload containing the actual message content.
   * Can be any JSON-serializable value. The structure and content
   * depend on the message type and is determined by the sending agent.
   * 
   * @example { businessRequirements: [...], constraints: [...] }
   */
  payload: unknown;

  /**
   * Optional identifier of the agent that sent this message.
   * Enables the receiving agent to identify the source and send
   * responses back to the correct agent.
   * 
   * @example 'requirements-analyzer', 'security-architect'
   */
  sourceAgentId?: string;
}

/**
 * Context provided to an agent handler during message processing.
 * 
 * The context gives agents access to their identity, state, and logging capabilities.
 * This allows agents to maintain state across multiple message invocations and
 * coordinate with other agents in the system.
 * 
 * @example
 * ```typescript
 * const context: AgentContext = {
 *   agentId: 'requirements-analyzer',
 *   state: new Map([
 *     ['currentPhase', 'strategic-design'],
 *     ['analysisResults', {...}]
 *   ]),
 *   logger: childLogger
 * };
 * ```
 */
export interface AgentContext {
  /**
   * Unique identifier for this agent.
   * Used to identify the agent in logs, state management, and inter-agent communication.
   * 
   * @example 'requirements-analyzer', 'security-architect', 'data-architect'
   */
  agentId: string;

  /**
   * Mutable state map for this agent.
   * Agents can store and retrieve state across multiple message invocations.
   * State is maintained in-memory for v0.1; future versions will support persistence.
   * 
   * Keys are arbitrary strings; values can be any JSON-serializable type.
   * Agents are responsible for managing their own state consistency.
   * 
   * @example
   * ```typescript
   * context.state.set('currentPhase', 'strategic-design');
   * context.state.set('analysisResults', { ... });
   * const phase = context.state.get('currentPhase');
   * ```
   */
  state: Map<string, unknown>;

  /**
   * Structured logger instance for this agent.
   * Typically a child logger with agent-specific context (agentId, correlationId, etc.)
   * to enable tracing across agent interactions.
   * 
   * All logging should go through this logger to maintain correlation tracking
   * and ensure consistent log formatting.
   * 
   * @example
   * ```typescript
   * context.logger.info('Processing requirements', {
   *   requirementCount: requirements.length,
   *   phase: 'strategic-design'
   * });
   * ```
   */
  logger: StructuredLogger;
}

/**
 * Response returned by an agent handler.
 * 
 * Can be any JSON-serializable value. The structure and content depend on
 * the message type and the agent's implementation. Responses are returned
 * to the caller via the AgentCoordinator.
 * 
 * @example
 * ```typescript
 * // Analysis response
 * const response: AgentResponse = {
 *   status: 'completed',
 *   analysisResults: { ... },
 *   confidence: 0.95
 * };
 * 
 * // Decision response
 * const response: AgentResponse = {
 *   decision: 'microservices-architecture',
 *   rationale: '...',
 *   alternatives: [...]
 * };
 * ```
 */
export type AgentResponse = unknown;

/**
 * Handler function for processing messages in an agent.
 * 
 * Agents implement this function to handle incoming messages. The handler
 * receives the message and a context object providing access to agent identity,
 * state, and logging capabilities.
 * 
 * Handlers MUST be idempotent (safe to retry) to support future AACP reliability
 * features. They should not have side effects beyond updating agent state.
 * 
 * @param message The incoming message to process
 * @param context The agent context providing identity, state, and logging
 * @returns A promise resolving to the response value
 * 
 * @example
 * ```typescript
 * const requirementsAnalyzerHandler: AgentHandler = async (message, context) => {
 *   context.logger.info('Analyzing requirements', {
 *     messageType: message.type,
 *     sourceAgent: message.sourceAgentId
 *   });
 *   
 *   if (message.type === 'analyze-requirements') {
 *     const requirements = message.payload as BusinessRequirement[];
 *     const analysis = await analyzeRequirements(requirements);
 *     
 *     // Update agent state
 *     context.state.set('lastAnalysis', analysis);
 *     
 *     return {
 *       status: 'completed',
 *       analysis,
 *       confidence: 0.95
 *     };
 *   }
 *   
 *   throw new Error(`Unknown message type: ${message.type}`);
 * };
 * ```
 */
export interface AgentHandler {
  /**
   * Processes an incoming message and returns a response.
   * 
   * @param message The incoming message to process
   * @param context The agent context providing identity, state, and logging
   * @returns A promise resolving to the response value
   * @throws May throw errors which will be propagated to the caller
   */
  (message: AgentMessage, context: AgentContext): Promise<AgentResponse>;
}

/**
 * Agent Coordinator interface for managing agent registration and communication.
 * 
 * The coordinator provides:
 * - Agent registration and lifecycle management
 * - Message routing between agents
 * - Per-agent state management
 * - Sequential message processing per agent (FIFO queue)
 * - Concurrent processing across different agents
 * 
 * For v0.1, all state is in-memory. Future versions will support persistence
 * and the full Agent-to-Agent Communication Protocol (AACP) for reliability
 * and resumability across restarts.
 * 
 * @example
 * ```typescript
 * import { AgentCoordinatorImpl } from './agentCoordinatorImpl.js';
 * 
 * const coordinator = new AgentCoordinatorImpl(logger);
 * 
 * // Register agents
 * coordinator.registerAgent('requirements-analyzer', requirementsHandler);
 * coordinator.registerAgent('security-architect', securityHandler);
 * 
 * // Send messages between agents
 * const response = await coordinator.sendMessage('security-architect', {
 *   type: 'review-architecture',
 *   payload: { architecture: {...} },
 *   sourceAgentId: 'requirements-analyzer'
 * });
 * 
 * // Access agent state
 * const state = coordinator.getAgentState('requirements-analyzer');
 * ```
 */
export interface AgentCoordinator {
  /**
   * Registers an agent with the coordinator.
   * 
   * The agent becomes available for receiving messages immediately after registration.
   * Attempting to register an agent with a duplicate ID will throw an error.
   * 
   * @param id Unique identifier for the agent
   * @param handler Function to handle incoming messages for this agent
   * @throws Error if an agent with the same ID is already registered
   * 
   * @example
   * ```typescript
   * coordinator.registerAgent('requirements-analyzer', async (message, context) => {
   *   // Handle message
   *   return { status: 'completed' };
   * });
   * ```
   */
  registerAgent(id: string, handler: AgentHandler): void;

  /**
   * Unregisters an agent from the coordinator.
   * 
   * The agent will no longer receive messages after unregistration.
   * In-flight messages for the agent will complete normally.
   * 
   * @param id Unique identifier of the agent to unregister
   * @returns true if the agent was registered and has been unregistered, false if not found
   * 
   * @example
   * ```typescript
   * const wasRegistered = coordinator.unregisterAgent('requirements-analyzer');
   * if (wasRegistered) {
   *   console.log('Agent unregistered successfully');
   * }
   * ```
   */
  unregisterAgent(id: string): boolean;

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
   * 
   * @example
   * ```typescript
   * const response = await coordinator.sendMessage('security-architect', {
   *   type: 'review-architecture',
   *   payload: { architecture: {...} },
   *   sourceAgentId: 'requirements-analyzer'
   * });
   * ```
   */
  sendMessage(targetAgentId: string, message: AgentMessage): Promise<AgentResponse>;

  /**
   * Retrieves the current state of an agent.
   * 
   * Returns the agent's state map if the agent is registered, or undefined if not found.
   * The returned map is the actual state object (not a copy), so modifications will
   * affect the agent's state. Use with caution to avoid unintended side effects.
   * 
   * @param agentId Unique identifier of the agent
   * @returns The agent's state map, or undefined if the agent is not registered
   * 
   * @example
   * ```typescript
   * const state = coordinator.getAgentState('requirements-analyzer');
   * if (state) {
   *   const lastAnalysis = state.get('lastAnalysis');
   *   console.log('Last analysis:', lastAnalysis);
   * }
   * ```
   */
  getAgentState(agentId: string): Map<string, unknown> | undefined;

  /**
   * Lists all registered agent IDs.
   * 
   * Returns an array of agent IDs for all currently registered agents.
   * The array is sorted lexicographically for deterministic ordering.
   * 
   * @returns Array of registered agent IDs, sorted alphabetically
   * 
   * @example
   * ```typescript
   * const agentIds = coordinator.listAgents();
   * console.log('Registered agents:', agentIds);
   * // Output: ['data-architect', 'requirements-analyzer', 'security-architect']
   * ```
   */
  listAgents(): string[];

  /**
   * Optional callback hook for state change notifications.
   * 
   * If provided, this callback will be invoked whenever an agent's state changes.
   * Useful for implementing state change listeners, persistence, or monitoring.
   * 
   * @param agentId The agent whose state changed
   * @param state The agent's updated state map
   * 
   * @example
   * ```typescript
   * coordinator.onStateChange = (agentId, state) => {
   *   console.log(`Agent ${agentId} state changed:`, state);
   *   // Could persist state to database here
   * };
   * ```
   */
  onStateChange?: (agentId: string, state: Map<string, unknown>) => void;
}

// Export the implementation
export { AgentCoordinatorImpl } from './agentCoordinatorImpl.js';
