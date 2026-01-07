/**
 * Agent Coordinator Module
 * 
 * Provides basic agent coordination capabilities for the Multi-Agent Architecture Design System.
 * This module defines the core interfaces and types for agent-to-agent communication and
 * coordination within the MCP server.
 * 
 * ## Architecture Overview
 * 
 * The Agent Coordinator enables:
 * - Agent registration and lifecycle management
 * - Message passing between registered agents
 * - Per-agent state management
 * - Sequential message processing per agent (FIFO queue)
 * - Concurrent processing across different agents
 * 
 * ## Version Strategy and Migration Path
 * 
 * This module follows a **non-breaking evolution strategy** to ensure smooth upgrades
 * and backward compatibility across versions.
 * 
 * ### v0.1 (Current Stable)
 * - **Focus**: Basic agent coordination with in-memory state
 * - **Limitations**: No persistence, basic error handling, limited observability
 * - **Guarantees**: All APIs stable and backward compatible
 * 
 * ### v0.2 (Future - AACP Integration)
 * - **Focus**: Reliable messaging with Agent-to-Agent Communication Protocol (AACP)
 * - **Additions**: Persistent state, retry mechanisms, enhanced monitoring
 * - **Compatibility**: 100% backward compatible with v0.1 APIs
 * - **Migration**: Opt-in to new features via `AgentCoordinatorV2` interface
 * 
 * ### v0.3+ (Roadmap)
 * - **Focus**: Distributed coordination across processes and networks
 * - **Additions**: Cross-process messaging, distributed state management
 * - **Compatibility**: Maintains v0.1 and v0.2 API compatibility
 * 
 * ## Migration Strategy
 * 
 * The module provides multiple interfaces to support gradual migration:
 * 
 * 1. **`AgentCoordinator`**: Core v0.1 interface - stable and unchanging
 * 2. **`AgentCoordinatorV2`**: Extended interface with v0.2 features - additive only
 * 3. **Implementation**: Single implementation supports both interfaces
 * 
 * ### Backward Compatibility Guarantees
 * 
 * - **Method Signatures**: v0.1 methods never change signature or behavior
 * - **State Management**: Agent state maps work identically across versions
 * - **Error Handling**: Exception types and error conditions remain consistent
 * - **Processing Model**: Sequential per-agent, concurrent cross-agent model preserved
 * 
 * ### Example Migration Path
 * 
 * ```typescript
 * // Phase 1: v0.1 code (no changes needed)
 * const coordinator: AgentCoordinator = new AgentCoordinatorImpl(logger);
 * coordinator.registerAgent('agent1', handler);
 * await coordinator.sendMessage('agent1', message);
 * 
 * // Phase 2: Add v0.2 monitoring (opt-in)
 * const coordinatorV2 = coordinator as AgentCoordinatorV2;
 * coordinatorV2.onMessageCompleted = (agentId, msg, id, response, duration) => {
 *   console.log(`Message processed in ${duration}ms`);
 * };
 * 
 * // Phase 3: Use v0.2 reliable messaging (when needed)
 * await coordinatorV2.sendReliableMessage('critical-agent', criticalMessage);
 * ```
 * 
 * ## Design Principles
 * 
 * 1. **Backward Compatibility**: Existing code continues to work across versions
 * 2. **Opt-in Features**: New capabilities are additive and optional
 * 3. **Single Implementation**: One implementation supports all interface versions
 * 4. **Clear Migration Path**: Gradual adoption of new features without rewrites
 * 5. **Future-Proof Architecture**: Designed to support distributed scenarios
 * 
 * For v0.1, state is maintained in-memory only. Future iterations (v0.2+) will add
 * persistent storage and the full Agent-to-Agent Communication Protocol (AACP).
 */

import type { StructuredLogger } from '../logging/structuredLogger.js';

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
 * ## Version Compatibility and Migration
 * 
 * This interface represents the **v0.1 stable API** for agent coordination. All methods
 * in this interface are guaranteed to remain unchanged across minor version updates,
 * ensuring backward compatibility for existing code.
 * 
 * ### v0.1 Limitations
 * - All state is maintained in-memory only (not persistent across restarts)
 * - Basic message passing without reliability guarantees
 * - No built-in retry or error recovery mechanisms
 * - Limited observability and monitoring capabilities
 * 
 * ### v0.2 Migration Path
 * 
 * The `AgentCoordinatorV2` interface extends this interface with additional capabilities
 * while maintaining **100% backward compatibility**. Existing v0.1 code will continue
 * to work without any modifications when upgrading to v0.2.
 * 
 * ```typescript
 * // v0.1 code (continues to work in v0.2)
 * const coordinator: AgentCoordinator = new AgentCoordinatorImpl(logger);
 * coordinator.registerAgent('my-agent', handler);
 * const response = await coordinator.sendMessage('target-agent', message);
 * 
 * // v0.2 features (opt-in when ready)
 * const coordinatorV2 = coordinator as AgentCoordinatorV2;
 * const reliableResponse = await coordinatorV2.sendReliableMessage('target-agent', message);
 * ```
 * 
 * ### Future Roadmap
 * - **v0.2**: Adds AACP protocol, reliable messaging, and persistence support
 * - **v0.3+**: Distributed coordination and cross-process agent communication
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

/**
 * Extended Agent Coordinator interface for v0.2 AACP compatibility.
 * 
 * This interface extends the base AgentCoordinator with reliable messaging capabilities
 * and enhanced observability hooks. It provides a migration path for future AACP
 * (Agent-to-Agent Communication Protocol) support while maintaining backward compatibility.
 * 
 * ## Migration Path from v0.1 to v0.2
 * 
 * The v0.2 interface is designed as a **non-breaking extension** of the v0.1 AgentCoordinator.
 * Existing v0.1 code will continue to work without modification when upgrading to v0.2.
 * 
 * ### Backward Compatibility Guarantees
 * 
 * 1. **Method Signatures**: All v0.1 methods (`registerAgent`, `unregisterAgent`, `sendMessage`, 
 *    `getAgentState`, `listAgents`) remain unchanged with identical signatures and behavior.
 * 
 * 2. **State Management**: Agent state maps and lifecycle management work identically in v0.2.
 * 
 * 3. **Message Processing**: The sequential per-agent, concurrent cross-agent processing model
 *    is preserved. Existing message handlers will continue to work without modification.
 * 
 * 4. **Error Handling**: All existing error conditions and exception types remain the same.
 * 
 * ### Migration Strategy
 * 
 * **Phase 1: Drop-in Replacement (No Code Changes)**
 * ```typescript
 * // v0.1 code continues to work unchanged
 * const coordinator = new AgentCoordinatorImpl(logger);
 * coordinator.registerAgent('my-agent', handler);
 * const response = await coordinator.sendMessage('target-agent', message);
 * ```
 * 
 * **Phase 2: Opt-in v0.2 Features (Gradual Adoption)**
 * ```typescript
 * // Cast to v0.2 interface to access new features
 * const coordinatorV2 = coordinator as AgentCoordinatorV2;
 * 
 * // Add optional monitoring hooks
 * coordinatorV2.onMessageCompleted = (agentId, message, messageId, response, duration) => {
 *   console.log(`Message processed in ${duration}ms`);
 * };
 * 
 * // Use reliable messaging for critical operations
 * const response = await coordinatorV2.sendReliableMessage('critical-agent', message);
 * ```
 * 
 * **Phase 3: Full v0.2 Adoption (Optional)**
 * ```typescript
 * // Leverage all v0.2 features for enhanced reliability
 * const analysisResult = await coordinatorV2.sendRequest('data-architect', {
 *   type: 'analyze-requirements',
 *   payload: requirements
 * }, {
 *   timeoutMs: 30000,
 *   retryPolicy: { maxAttempts: 3, backoffMs: 1000 }
 * });
 * ```
 * 
 * ### Implementation Timeline
 * 
 * - **v0.1 (Current)**: Basic agent coordination with in-memory state
 * - **v0.2 (Future)**: Adds AACP protocol, reliable messaging, and persistence
 * - **v0.3+ (Roadmap)**: Distributed coordination, cross-process agent communication
 * 
 * ### Breaking Change Policy
 * 
 * The AgentCoordinator follows semantic versioning with strict backward compatibility:
 * - **Minor versions** (0.1 → 0.2): Only additive changes, no breaking changes
 * - **Major versions** (0.x → 1.x): May include breaking changes with migration guide
 * - **Patch versions** (0.1.0 → 0.1.1): Bug fixes only, no API changes
 * 
 * The V2 interface adds:
 * - Reliable message delivery with retry semantics
 * - Request-response patterns with correlation tracking
 * - Message lifecycle hooks for monitoring and debugging
 * - Future-ready architecture for distributed agent coordination
 * 
 * @example
 * ```typescript
 * import { AgentCoordinatorImpl } from './agentCoordinatorImpl.js';
 * 
 * const coordinator = new AgentCoordinatorImpl(logger) as AgentCoordinatorV2;
 * 
 * // Set up message lifecycle hooks
 * coordinator.onMessageReceived = (targetAgentId, message, messageId) => {
 *   console.log(`Message ${messageId} received by ${targetAgentId}`);
 * };
 * 
 * coordinator.onMessageCompleted = (targetAgentId, message, messageId, response) => {
 *   console.log(`Message ${messageId} completed successfully`);
 * };
 * 
 * coordinator.onMessageFailed = (targetAgentId, message, messageId, error) => {
 *   console.error(`Message ${messageId} failed:`, error);
 * };
 * 
 * // Use reliable messaging (v0.2 feature)
 * const response = await coordinator.sendReliableMessage('security-architect', {
 *   type: 'review-architecture',
 *   payload: { architecture: {...} },
 *   sourceAgentId: 'requirements-analyzer'
 * });
 * 
 * // Use request-response pattern (v0.2 feature)
 * const analysisResult = await coordinator.sendRequest('data-architect', {
 *   type: 'analyze-data-requirements',
 *   payload: { requirements: [...] }
 * });
 * ```
 */
export interface AgentCoordinatorV2 extends AgentCoordinator {
  /**
   * Sends a message with reliable delivery semantics.
   * 
   * This method provides enhanced reliability over the basic `sendMessage()` method
   * by implementing retry logic, deduplication, and delivery confirmation. Messages
   * sent via this method are guaranteed to be delivered at least once, with
   * idempotent handling to prevent duplicate processing.
   * 
   * Features:
   * - Automatic retry with exponential backoff on transient failures
   * - Message deduplication based on content and target agent
   * - Delivery confirmation and status tracking
   * - Integration with AACP protocol for distributed scenarios (v0.2)
   * 
   * @param targetAgentId Unique identifier of the target agent
   * @param message The message to send with reliable delivery
   * @returns A promise resolving to the agent's response
   * @throws Error if the target agent is not registered or message delivery fails permanently
   * 
   * @example
   * ```typescript
   * // Send critical architecture decision with guaranteed delivery
   * const response = await coordinator.sendReliableMessage('security-architect', {
   *   type: 'security-review-required',
   *   payload: { 
   *     architecture: designDocument,
   *     priority: 'critical',
   *     deadline: '2024-01-20T10:00:00Z'
   *   },
   *   sourceAgentId: 'requirements-analyzer'
   * });
   * ```
   */
  sendReliableMessage(targetAgentId: string, message: AgentMessage): Promise<AgentResponse>;

  /**
   * Sends a request message and waits for a correlated response.
   * 
   * This method implements a request-response pattern with explicit correlation
   * tracking. Unlike `sendMessage()` which is fire-and-forget, `sendRequest()`
   * establishes a correlation between the request and response, enabling
   * better traceability and debugging of agent interactions.
   * 
   * Features:
   * - Automatic correlation ID generation and tracking
   * - Request timeout handling with configurable deadlines
   * - Response correlation validation
   * - Integration with distributed tracing systems (v0.2)
   * 
   * @param targetAgentId Unique identifier of the target agent
   * @param message The request message to send
   * @param options Optional configuration for request handling
   * @returns A promise resolving to the correlated response
   * @throws Error if the target agent is not registered, request times out, or correlation fails
   * 
   * @example
   * ```typescript
   * // Send request with explicit timeout
   * const analysisResult = await coordinator.sendRequest('data-architect', {
   *   type: 'analyze-data-requirements',
   *   payload: { 
   *     requirements: businessRequirements,
   *     analysisDepth: 'comprehensive'
   *   }
   * }, {
   *   timeoutMs: 60000, // 1 minute timeout
   *   priority: 'high'
   * });
   * ```
   */
  sendRequest(
    targetAgentId: string, 
    message: AgentMessage, 
    options?: {
      timeoutMs?: number;
      priority?: 'low' | 'normal' | 'high';
      retryPolicy?: {
        maxAttempts: number;
        backoffMs: number;
      };
    }
  ): Promise<AgentResponse>;

  /**
   * Optional callback hook for message reception events.
   * 
   * If provided, this callback will be invoked when a message is successfully
   * received by a target agent, before processing begins. Useful for monitoring
   * message flow, debugging agent interactions, and implementing custom logging.
   * 
   * @param targetAgentId The agent that received the message
   * @param message The message that was received
   * @param messageId Unique identifier for this message instance
   * 
   * @example
   * ```typescript
   * coordinator.onMessageReceived = (targetAgentId, message, messageId) => {
   *   console.log(`[${messageId}] Message received by ${targetAgentId}: ${message.type}`);
   *   // Could implement custom metrics collection here
   * };
   * ```
   */
  onMessageReceived?: (
    targetAgentId: string, 
    message: AgentMessage, 
    messageId: string
  ) => void;

  /**
   * Optional callback hook for message completion events.
   * 
   * If provided, this callback will be invoked when a message has been
   * successfully processed by the target agent and a response is available.
   * Useful for monitoring agent performance, tracking message latency,
   * and implementing success metrics.
   * 
   * @param targetAgentId The agent that processed the message
   * @param message The original message that was processed
   * @param messageId Unique identifier for this message instance
   * @param response The response returned by the agent
   * @param durationMs Time taken to process the message in milliseconds
   * 
   * @example
   * ```typescript
   * coordinator.onMessageCompleted = (targetAgentId, message, messageId, response, durationMs) => {
   *   console.log(`[${messageId}] Message completed by ${targetAgentId} in ${durationMs}ms`);
   *   // Could implement performance monitoring here
   *   metrics.recordMessageLatency(targetAgentId, message.type, durationMs);
   * };
   * ```
   */
  onMessageCompleted?: (
    targetAgentId: string, 
    message: AgentMessage, 
    messageId: string, 
    response: AgentResponse,
    durationMs: number
  ) => void;

  /**
   * Optional callback hook for message failure events.
   * 
   * If provided, this callback will be invoked when a message fails to be
   * processed by the target agent due to an error. Useful for monitoring
   * agent health, implementing error alerting, and debugging system issues.
   * 
   * @param targetAgentId The agent that failed to process the message
   * @param message The original message that failed
   * @param messageId Unique identifier for this message instance
   * @param error The error that caused the failure
   * @param durationMs Time taken before failure occurred in milliseconds
   * 
   * @example
   * ```typescript
   * coordinator.onMessageFailed = (targetAgentId, message, messageId, error, durationMs) => {
   *   console.error(`[${messageId}] Message failed for ${targetAgentId} after ${durationMs}ms:`, error);
   *   // Could implement error alerting here
   *   alerting.notifyMessageFailure(targetAgentId, message.type, error);
   * };
   * ```
   */
  onMessageFailed?: (
    targetAgentId: string, 
    message: AgentMessage, 
    messageId: string, 
    error: Error,
    durationMs: number
  ) => void;
}

// Export the implementation
export { AgentCoordinatorImpl } from './agentCoordinatorImpl.js';
