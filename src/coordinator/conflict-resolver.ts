/**
 * Conflict Resolver
 *
 * Detects and resolves conflicts between architectural decisions made by different agents.
 * Implements various conflict resolution strategies and maintains decision consistency.
 */

import type {
  ArchitecturalDecision,
  Conflict,
  ConflictResolution,
  ArchitectureContext,
} from '../shared/types/index.js';

export class ConflictResolver {
  /**
   * Detect conflicts between architectural decisions
   */
  detectConflicts(
    decisions: ArchitecturalDecision[]
  ): Promise<Conflict[]> {
    console.error('Detecting conflicts in architectural decisions', {
      decisionsCount: decisions.length,
    });

    const conflicts: Conflict[] = [];

    // Check for contradictory decisions
    const contradictions = this.findContradictions(decisions);
    conflicts.push(...contradictions);

    // Check for constraint violations
    const violations = this.findConstraintViolations(decisions);
    conflicts.push(...violations);

    // Check for dependency cycles
    const cycles = this.findDependencyCycles(decisions);
    conflicts.push(...cycles);

    console.error('Conflict detection completed', {
      conflictsFound: conflicts.length,
      contradictions: contradictions.length,
      violations: violations.length,
      cycles: cycles.length,
    });

    return Promise.resolve(conflicts);
  }

  /**
   * Resolve detected conflicts using various strategies
   */
  async resolveConflicts(
    conflicts: Conflict[],
    context: ArchitectureContext
  ): Promise<ArchitecturalDecision[]> {
    console.error('Resolving architectural conflicts', {
      sessionId: context.sessionId,
      conflictsCount: conflicts.length,
    });

    const resolutions: ArchitecturalDecision[] = [];

    for (const conflict of conflicts) {
      try {
        const resolution = await this.resolveConflict(conflict, context);
        if (resolution) {
          conflict.resolution = resolution;
          resolutions.push(...resolution.newDecisions);
        }
      } catch (error) {
        console.error('Failed to resolve conflict', {
          conflictId: conflict.id,
          error,
        });
      }
    }

    console.error('Conflict resolution completed', {
      sessionId: context.sessionId,
      resolutionsCount: resolutions.length,
    });

    return resolutions;
  }

  /**
   * Validate architecture for conflicts and compliance
   */
  validateArchitecture(
    architecture: unknown,
    constraints: string[],
    context: ArchitectureContext
  ): {
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  } {
    console.error('Validating architecture', {
      sessionId: context.sessionId,
      constraintsCount: constraints.length,
    });

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Type guard to check if architecture has expected structure
    const archObj = architecture as Record<string, unknown>;

    // Check for missing critical components
    if (!archObj['components'] || !Array.isArray(archObj['components']) || archObj['components'].length === 0) {
      issues.push('No components defined in architecture');
      recommendations.push('Define at least one component for the system');
    }

    // Check for security considerations
    if (!archObj['security']) {
      issues.push('Security architecture not defined');
      recommendations.push(
        'Add security architecture with authentication and authorization'
      );
    }

    // Check for monitoring and observability
    const deployment = archObj['deployment'] as Record<string, unknown> | undefined;
    if (!deployment?.['monitoring']) {
      issues.push('Monitoring strategy not defined');
      recommendations.push(
        'Define monitoring, logging, and alerting strategies'
      );
    }

    // Validate against constraints
    for (const constraint of constraints) {
      if (
        constraint.toLowerCase().includes('compliance')
      ) {
        const security = archObj['security'] as Record<string, unknown> | undefined;
        if (!security?.['compliance']) {
          issues.push(
            `Compliance constraint "${constraint}" not addressed in security architecture`
          );
          recommendations.push(
            'Add compliance requirements and controls to security architecture'
          );
        }
      }
    }

    const isValid = issues.length === 0;

    console.error('Architecture validation completed', {
      sessionId: context.sessionId,
      isValid,
      issuesCount: issues.length,
      recommendationsCount: recommendations.length,
    });

    return {
      isValid,
      issues,
      recommendations,
    };
  }

  private findContradictions(decisions: ArchitecturalDecision[]): Conflict[] {
    const conflicts: Conflict[] = [];

    // Group decisions by category
    const decisionsByCategory = new Map<string, ArchitecturalDecision[]>();

    for (const decision of decisions) {
      if (!decisionsByCategory.has(decision.category)) {
        decisionsByCategory.set(decision.category, []);
      }
      decisionsByCategory.get(decision.category)!.push(decision);
    }

    // Check for contradictions within each category
    for (const [category, categoryDecisions] of decisionsByCategory) {
      if (categoryDecisions.length > 1) {
        // Simple contradiction detection - different decisions in same category
        const uniqueDecisions = new Set(categoryDecisions.map(d => d.decision));
        if (uniqueDecisions.size > 1) {
          conflicts.push({
            id: `conflict-contradiction-${category}-${Date.now()}`,
            type: 'contradiction',
            description: `Contradictory decisions found in category: ${category}`,
            involvedDecisions: categoryDecisions.map(d => d.id),
            severity: 'high',
          });
        }
      }
    }

    return conflicts;
  }

  private findConstraintViolations(
    _decisions: ArchitecturalDecision[]
  ): Conflict[] {
    const conflicts: Conflict[] = [];

    // TODO: Implement constraint violation detection
    // This would check decisions against known architectural constraints

    return conflicts;
  }

  private findDependencyCycles(decisions: ArchitecturalDecision[]): Conflict[] {
    const conflicts: Conflict[] = [];

    // Build dependency graph
    const graph = new Map<string, string[]>();

    for (const decision of decisions) {
      graph.set(decision.id, decision.dependencies);
    }

    // Detect cycles using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true;
      }
      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const dependencies = graph.get(nodeId) ?? [];
      for (const depId of dependencies) {
        if (hasCycle(depId)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const decisionId of graph.keys()) {
      if (hasCycle(decisionId)) {
        conflicts.push({
          id: `conflict-cycle-${decisionId}-${Date.now()}`,
          type: 'dependency_cycle',
          description: `Dependency cycle detected involving decision: ${decisionId}`,
          involvedDecisions: [decisionId],
          severity: 'critical',
        });
      }
    }

    return conflicts;
  }

  private async resolveConflict(
    conflict: Conflict,
    context: ArchitectureContext
  ): Promise<ConflictResolution | null> {
    switch (conflict.type) {
      case 'contradiction':
        return this.resolveContradiction(conflict, context);

      case 'constraint_violation':
        return this.resolveConstraintViolation(conflict, context);

      case 'dependency_cycle':
        return this.resolveDependencyCycle(conflict, context);

      default:
        console.error('Unknown conflict type', { conflictType: conflict.type });
        return null;
    }
  }

  private resolveContradiction(
    conflict: Conflict,
    context: ArchitectureContext
  ): Promise<ConflictResolution> {
    // Simple resolution strategy: choose the decision with highest confidence
    const involvedDecisions = context.decisions.filter(d =>
      conflict.involvedDecisions.includes(d.id)
    );

    const bestDecision = involvedDecisions.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    return Promise.resolve({
      conflictId: conflict.id,
      strategy: 'highest_confidence',
      modifiedDecisions: conflict.involvedDecisions.filter(
        id => id !== bestDecision.id
      ),
      newDecisions: [],
      rationale: `Selected decision with highest confidence (${bestDecision.confidence})`,
    });
  }

  private resolveConstraintViolation(
    conflict: Conflict,
    _context: ArchitectureContext
  ): Promise<ConflictResolution> {
    return Promise.resolve({
      conflictId: conflict.id,
      strategy: 'constraint_compliance',
      modifiedDecisions: conflict.involvedDecisions,
      newDecisions: [],
      rationale: 'Resolved by ensuring constraint compliance',
    });
  }

  private resolveDependencyCycle(
    conflict: Conflict,
    _context: ArchitectureContext
  ): Promise<ConflictResolution> {
    return Promise.resolve({
      conflictId: conflict.id,
      strategy: 'break_cycle',
      modifiedDecisions: conflict.involvedDecisions,
      newDecisions: [],
      rationale: 'Resolved by breaking circular dependencies',
    });
  }
}
