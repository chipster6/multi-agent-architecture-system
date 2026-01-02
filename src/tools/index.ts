/**
 * MCP Tools Registration
 *
 * Defines and registers all available MCP tools for the Multi-Agent Architecture Design System
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Register all available MCP tools
 */
export function registerTools(): Tool[] {
  return [
    {
      name: 'analyze_requirements',
      description:
        'Analyze business requirements and translate them into architectural constraints using Phase 1 agents (Requirements, Domain Design, System Topology)',
      inputSchema: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Detailed description of the system requirements and business needs',
            minLength: 10,
          },
          constraints: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of technical, business, or regulatory constraints (optional)',
          },
          technologies: {
            type: 'array',
            items: { type: 'string' },
            description: 'Preferred or required technologies (optional)',
          },
          timeline: {
            type: 'string',
            description: 'Project timeline or deadline (optional)',
          },
          budget: {
            type: 'string',
            description: 'Budget constraints (optional)',
          },
          teamSize: {
            type: 'number',
            description: 'Size of the development team (optional)',
          },
        },
        required: ['description'],
      },
    },

    {
      name: 'generate_architecture',
      description:
        'Generate complete software architecture documentation using all 40+ specialized agents across phases 2-10 (Infrastructure, Data, Application, AI/ML, Security, Resilience, Performance, DevOps, Governance)',
      inputSchema: {
        type: 'object',
        properties: {
          requirements: {
            type: 'object',
            description: 'Requirements analysis output from analyze_requirements tool',
          },
          preferences: {
            type: 'object',
            properties: {
              cloudProvider: {
                type: 'string',
                description: 'Preferred cloud provider (AWS, Azure, GCP, etc.)',
              },
              architectureStyle: {
                type: 'string',
                description:
                  'Preferred architecture style (microservices, monolithic, serverless, etc.)',
              },
              scalabilityRequirements: {
                type: 'string',
                description: 'Specific scalability requirements',
              },
            },
            description: 'Architecture preferences and constraints (optional)',
          },
        },
        required: ['requirements'],
      },
    },

    {
      name: 'validate_decisions',
      description:
        'Validate architectural decisions for conflicts, compliance, and best practices using conflict resolution agents',
      inputSchema: {
        type: 'object',
        properties: {
          architecture: {
            type: 'object',
            description: 'Architecture blueprint to validate',
          },
          constraints: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional constraints to validate against (optional)',
          },
        },
        required: ['architecture'],
      },
    },

    {
      name: 'create_implementation_plan',
      description:
        'Create detailed implementation plan with task breakdown, timeline, and resource allocation using Phase 11 implementation planning agents',
      inputSchema: {
        type: 'object',
        properties: {
          architecture: {
            type: 'object',
            description: 'Architecture blueprint to implement',
          },
          timeline: {
            type: 'string',
            description: 'Desired implementation timeline (optional)',
          },
          teamSize: {
            type: 'number',
            description: 'Available team size for implementation (optional)',
          },
          priorities: {
            type: 'array',
            items: { type: 'string' },
            description: 'Implementation priorities (optional)',
          },
        },
        required: ['architecture'],
      },
    },
  ];
}
