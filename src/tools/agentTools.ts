/**
 * Agent coordination tools for the MCP server.
 * Provides tools for inter-agent communication and coordination.
 */

import type { ToolDefinition, ToolHandler, ToolContext } from '../mcp/toolRegistry.js';
import type { AgentCoordinator } from '../agents/agentCoordinator.js';
import type { ResourceManager } from '../resources/resourceManager.js';
import type { ServerConfig } from '../config/configManager.js';
import { ErrorCode, createError } from '../errors/errorHandler.js';

/**
 * Schema for the agent/sendMessage tool.
 */
const AGENT_SEND_MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    targetAgentId: {
      type: 'string',
      description: 'Unique identifier of the target agent to send the message to',
      minLength: 1,
    },
    message: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Message type identifier for routing and handling',
          minLength: 1,
        },
        payload: {
          description: 'Message payload containing the actual message content (any JSON-serializable value)',
        },
      },
      required: ['type', 'payload'],
      additionalProperties: false,
    },
  },
  required: ['targetAgentId', 'message'],
  additionalProperties: false,
} as const;

/**
 * Schema for the agent/list tool.
 */
const AGENT_LIST_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

/**
 * Schema for the agent/getState tool.
 */
const AGENT_GET_STATE_SCHEMA = {
  type: 'object',
  properties: {
    agentId: {
      type: 'string',
      description: 'Unique identifier of the agent to retrieve state for',
      minLength: 1,
    },
  },
  required: ['agentId'],
  additionalProperties: false,
} as const;

/**
 * Interface for agent/sendMessage tool arguments.
 */
interface AgentSendMessageArgs {
  targetAgentId: string;
  message: {
    type: string;
    payload: unknown;
  };
}

/**
 * Interface for agent/list tool response.
 */
interface AgentListResponse {
  agentIds: string[];
  truncated: boolean;
}

/**
 * Interface for agent/getState tool arguments.
 */
interface AgentGetStateArgs {
  agentId: string;
}

/**
 * Interface for agent/getState tool response.
 */
interface AgentGetStateResponse {
  agentId: string;
  state: Record<string, unknown> | string[];
  truncated: boolean;
  keysOnly: boolean;
}

/**
 * Creates the agent/sendMessage tool definition.
 * @returns Tool definition for agent message sending
 */
export function createAgentSendMessageTool(): ToolDefinition {
  return {
    name: 'agent/sendMessage',
    description: 'Send a message to a target agent and wait for the response. Messages are processed sequentially per agent (FIFO queue) while different agents process messages concurrently.',
    inputSchema: AGENT_SEND_MESSAGE_SCHEMA,
  };
}

/**
 * Creates the agent/list tool definition.
 * @returns Tool definition for listing registered agents
 */
export function createAgentListTool(): ToolDefinition {
  return {
    name: 'agent/list',
    description: 'List all registered agent IDs. Returns agent IDs sorted alphabetically with bounded response size to prevent oversized responses.',
    inputSchema: AGENT_LIST_SCHEMA,
  };
}

/**
 * Creates the agent/getState tool definition.
 * @returns Tool definition for retrieving agent state
 */
export function createAgentGetStateTool(): ToolDefinition {
  return {
    name: 'agent/getState',
    description: 'Retrieve the current state of a registered agent. Returns either the full state (if within size limits) or a keys-only summary. Sensitive keys are redacted for security.',
    inputSchema: AGENT_GET_STATE_SCHEMA,
  };
}

/**
 * Creates the agent/sendMessage tool handler.
 * @param agentCoordinator - Agent coordinator instance for message routing
 * @param resourceManager - Resource manager for payload size validation
 * @returns Tool handler function
 */
export function createAgentSendMessageHandler(
  agentCoordinator: AgentCoordinator,
  resourceManager: ResourceManager
): ToolHandler {
  return async (args: Record<string, unknown>, context: ToolContext): Promise<unknown> => {
    const { targetAgentId, message } = args as unknown as AgentSendMessageArgs;

    context.logger.debug('Processing agent/sendMessage request', {
      targetAgentId,
      messageType: message.type,
      runId: context.runId,
      correlationId: context.correlationId,
    });

    // Validate payload size using the same mechanism as tools/call
    // We need to validate the entire message payload, not just the arguments
    const payloadValidation = resourceManager.validatePayloadSize(message);
    if (!payloadValidation.valid) {
      context.logger.warn('Agent message payload size exceeded', {
        targetAgentId,
        messageType: message.type,
        runId: context.runId,
        correlationId: context.correlationId,
        errors: payloadValidation.errors,
      });

      throw createError(
        ErrorCode.ResourceExhausted,
        'Message payload size exceeds maximum allowed size',
        {
          reason: 'payload_size_exceeded',
          errors: payloadValidation.errors,
        }
      );
    }

    try {
      // Send message to target agent
      const response = await agentCoordinator.sendMessage(targetAgentId, message);

      context.logger.debug('Agent message sent successfully', {
        targetAgentId,
        messageType: message.type,
        runId: context.runId,
        correlationId: context.correlationId,
      });

      return response;
    } catch (error) {
      // Check if the error is due to agent not being registered
      if (error instanceof Error && error.message.includes('is not registered')) {
        context.logger.warn('Message sent to unregistered agent', {
          targetAgentId,
          messageType: message.type,
          runId: context.runId,
          correlationId: context.correlationId,
          error: {
            name: error.name,
            message: error.message,
          },
        });

        throw createError(
          ErrorCode.NotFound,
          `Agent with ID "${targetAgentId}" is not registered`,
          {
            targetAgentId,
            messageType: message.type,
          }
        );
      }

      // Re-throw other errors as internal errors
      context.logger.error('Error sending message to agent', {
        targetAgentId,
        messageType: message.type,
        runId: context.runId,
        correlationId: context.correlationId,
        error: {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
        },
      });

      throw createError(
        ErrorCode.Internal,
        'Failed to send message to agent',
        {
          targetAgentId,
          messageType: message.type,
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  };
}

/**
 * Creates the agent/getState tool handler.
 * @param agentCoordinator - Agent coordinator instance for state access
 * @param config - Server configuration for maxStateBytes limit
 * @returns Tool handler function
 */
export function createAgentGetStateHandler(
  agentCoordinator: AgentCoordinator,
  config: ServerConfig
): ToolHandler {
  return (args: Record<string, unknown>, context: ToolContext): Promise<AgentGetStateResponse> => {
    const { agentId } = args as unknown as AgentGetStateArgs;

    context.logger.debug('Processing agent/getState request', {
      agentId,
      runId: context.runId,
      correlationId: context.correlationId,
    });

    try {
      // Check if agent exists
      const agentState = agentCoordinator.getAgentState(agentId);
      if (!agentState) {
        context.logger.warn('State requested for unregistered agent', {
          agentId,
          runId: context.runId,
          correlationId: context.correlationId,
        });

        throw createError(
          ErrorCode.NotFound,
          `Agent with ID "${agentId}" is not registered`,
          {
            agentId,
          }
        );
      }

      context.logger.debug('Retrieved agent state', {
        agentId,
        stateKeyCount: agentState.size,
        runId: context.runId,
        correlationId: context.correlationId,
      });

      // Convert Map to plain object for serialization and redaction
      const stateObject: Record<string, unknown> = {};
      for (const [key, value] of agentState.entries()) {
        stateObject[key] = value;
      }

      // Apply redaction to remove sensitive keys
      const redactedState = context.logger.redact(stateObject) as Record<string, unknown>;

      // Try full state response first
      let response: AgentGetStateResponse = {
        agentId,
        state: redactedState,
        truncated: false,
        keysOnly: false,
      };

      // Check if the full response exceeds maxStateBytes
      const maxStateBytes = config.tools.maxStateBytes;
      const responseJson = JSON.stringify(response);
      const responseSize = Buffer.byteLength(responseJson, 'utf8');

      if (responseSize > maxStateBytes) {
        context.logger.warn('Agent state response too large, falling back to keys-only', {
          agentId,
          responseSize,
          maxStateBytes,
          stateKeyCount: agentState.size,
          runId: context.runId,
          correlationId: context.correlationId,
        });

        // Fall back to keys-only summary
        const stateKeys = Array.from(agentState.keys()).sort();
        
        // Create keys-only response
        const keysOnlyResponse: AgentGetStateResponse = {
          agentId,
          state: stateKeys,
          truncated: true,
          keysOnly: true,
        };

        // Check if even the keys-only response exceeds the limit
        const keysOnlyJson = JSON.stringify(keysOnlyResponse);
        const keysOnlySize = Buffer.byteLength(keysOnlyJson, 'utf8');

        if (keysOnlySize > maxStateBytes) {
          context.logger.warn('Keys-only response still too large, truncating keys', {
            agentId,
            keysOnlySize,
            maxStateBytes,
            totalKeys: stateKeys.length,
            runId: context.runId,
            correlationId: context.correlationId,
          });

          // Binary search to find maximum number of keys we can include
          let left = 0;
          let right = stateKeys.length;
          let maxKeys = 0;

          while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const truncatedKeysResponse: AgentGetStateResponse = {
              agentId,
              state: stateKeys.slice(0, mid),
              truncated: true,
              keysOnly: true,
            };

            const truncatedJson = JSON.stringify(truncatedKeysResponse);
            const truncatedSize = Buffer.byteLength(truncatedJson, 'utf8');

            if (truncatedSize <= maxStateBytes) {
              maxKeys = mid;
              left = mid + 1;
            } else {
              right = mid - 1;
            }
          }

          // Create final truncated keys response
          response = {
            agentId,
            state: stateKeys.slice(0, maxKeys),
            truncated: true,
            keysOnly: true,
          };

          context.logger.info('Agent state keys truncated', {
            agentId,
            originalKeyCount: stateKeys.length,
            truncatedKeyCount: maxKeys,
            runId: context.runId,
            correlationId: context.correlationId,
          });
        } else {
          response = keysOnlyResponse;
        }
      }

      context.logger.debug('Agent state request completed', {
        agentId,
        responseType: response.keysOnly ? 'keys-only' : 'full-state',
        truncated: response.truncated,
        runId: context.runId,
        correlationId: context.correlationId,
      });

      return Promise.resolve(response);
    } catch (error) {
      // Re-throw known errors (like NOT_FOUND)
      if (error && typeof error === 'object' && 'code' in error) {
        throw error;
      }

      context.logger.error('Error retrieving agent state', {
        agentId,
        runId: context.runId,
        correlationId: context.correlationId,
        error: {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
        },
      });

      throw createError(
        ErrorCode.Internal,
        'Failed to retrieve agent state',
        {
          agentId,
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  };
}
/**
 * Creates the agent/list tool handler.
 * @param agentCoordinator - Agent coordinator instance for listing agents
 * @param resourceManager - Resource manager for response size validation
 * @returns Tool handler function
 */
export function createAgentListHandler(
  agentCoordinator: AgentCoordinator,
  resourceManager: ResourceManager
): ToolHandler {
  return (_args: Record<string, unknown>, context: ToolContext): Promise<AgentListResponse> => {
    context.logger.debug('Processing agent/list request', {
      runId: context.runId,
      correlationId: context.correlationId,
    });

    try {
      // Get all registered agent IDs (already sorted by the coordinator)
      const allAgentIds = agentCoordinator.listAgents();

      context.logger.debug('Retrieved agent list', {
        totalAgents: allAgentIds.length,
        runId: context.runId,
        correlationId: context.correlationId,
      });

      // Create the response object
      let response: AgentListResponse = {
        agentIds: allAgentIds,
        truncated: false,
      };

      // Check if the response exceeds the maximum payload size
      // We use the same mechanism as result wrapping - validate the response size
      const validation = resourceManager.validatePayloadSize(response);
      
      if (!validation.valid) {
        context.logger.warn('Agent list response too large, truncating', {
          totalAgents: allAgentIds.length,
          validationErrors: validation.errors,
          runId: context.runId,
          correlationId: context.correlationId,
        });

        // Binary search to find the maximum number of agents we can include
        let left = 0;
        let right = allAgentIds.length;
        let maxAgents = 0;

        while (left <= right) {
          const mid = Math.floor((left + right) / 2);
          const truncatedResponse: AgentListResponse = {
            agentIds: allAgentIds.slice(0, mid),
            truncated: true,
          };

          const truncatedValidation = resourceManager.validatePayloadSize(truncatedResponse);

          if (truncatedValidation.valid) {
            maxAgents = mid;
            left = mid + 1;
          } else {
            right = mid - 1;
          }
        }

        // Create the final truncated response
        response = {
          agentIds: allAgentIds.slice(0, maxAgents),
          truncated: true,
        };

        context.logger.info('Agent list truncated', {
          originalCount: allAgentIds.length,
          truncatedCount: maxAgents,
          runId: context.runId,
          correlationId: context.correlationId,
        });
      }

      context.logger.debug('Agent list request completed', {
        agentCount: response.agentIds.length,
        truncated: response.truncated,
        runId: context.runId,
        correlationId: context.correlationId,
      });

      return Promise.resolve(response);
    } catch (error) {
      context.logger.error('Error listing agents', {
        runId: context.runId,
        correlationId: context.correlationId,
        error: {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
        },
      });

      throw createError(
        ErrorCode.Internal,
        'Failed to list agents',
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  };
}

/**
 * Creates all agent coordination tools.
 * @param agentCoordinator - Agent coordinator instance
 * @param resourceManager - Resource manager instance
 * @param config - Server configuration instance
 * @returns Array of tool definitions and handlers
 */
export function createAgentTools(
  agentCoordinator: AgentCoordinator,
  resourceManager: ResourceManager,
  config: ServerConfig
): Array<{ definition: ToolDefinition; handler: ToolHandler }> {
  return [
    {
      definition: createAgentSendMessageTool(),
      handler: createAgentSendMessageHandler(agentCoordinator, resourceManager),
    },
    {
      definition: createAgentListTool(),
      handler: createAgentListHandler(agentCoordinator, resourceManager),
    },
    {
      definition: createAgentGetStateTool(),
      handler: createAgentGetStateHandler(agentCoordinator, config),
    },
  ];
}