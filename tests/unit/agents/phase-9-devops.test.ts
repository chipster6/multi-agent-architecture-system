import { describe, it, expect, beforeEach } from 'vitest';
import { DevOpsInfrastructureAgent } from '../../../src/agents/phase-9-devops/index.js';

describe('DevOpsInfrastructureAgent', () => {
  let agent: DevOpsInfrastructureAgent;

  beforeEach(() => {
    agent = new DevOpsInfrastructureAgent();
  });

  it('should have correct metadata', () => {
    const metadata = agent.getMetadata();
    expect(metadata.agentId).toBe('devops-infrastructure-agent');
    expect(metadata.phase).toBe('phase-9-devops');
    expect(metadata.capabilities).toContain('ci-cd-pipeline');
    expect(metadata.capabilities).toContain('container-orchestration');
  });

  it('should execute with valid input', async () => {
    const input = {
      context: {
        infrastructure: { type: 'cloud' },
        deployment: { strategy: 'rolling' },
        // Mock dependencies to satisfy agent requirements
        decisions: [
          { agentId: 'infrastructure-design-agent' },
          { agentId: 'security-architecture-agent' },
          { agentId: 'performance-optimization-agent' },
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

  it('should generate DevOps decisions', async () => {
    const input = {
      context: {
        infrastructure: { type: 'cloud' },
        deployment: { strategy: 'rolling' },
        // Mock dependencies to satisfy agent requirements
        decisions: [
          { agentId: 'infrastructure-design-agent' },
          { agentId: 'security-architecture-agent' },
          { agentId: 'performance-optimization-agent' },
        ],
      },
    };

    const output = await agent.execute(input);

    expect(output.decisions.length).toBeGreaterThan(0);
    const decisions = output.decisions;
    expect(decisions.some(d => d.decision.includes('CI/CD'))).toBe(true);
    expect(decisions.some(d => d.decision.includes('Kubernetes'))).toBe(true);
  });

  it('should generate DevOps artifacts', async () => {
    const input = {
      context: {
        infrastructure: { type: 'cloud' },
        deployment: { strategy: 'rolling' },
        // Mock dependencies to satisfy agent requirements
        decisions: [
          { agentId: 'infrastructure-design-agent' },
          { agentId: 'security-architecture-agent' },
          { agentId: 'performance-optimization-agent' },
        ],
      },
    };

    const output = await agent.execute(input);

    expect(output.artifacts.length).toBeGreaterThan(0);
    const artifactNames = output.artifacts.map(a => a.name);
    expect(artifactNames.some(n => n.includes('CI/CD'))).toBe(true);
    expect(artifactNames.some(n => n.includes('Dockerfile'))).toBe(true);
    expect(artifactNames.some(n => n.includes('Kubernetes'))).toBe(true);
  });

  it('should include runbook in artifacts', async () => {
    const input = {
      context: {
        infrastructure: { type: 'cloud' },
        deployment: { strategy: 'rolling' },
        // Mock dependencies to satisfy agent requirements
        decisions: [
          { agentId: 'infrastructure-design-agent' },
          { agentId: 'security-architecture-agent' },
          { agentId: 'performance-optimization-agent' },
        ],
      },
    };

    const output = await agent.execute(input);

    const runbook = output.artifacts.find(a => a.name.includes('Runbook'));
    expect(runbook).toBeDefined();
    expect(runbook?.content).toContain('Deployment Procedures');
  });

  it('should have high confidence in decisions', async () => {
    const input = {
      context: {
        infrastructure: { type: 'cloud' },
        deployment: { strategy: 'rolling' },
        // Mock dependencies to satisfy agent requirements
        decisions: [
          { agentId: 'infrastructure-design-agent' },
          { agentId: 'security-architecture-agent' },
          { agentId: 'performance-optimization-agent' },
        ],
      },
    };

    const output = await agent.execute(input);

    output.decisions.forEach(decision => {
      expect(decision.confidence).toBeGreaterThan(0.8);
    });
  });
});
