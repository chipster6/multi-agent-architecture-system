/**
 * Unit tests for MetaCoordinator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetaCoordinator } from '../../src/coordinator/meta-coordinator.js';

describe('MetaCoordinator', () => {
  let coordinator: MetaCoordinator;

  beforeEach(() => {
    coordinator = new MetaCoordinator();
  });

  describe('analyzeRequirements', () => {
    it('should analyze basic requirements successfully', async () => {
      const input = {
        description: 'E-commerce platform with user management and payment processing',
        constraints: ['PCI compliance', 'GDPR compliance'],
        technologies: ['Node.js', 'React', 'PostgreSQL']
      };

      const result = await coordinator.analyzeRequirements(input);

      expect(result).toBeDefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('requirements');
      expect(result.content[0]).toHaveProperty('domainModel');
      expect(result.content[0]).toHaveProperty('systemTopology');
      expect(result.content[0]).toHaveProperty('constraints');
      expect(result.content[0]).toHaveProperty('confidence');
      expect(result.content[0].confidence).toBeGreaterThan(0);
      expect(result.content[0].confidence).toBeLessThanOrEqual(1);
    });

    it('should reject invalid input', async () => {
      const input = {
        description: 'Too short' // Less than 10 characters
      };

      await expect(coordinator.analyzeRequirements(input)).rejects.toThrow();
    });

    it('should handle missing optional fields', async () => {
      const input = {
        description: 'Simple web application for task management'
      };

      const result = await coordinator.analyzeRequirements(input);

      expect(result).toBeDefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].requirements).toBeDefined();
    });
  });

  describe('generateArchitecture', () => {
    it('should generate architecture from requirements', async () => {
      const requirements = {
        requirements: [
          {
            id: 'req-001',
            type: 'functional',
            description: 'User authentication',
            priority: 'high',
            source: 'business',
            acceptance_criteria: ['Users can login', 'Users can logout']
          }
        ],
        domainModel: {
          entities: [],
          relationships: [],
          bounded_contexts: []
        },
        systemTopology: {
          architecture_style: 'microservices',
          deployment_model: 'cloud-native',
          integration_patterns: ['api-gateway'],
          data_flow: [],
          system_boundaries: []
        },
        constraints: [],
        confidence: 0.8
      };

      const input = {
        requirements,
        preferences: {
          cloudProvider: 'AWS',
          architectureStyle: 'microservices'
        }
      };

      const result = await coordinator.generateArchitecture(input);

      expect(result).toBeDefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('overview');
      expect(result.content[0].overview).toHaveProperty('system_name');
      expect(result.content[0].overview).toHaveProperty('architecture_style');
    });
  });

  describe('validateDecisions', () => {
    it('should validate architecture decisions', async () => {
      const architecture = {
        overview: {
          system_name: 'Test System',
          description: 'Test architecture',
          architecture_style: 'microservices',
          key_principles: ['Scalability'],
          quality_attributes: []
        },
        components: [
          {
            id: 'comp-001',
            name: 'API Gateway',
            type: 'gateway',
            description: 'Main entry point',
            responsibilities: ['Routing'],
            interfaces: [],
            dependencies: [],
            technology_stack: ['Node.js']
          }
        ]
      };

      const input = {
        architecture,
        constraints: ['Must be cloud-native']
      };

      const result = await coordinator.validateDecisions(input);

      expect(result).toBeDefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('isValid');
      expect(result.content[0]).toHaveProperty('issues');
      expect(result.content[0]).toHaveProperty('recommendations');
      expect(typeof result.content[0].isValid).toBe('boolean');
      expect(Array.isArray(result.content[0].issues)).toBe(true);
      expect(Array.isArray(result.content[0].recommendations)).toBe(true);
    });
  });

  describe('createImplementationPlan', () => {
    it('should create implementation plan from architecture', async () => {
      const architecture = {
        overview: {
          system_name: 'Test System',
          description: 'Test architecture',
          architecture_style: 'microservices'
        },
        services: [
          {
            id: 'svc-001',
            name: 'User Service',
            type: 'microservice',
            description: 'Manages users'
          }
        ]
      };

      const input = {
        architecture,
        timeline: '3 months',
        teamSize: 5
      };

      const result = await coordinator.createImplementationPlan(input);

      expect(result).toBeDefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('overview');
      expect(result.content[0].overview).toHaveProperty('project_name');
      expect(result.content[0].overview).toHaveProperty('duration');
      expect(result.content[0].overview).toHaveProperty('team_size');
    });
  });

  describe('getContext', () => {
    it('should return current context', () => {
      const context = coordinator.getContext();

      expect(context).toBeDefined();
      expect(context).toHaveProperty('sessionId');
      expect(context).toHaveProperty('timestamp');
      expect(context).toHaveProperty('phase');
      expect(context).toHaveProperty('decisions');
      expect(context).toHaveProperty('artifacts');
      expect(context).toHaveProperty('conflicts');
      expect(Array.isArray(context.decisions)).toBe(true);
      expect(Array.isArray(context.artifacts)).toBe(true);
      expect(Array.isArray(context.conflicts)).toBe(true);
    });
  });
});