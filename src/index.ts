#!/usr/bin/env node

/**
 * Multi-Agent Software Architecture Design System
 * MCP Server Entry Point
 * 
 * This server orchestrates 40+ specialized AI agents to automate
 * complete software architecture design processes.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { MetaCoordinator } from './coordinator/meta-coordinator.js';
import { logger } from './shared/utils/logger.js';
import { registerTools } from './tools/index.js';

// Load environment variables
dotenv.config();

/**
 * Main MCP server class that handles tool registration and request routing
 */
class ArchitectureDesignServer {
  private server: Server;
  private coordinator: MetaCoordinator;

  constructor() {
    this.server = new Server(
      {
        name: 'multi-agent-architecture-system',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.coordinator = new MetaCoordinator();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Register tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: registerTools(),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      logger.info(`Executing tool: ${name}`, { args });

      try {
        switch (name) {
          case 'analyze_requirements':
            return await this.coordinator.analyzeRequirements(args);
          
          case 'generate_architecture':
            return await this.coordinator.generateArchitecture(args);
          
          case 'validate_decisions':
            return await this.coordinator.validateDecisions(args);
          
          case 'create_implementation_plan':
            return await this.coordinator.createImplementationPlan(args);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`Tool execution failed: ${name}`, { error, args });
        throw error;
      }
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Multi-Agent Architecture Design System MCP server started');
  }
}

// Start the server
async function main(): Promise<void> {
  try {
    const server = new ArchitectureDesignServer();
    await server.start();
  } catch (error) {
    logger.error('Failed to start MCP server', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Unhandled error in main', { error });
    process.exit(1);
  });
}