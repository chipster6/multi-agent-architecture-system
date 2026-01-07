import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceOptimizationAgent } from '../../../src/agents/phase-8-performance/index.js';

describe('PerformanceOptimizationAgent', () => {
  let agent: PerformanceOptimizationAgent;

  beforeEach(() => {
    agent = new PerformanceOptimizationAgent();
  });

  it('should have correct metadata', () => {
    const metadata = agent.getMetadata();
    expect(metadata.agentId).toBe('performance-optimization-agent');
    expect(metadata.phase).toBe('phase-8-performance');
    expect(metadata.capabilities).toContain('performance-analysis');
    expect(metadata.capabilities).toContain('caching-strategy');
  });

  it('should execute with valid input', async () => {
    const input = {
      context: {
        architecture: { type: 'microservices' },
        dataLayer: { type: 'sql' },
        // Mock dependencies to satisfy agent requirements
        decisions: [
          { agentId: 'infrastructure-design-agent' },
          { agentId: 'data-architecture-agent' },
          { agentId: 'application-architecture-agent' },
        ],
      },
    };

    const output = await agent.execute(input);

    expect(output).toBeDefined();
    expect(output.decisions).toBeDefined();
    expect(output.artifacts).toBeDefined();
    expect(output.confidence).toBeGreaterThan(0);
    expect(output.confidence).toBeLessThanOrEqual(1);
  });

  it('should generate performance decisions', async () => {
    const input = {
      context: {
        architecture: { type: 'microservices' },
        dataLayer: { type: 'sql' },
        // Mock dependencies to satisfy agent requirements
        decisions: [
          { agentId: 'infrastructure-design-agent' },
          { agentId: 'data-architecture-agent' },
          { agentId: 'application-architecture-agent' },
        ],
      },
    };

    const output = await agent.execute(input);

    expect(output.decisions.length).toBeGreaterThan(0);
    const decisions = output.decisions;
    expect(decisions.some(d => d.decision.includes('caching'))).toBe(true);
    expect(decisions.some(d => d.decision.includes('load'))).toBe(true);
  });

  it('should generate performance artifacts', async () => {
    const input = {
      context: {
        architecture: { type: 'microservices' },
        dataLayer: { type: 'sql' },
        // Mock dependencies to satisfy agent requirements
        decisions: [
          { agentId: 'infrastructure-design-agent' },
          { agentId: 'data-architecture-agent' },
          { agentId: 'application-architecture-agent' },
        ],
      },
    };

    const output = await agent.execute(input);

    expect(output.artifacts.length).toBeGreaterThan(0);
    const artifactNames = output.artifacts.map(a => a.name);
    expect(artifactNames.some(n => n.includes('Guide'))).toBe(true);
    expect(artifactNames.some(n => n.includes('Monitoring'))).toBe(true);
  });

  it('should have high confidence in decisions', async () => {
    const input = {
      context: {
        architecture: { type: 'microservices' },
        dataLayer: { type: 'sql' },
        // Mock dependencies to satisfy agent requirements
        decisions: [
          { agentId: 'infrastructure-design-agent' },
          { agentId: 'data-architecture-agent' },
          { agentId: 'application-architecture-agent' },
        ],
      },
    };

    const output = await agent.execute(input);

    output.decisions.forEach(decision => {
      expect(decision.confidence).toBeGreaterThan(0.8);
    });
  });
});
