/**
 * Base Agent Class
 *
 * Abstract base class that all specialized agents extend.
 * Provides common functionality for agent communication, decision making, and validation.
 */

import { z } from 'zod';
import type { ArchitecturalDecision, Artifact } from '../shared/types/index.js';

// Base schemas for agent inputs and outputs
export const BaseAgentInputSchema = z.object({
  context: z.object({}).passthrough(),
  requirements: z.object({}).passthrough().optional(),
  constraints: z.array(z.string()).optional(),
});

export const BaseAgentOutputSchema = z.object({
  decisions: z.array(z.any()),
  artifacts: z.array(z.any()),
  confidence: z.number().min(0).max(1),
  recommendations: z.array(z.string()).optional(),
  next_steps: z.array(z.string()).optional(),
});

export type BaseAgentInput = z.infer<typeof BaseAgentInputSchema>;
export type BaseAgentOutput = z.infer<typeof BaseAgentOutputSchema>;

/**
 * Abstract base class for all architecture agents
 */
export abstract class BaseAgent {
  protected readonly agentId: string;
  protected readonly phase: string;
  protected readonly capabilities: string[];
  protected readonly dependencies: string[];

  constructor(
    agentId: string,
    phase: string,
    capabilities: string[] = [],
    dependencies: string[] = []
  ) {
    this.agentId = agentId;
    this.phase = phase;
    this.capabilities = capabilities;
    this.dependencies = dependencies;
  }

  /**
   * Main entry point for agent execution
   */
  async execute(input: BaseAgentInput): Promise<BaseAgentOutput> {
    const startTime = Date.now();

    console.error(`Agent ${this.agentId} starting execution`, {
      agentId: this.agentId,
      phase: this.phase,
      capabilities: this.capabilities,
    });

    try {
      // Validate input
      const validatedInput = this.validateInput(input);

      // Check dependencies
      await this.checkDependencies(validatedInput.context);

      // Analyze the current context and requirements
      const analysis = await this.analyze(validatedInput);

      // Make architectural decisions based on analysis
      const decisions = await this.decide(analysis, validatedInput);

      // Generate artifacts (documentation, diagrams, etc.)
      const artifacts = await this.generateArtifacts(decisions, validatedInput);

      // Validate the output
      const output = await this.validate(decisions, artifacts, validatedInput);

      const executionTime = Date.now() - startTime;

      console.error(`Agent ${this.agentId} completed execution`, {
        agentId: this.agentId,
        executionTime,
        decisionsCount: output.decisions.length,
        artifactsCount: output.artifacts.length,
        confidence: output.confidence,
      });

      return output;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      console.error(`Agent ${this.agentId} execution failed`, {
        agentId: this.agentId,
        executionTime,
        error,
      });

      throw error;
    }
  }

  /**
   * Validate agent input
   */
  protected validateInput(input: BaseAgentInput): BaseAgentInput {
    try {
      return BaseAgentInputSchema.parse(input);
    } catch (error) {
      console.error(`Input validation failed for agent ${this.agentId}`, { error });
      throw new Error(`Invalid input for agent ${this.agentId}: ${error}`);
    }
  }

  /**
   * Check if all dependencies are satisfied
   */
  protected async checkDependencies(context: any): Promise<void> {
    const contextDecisions = context.decisions || [];
    const availableAgents = new Set(contextDecisions.map((d: any) => d.agentId));

    for (const dependency of this.dependencies) {
      if (!availableAgents.has(dependency)) {
        throw new Error(`Dependency not satisfied: ${dependency} required by ${this.agentId}`);
      }
    }
  }

  /**
   * Analyze the current context and requirements
   * Must be implemented by each specialized agent
   */
  protected abstract analyze(input: BaseAgentInput): Promise<any>;

  /**
   * Make architectural decisions based on analysis
   * Must be implemented by each specialized agent
   */
  protected abstract decide(analysis: any, input: BaseAgentInput): Promise<ArchitecturalDecision[]>;

  /**
   * Generate artifacts (documentation, diagrams, specifications)
   * Can be overridden by specialized agents
   */
  protected async generateArtifacts(
    decisions: ArchitecturalDecision[],
    _input: BaseAgentInput
  ): Promise<Artifact[]> {
    // Default implementation - create a summary artifact
    return [
      {
        id: `${this.agentId}-summary-${Date.now()}`,
        type: 'document',
        name: `${this.agentId} Summary`,
        content: JSON.stringify(
          {
            agent: this.agentId,
            phase: this.phase,
            decisions: decisions.map(d => ({
              decision: d.decision,
              rationale: d.rationale,
              confidence: d.confidence,
            })),
          },
          null,
          2
        ),
        format: 'json',
        agentId: this.agentId,
        phase: this.phase,
        timestamp: new Date().toISOString(),
      },
    ];
  }

  /**
   * Validate decisions and artifacts
   * Can be overridden by specialized agents for custom validation
   */
  protected async validate(
    decisions: ArchitecturalDecision[],
    artifacts: Artifact[],
    _input: BaseAgentInput
  ): Promise<BaseAgentOutput> {
    // Calculate overall confidence as average of decision confidences
    const avgConfidence =
      decisions.length > 0
        ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length
        : 0.5;

    const output: BaseAgentOutput = {
      decisions,
      artifacts,
      confidence: avgConfidence,
      recommendations: this.generateRecommendations(decisions),
      next_steps: this.generateNextSteps(decisions),
    };

    // Validate output schema
    try {
      return BaseAgentOutputSchema.parse(output);
    } catch (error) {
      console.error(`Output validation failed for agent ${this.agentId}`, { error });
      throw new Error(`Invalid output from agent ${this.agentId}: ${error}`);
    }
  }

  /**
   * Generate recommendations based on decisions
   */
  protected generateRecommendations(decisions: ArchitecturalDecision[]): string[] {
    const recommendations: string[] = [];

    // Check for low confidence decisions
    const lowConfidenceDecisions = decisions.filter(d => d.confidence < 0.7);
    if (lowConfidenceDecisions.length > 0) {
      recommendations.push(
        `Review ${lowConfidenceDecisions.length} low-confidence decisions for additional validation`
      );
    }

    // Check for decisions with many alternatives
    const complexDecisions = decisions.filter(d => d.alternatives.length > 3);
    if (complexDecisions.length > 0) {
      recommendations.push(
        `Consider prototyping for ${complexDecisions.length} complex decisions with many alternatives`
      );
    }

    return recommendations;
  }

  /**
   * Generate next steps based on decisions
   */
  protected generateNextSteps(decisions: ArchitecturalDecision[]): string[] {
    const nextSteps: string[] = [];

    // Suggest validation for high-impact decisions
    const highImpactDecisions = decisions.filter(d =>
      d.consequences.some(
        c => c.toLowerCase().includes('critical') || c.toLowerCase().includes('major')
      )
    );

    if (highImpactDecisions.length > 0) {
      nextSteps.push('Validate high-impact decisions with stakeholders');
    }

    // Suggest documentation for complex decisions
    if (decisions.length > 5) {
      nextSteps.push('Create detailed documentation for architectural decisions');
    }

    return nextSteps;
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      agentId: this.agentId,
      phase: this.phase,
      capabilities: this.capabilities,
      dependencies: this.dependencies,
    };
  }
}
