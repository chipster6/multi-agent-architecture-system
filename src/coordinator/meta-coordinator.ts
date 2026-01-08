/**
 * Meta-Coordinator Agent
 *
 * Orchestrates the execution of 40+ specialized agents across 11 phases
 * of software architecture design. Handles request routing, workflow planning,
 * conflict detection, and context management.
 */

import { z } from 'zod';
import { WorkflowEngine } from './workflow-engine.js';
import { ConflictResolver } from './conflict-resolver.js';
import { createComponentLogger } from '../shared/logger.js';
import type {
  ArchitectureContext,
  RequirementsAnalysis,
  ArchitectureBlueprint,
  ImplementationPlan,
  ArchitecturalDecision,
  Artifact,
} from '../shared/types/index.js';

// Input schemas for validation
const RequirementsInputSchema = z.object({
  description: z.string().min(10),
  constraints: z.array(z.string()).optional(),
  technologies: z.array(z.string()).optional(),
  timeline: z.string().optional(),
  budget: z.string().optional(),
  teamSize: z.number().optional(),
});

const ArchitectureInputSchema = z.object({
  requirements: z.object({}).passthrough(),
  preferences: z
    .object({
      cloudProvider: z.string().optional(),
      architectureStyle: z.string().optional(),
      scalabilityRequirements: z.string().optional(),
    })
    .optional(),
});

const ValidationInputSchema = z.object({
  architecture: z.object({}).passthrough(),
  constraints: z.array(z.string()).optional(),
});

const ImplementationInputSchema = z.object({
  architecture: z.object({}).passthrough(),
  timeline: z.string().optional(),
  teamSize: z.number().optional(),
  priorities: z.array(z.string()).optional(),
});

import type { CoordinatorMemory } from './memory/coordinatorMemory.js';

export class MetaCoordinator {
  private readonly workflowEngine: WorkflowEngine;
  private readonly conflictResolver: ConflictResolver;
  private readonly context: ArchitectureContext;
  private readonly logger = createComponentLogger('MetaCoordinator');
  private readonly memory: CoordinatorMemory | undefined;

  constructor(memory?: CoordinatorMemory) {
    this.workflowEngine = new WorkflowEngine();
    this.conflictResolver = new ConflictResolver();
    this.context = this.initializeContext();
    this.memory = memory;
  }

  private initializeContext(): ArchitectureContext {
    return {
      sessionId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      phase: 'initialization',
      decisions: [],
      artifacts: [],
      conflicts: [],
    };
  }

  /**
   * Analyze business requirements and translate them into architectural constraints
   */
  async analyzeRequirements(
    input: unknown
  ): Promise<{ content: RequirementsAnalysis[] }> {
    const validatedInput = RequirementsInputSchema.parse(input);

    this.logger.info('Starting requirements analysis', {
      sessionId: this.context.sessionId,
      input: validatedInput,
    });

    try {
      // Update context
      this.context.phase = 'requirements-analysis';

      // Execute Phase 1 agents (Strategic Design)
      const analysis = await this.workflowEngine.executePhase1(
        validatedInput,
        this.context
      );

      // Store results in context
      const analysisResult = analysis as { decisions: ArchitecturalDecision[]; artifacts: Artifact[] };
      this.context.decisions.push(...analysisResult.decisions);
      this.context.artifacts.push(...analysisResult.artifacts);

      if (this.memory) {
        await Promise.all([
          ...analysisResult.decisions.map(decision =>
            this.memory?.recordDecision(decision, this.context.sessionId)
          ),
          ...analysisResult.artifacts.map(artifact =>
            this.memory?.recordArtifact(artifact)
          ),
        ]);
      }

      this.logger.info('Requirements analysis completed', {
        sessionId: this.context.sessionId,
        decisionsCount: analysisResult.decisions.length,
        artifactsCount: analysisResult.artifacts.length,
      });

      return {
        content: [
          {
            requirements: analysis.requirements,
            domainModel: analysis.domainModel,
            systemTopology: analysis.systemTopology,
            constraints: analysis.constraints,
            confidence: analysis.confidence,
          },
        ],
      };
    } catch (error) {
      this.logger.error('Requirements analysis failed', {
        sessionId: this.context.sessionId,
        error,
      });
      throw error;
    }
  }

  /**
   * Generate complete architecture documentation across all phases
   */
  async generateArchitecture(
    input: unknown
  ): Promise<{ content: ArchitectureBlueprint[] }> {
    const validatedInput = ArchitectureInputSchema.parse(input);

    this.logger.info('Starting architecture generation', {
      sessionId: this.context.sessionId,
      input: validatedInput,
    });

    try {
      // Update context
      this.context.phase = 'architecture-generation';

      // Execute all architecture phases (2-10)
      const blueprint = await this.workflowEngine.executeArchitecturePhases(
        validatedInput,
        this.context
      );

      // Check for conflicts
      const conflicts = await this.conflictResolver.detectConflicts(
        this.context.decisions
      );

      if (conflicts.length > 0) {
        this.logger.warn('Conflicts detected during architecture generation', {
          sessionId: this.context.sessionId,
          conflictsCount: conflicts.length,
        });

        // Attempt to resolve conflicts
        const resolutions = await this.conflictResolver.resolveConflicts(
          conflicts,
          this.context
        );

        this.context.conflicts.push(...conflicts);
        this.context.decisions.push(...resolutions);

        if (this.memory) {
          await Promise.all(
            resolutions.map(decision => this.memory.recordDecision(decision, this.context.sessionId))
          );
        }
      }

      this.logger.info('Architecture generation completed', {
        sessionId: this.context.sessionId,
        blueprint: {
          componentsCount: blueprint.components?.length ?? 0,
          servicesCount: blueprint.services?.length ?? 0,
          adrsCount: blueprint.adrs?.length ?? 0,
        },
      });

      return {
        content: [blueprint],
      };
    } catch (error) {
      this.logger.error('Architecture generation failed', {
        sessionId: this.context.sessionId,
        error,
      });
      throw error;
    }
  }

  /**
   * Validate architectural decisions for conflicts and compliance
   */
  validateDecisions(input: unknown): Promise<{
    content: Array<{
      isValid: boolean;
      issues: string[];
      recommendations: string[];
    }>;
  }> {
    const validatedInput = ValidationInputSchema.parse(input);

    this.logger.debug('Starting decision validation', {
      sessionId: this.context.sessionId,
      input: validatedInput,
    });

    try {
      // Update context
      this.context.phase = 'validation';

      // Run validation across all decisions
      const validation = this.conflictResolver.validateArchitecture(
        validatedInput.architecture,
        validatedInput.constraints ?? [],
        this.context
      );

      this.logger.debug('Decision validation completed', {
        sessionId: this.context.sessionId,
        validation: {
          isValid: validation.isValid,
          issuesCount: validation.issues.length,
          recommendationsCount: validation.recommendations.length,
        },
      });

      return Promise.resolve({
        content: [validation],
      });
    } catch (error) {
      this.logger.error('Decision validation failed', {
        sessionId: this.context.sessionId,
        error,
      });
      throw error;
    }
  }

  /**
   * Create detailed implementation plan with task breakdown
   */
  async createImplementationPlan(
    input: unknown
  ): Promise<{ content: ImplementationPlan[] }> {
    const validatedInput = ImplementationInputSchema.parse(input);

    this.logger.info('Starting implementation planning', {
      sessionId: this.context.sessionId,
      input: validatedInput,
    });

    try {
      // Update context
      this.context.phase = 'implementation-planning';

      // Execute Phase 11 (Implementation Planning)
      const plan = await this.workflowEngine.executePhase11(
        validatedInput,
        this.context
      );

      this.logger.info('Implementation planning completed', {
        sessionId: this.context.sessionId,
        plan: {
          phasesCount: plan.phases?.length ?? 0,
          tasksCount: plan.tasks?.length ?? 0,
          milestonesCount: plan.milestones?.length ?? 0,
        },
      });

      return {
        content: [plan],
      };
    } catch (error) {
      this.logger.error('Implementation planning failed', {
        sessionId: this.context.sessionId,
        error,
      });
      throw error;
    }
  }

  /**
   * Get current context state for debugging
   */
  getContext(): ArchitectureContext {
    return { ...this.context };
  }
}
