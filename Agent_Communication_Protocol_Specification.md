# Agent Communication Protocol Specification
## Multi-Agent Software Architecture Design System

**Version**: 1.0.0  
**Date**: December 2025  
**Status**: Design Specification  
**Protocol Name**: AACP (Architecture Agent Communication Protocol)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Protocol Overview](#protocol-overview)
3. [Message Architecture](#message-architecture)
4. [Core Message Types](#core-message-types)
5. [Communication Patterns](#communication-patterns)
6. [Context Propagation](#context-propagation)
7. [State Management](#state-management)
8. [Conflict Resolution Protocol](#conflict-resolution-protocol)
9. [Error Handling & Recovery](#error-handling--recovery)
10. [Security Model](#security-model)
11. [Observability & Tracing](#observability--tracing)
12. [Implementation Guidelines](#implementation-guidelines)
13. [Schema Definitions](#schema-definitions)
14. [Examples](#examples)

---

## Executive Summary

The Architecture Agent Communication Protocol (AACP) defines the standards for inter-agent communication within the Multi-Agent Software Architecture Design System. It enables 40+ specialized agents to collaborate effectively, share context, resolve conflicts, and produce cohesive architectural documentation.

### Key Design Principles

| Principle | Description |
|-----------|-------------|
| **Asynchronous-First** | Non-blocking communication with synchronous fallback for critical paths |
| **Context-Aware** | Full decision history propagates through the agent graph |
| **Conflict-Tolerant** | Built-in mechanisms for detecting and resolving agent disagreements |
| **Observable** | Every message traceable through distributed tracing |
| **Extensible** | Support for dynamic agents and custom message types |
| **Idempotent** | Safe message replay for recovery scenarios |

---

## Protocol Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Message Bus Layer                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Event Router / Dispatcher                     │    │
│  │  • Message routing based on type and destination                │    │
│  │  • Fan-out for broadcast messages                               │    │
│  │  • Priority queue management                                     │    │
│  │  • Dead letter handling                                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│         ┌────────────────────┼────────────────────┐                     │
│         ▼                    ▼                    ▼                     │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐             │
│  │  Request    │      │   Event     │      │  Broadcast  │             │
│  │  Channel    │      │   Stream    │      │   Channel   │             │
│  │  (1:1)      │      │  (Pub/Sub)  │      │   (1:N)     │             │
│  └─────────────┘      └─────────────┘      └─────────────┘             │
└─────────────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  Meta-Coord.    │   │   Domain DDD    │   │   Security      │
│     Agent       │◄──►│     Agent       │◄──►│     Agent       │
│                 │   │                 │   │                 │
│  Inbox:         │   │  Inbox:         │   │  Inbox:         │
│  • Requests     │   │  • Requests     │   │  • Requests     │
│  • Events       │   │  • Events       │   │  • Events       │
│  • Broadcasts   │   │  • Broadcasts   │   │  • Broadcasts   │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

### Protocol Stack

```
┌─────────────────────────────────────────────┐
│  Layer 4: Application Protocol              │
│  • Decision requests/responses              │
│  • Architecture artifacts                   │
│  • ADR generation                          │
├─────────────────────────────────────────────┤
│  Layer 3: Coordination Protocol             │
│  • Workflow orchestration                   │
│  • Conflict resolution                      │
│  • Dependency management                    │
├─────────────────────────────────────────────┤
│  Layer 2: Message Protocol                  │
│  • Envelope structure                       │
│  • Serialization (JSON/MessagePack)         │
│  • Compression                              │
├─────────────────────────────────────────────┤
│  Layer 1: Transport Protocol                │
│  • In-process (function calls)              │
│  • IPC (Unix sockets)                       │
│  • Network (HTTP/2, WebSocket)              │
└─────────────────────────────────────────────┘
```

---

## Message Architecture

### Universal Message Envelope

Every message in AACP uses a common envelope structure that wraps the payload:

```typescript
interface MessageEnvelope<T extends MessagePayload> {
  // === Identity ===
  id: string;                    // UUID v7 (time-ordered)
  correlationId: string;         // Links related messages
  causationId?: string;          // ID of message that caused this one
  
  // === Routing ===
  source: AgentIdentifier;       // Sender agent
  destination: Destination;      // Target agent(s)
  
  // === Metadata ===
  type: MessageType;             // Discriminator for payload type
  version: string;               // Protocol version (semver)
  timestamp: string;             // ISO 8601 with microseconds
  ttl?: number;                  // Time-to-live in milliseconds
  priority: Priority;            // Message priority level
  
  // === Context ===
  context: PropagatedContext;    // Shared state across agents
  tracing: TracingContext;       // Distributed tracing info
  
  // === Payload ===
  payload: T;                    // Type-specific message content
  
  // === Security ===
  auth?: AuthContext;            // Authentication/authorization
  signature?: string;            // Message integrity (optional)
}

interface AgentIdentifier {
  id: string;                    // Unique agent instance ID
  type: AgentType;               // Agent classification
  phase: number;                 // Workflow phase (1-11)
  instance?: string;             // For scaled agents
}

type Destination = 
  | { type: 'direct'; agentId: string }
  | { type: 'broadcast'; channel: string }
  | { type: 'multicast'; agentIds: string[] }
  | { type: 'coordinator' }
  | { type: 'reply' };           // Reply to source

type Priority = 'critical' | 'high' | 'normal' | 'low' | 'background';
```

### Agent Type Enumeration

```typescript
enum AgentType {
  // Meta Layer
  META_COORDINATOR = 'meta_coordinator',
  DYNAMIC_FACTORY = 'dynamic_factory',
  IMPLEMENTATION_PLANNER = 'implementation_planner',
  
  // Phase 1: Strategic Design
  REQUIREMENTS_ANALYSIS = 'requirements_analysis',
  DOMAIN_DRIVEN_DESIGN = 'domain_driven_design',
  SYSTEM_TOPOLOGY = 'system_topology',
  
  // Phase 2: Infrastructure
  CLOUD_INFRASTRUCTURE = 'cloud_infrastructure',
  CONTAINER_ORCHESTRATION = 'container_orchestration',
  NETWORK_ARCHITECTURE = 'network_architecture',
  AWS_SPECIALIST = 'aws_specialist',
  AZURE_SPECIALIST = 'azure_specialist',
  GCP_SPECIALIST = 'gcp_specialist',
  
  // Phase 3: Data & Integration
  DATA_ARCHITECTURE = 'data_architecture',
  CACHING_STRATEGY = 'caching_strategy',
  EVENT_STREAMING = 'event_streaming',
  API_DESIGN = 'api_design',
  INTEGRATION_PATTERNS = 'integration_patterns',
  
  // Phase 4: Application
  BACKEND_ARCHITECTURE = 'backend_architecture',
  FRONTEND_ARCHITECTURE = 'frontend_architecture',
  
  // Phase 5: AI/ML
  AI_INTEGRATION_ORCHESTRATOR = 'ai_integration_orchestrator',
  LLM_INTEGRATION = 'llm_integration',
  ML_PIPELINE = 'ml_pipeline',
  VECTOR_DATABASE = 'vector_database',
  AI_SAFETY_GOVERNANCE = 'ai_safety_governance',
  
  // Phase 6: Security
  SECURITY_ARCHITECTURE = 'security_architecture',
  IAM = 'iam',
  COMPLIANCE_GOVERNANCE = 'compliance_governance',
  
  // Phase 7: Resilience
  RESILIENCE_FAULT_TOLERANCE = 'resilience_fault_tolerance',
  HIGH_AVAILABILITY = 'high_availability',
  DISASTER_RECOVERY = 'disaster_recovery',
  OBSERVABILITY_MONITORING = 'observability_monitoring',
  
  // Phase 8: Performance
  PERFORMANCE_OPTIMIZATION = 'performance_optimization',
  SCALABILITY_DESIGN = 'scalability_design',
  LOAD_BALANCING = 'load_balancing',
  
  // Phase 9: DevOps
  CICD_PIPELINE = 'cicd_pipeline',
  INFRASTRUCTURE_AS_CODE = 'infrastructure_as_code',
  TESTING_STRATEGY = 'testing_strategy',
  RELEASE_MANAGEMENT = 'release_management',
  
  // Phase 10: Governance
  COST_OPTIMIZATION = 'cost_optimization',
  TECHNICAL_DEBT = 'technical_debt',
  DOCUMENTATION_STANDARDS = 'documentation_standards',
  
  // Phase 11: Emerging Tech
  IOT_EDGE_COMPUTING = 'iot_edge_computing',
  BLOCKCHAIN_WEB3 = 'blockchain_web3',
  
  // Dynamic Agents
  EPHEMERAL = 'ephemeral'
}
```

---

## Core Message Types

### Message Type Taxonomy

```
MessageType
├── Request Messages
│   ├── DECISION_REQUEST          # Request architectural decision
│   ├── CONSULTATION_REQUEST      # Request advisory input
│   ├── VALIDATION_REQUEST        # Request validation of a decision
│   └── INFORMATION_REQUEST       # Request data/context
│
├── Response Messages
│   ├── DECISION_RESPONSE         # Architectural decision made
│   ├── CONSULTATION_RESPONSE     # Advisory input provided
│   ├── VALIDATION_RESPONSE       # Validation result
│   └── INFORMATION_RESPONSE      # Requested data provided
│
├── Event Messages
│   ├── DECISION_MADE             # Announcement of decision
│   ├── CONTEXT_UPDATED           # Shared context changed
│   ├── PHASE_TRANSITION          # Workflow phase changed
│   ├── CONFLICT_DETECTED         # Conflicting decisions found
│   └── AGENT_STATUS_CHANGED      # Agent lifecycle event
│
├── Coordination Messages
│   ├── WORKFLOW_START            # Begin orchestration
│   ├── WORKFLOW_COMPLETE         # Orchestration finished
│   ├── DEPENDENCY_SATISFIED      # Upstream dependency ready
│   ├── BARRIER_SYNC              # Synchronization point
│   └── CHECKPOINT                # Save state marker
│
└── System Messages
    ├── HEARTBEAT                 # Agent liveness
    ├── CAPABILITY_ANNOUNCE       # Agent capabilities
    ├── ERROR                     # Error notification
    └── ACKNOWLEDGMENT            # Message receipt confirm
```

### 1. Decision Request

Primary message type for requesting architectural decisions from agents:

```typescript
interface DecisionRequest {
  type: 'DECISION_REQUEST';
  
  // What decision is needed
  decision: {
    domain: DecisionDomain;        // e.g., 'database', 'api_protocol'
    question: string;              // Natural language question
    scope: string;                 // System/service scope
    urgency: 'blocking' | 'parallel' | 'optional';
  };
  
  // Input context for the decision
  context: {
    requirements: Requirement[];   // Relevant requirements
    constraints: Constraint[];     // Must-haves and limitations
    preferences: Preference[];     // Nice-to-haves
    assumptions: Assumption[];     // Working assumptions
  };
  
  // Related decisions
  dependencies: {
    requires: DecisionReference[]; // Decisions that must exist
    influences: DecisionReference[]; // Decisions to consider
    conflicts_with?: DecisionReference[]; // Known conflicts
  };
  
  // Expected output format
  expectedOutput: {
    format: 'recommendation' | 'comparison' | 'validation';
    includeAlternatives: boolean;
    maxAlternatives?: number;
    requireQuantification: boolean;
  };
  
  // Collaboration requirements
  collaboration: {
    primaryAgent: AgentType;
    consultAgents: AgentType[];    // Must consult
    notifyAgents: AgentType[];     // Inform of decision
  };
}

type DecisionDomain = 
  | 'architecture_style'
  | 'database_selection'
  | 'api_protocol'
  | 'authentication'
  | 'messaging'
  | 'caching'
  | 'deployment'
  | 'infrastructure'
  | 'security'
  | 'observability'
  | 'testing'
  | 'ai_ml'
  | 'custom';

interface DecisionReference {
  decisionId: string;
  agentType: AgentType;
  domain: DecisionDomain;
  summary: string;
}
```

### 2. Decision Response

Response containing an architectural decision and its rationale:

```typescript
interface DecisionResponse {
  type: 'DECISION_RESPONSE';
  
  // Request linkage
  requestId: string;               // Original request ID
  
  // The decision
  decision: {
    id: string;                    // Unique decision ID
    domain: DecisionDomain;
    recommendation: string;        // Primary recommendation
    confidence: number;            // 0.0 - 1.0
    status: 'final' | 'tentative' | 'requires_input';
  };
  
  // Rationale
  rationale: {
    summary: string;               // Brief explanation
    reasoning: ReasoningStep[];    // Chain of thought
    keyFactors: Factor[];          // Decision drivers
  };
  
  // Trade-off analysis
  tradeoffs: {
    pros: TradeoffItem[];
    cons: TradeoffItem[];
    risks: Risk[];
    mitigations: Mitigation[];
  };
  
  // Alternatives considered
  alternatives: Alternative[];
  
  // Impact analysis
  impact: {
    affects: AffectedComponent[];
    dependencies: {
      enables: string[];           // Decisions this unlocks
      requires: string[];          // Decisions needed
      conflicts: string[];         // Potential conflicts
    };
    estimatedEffort: EffortEstimate;
  };
  
  // Generated artifacts
  artifacts: {
    adr?: ADRDocument;             // Architecture Decision Record
    diagrams?: Diagram[];
    specifications?: Specification[];
  };
  
  // Follow-up actions
  followUp: {
    questionsForUser: Question[];
    recommendedConsultations: ConsultationRecommendation[];
    blockedPendingDecisions: string[];
  };
}

interface ReasoningStep {
  step: number;
  thought: string;
  evidence?: string;
  conclusion: string;
}

interface Factor {
  name: string;
  weight: number;                  // 0.0 - 1.0
  score: number;                   // How well recommendation satisfies
  explanation: string;
}

interface TradeoffItem {
  aspect: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  quantification?: string;
}

interface Alternative {
  name: string;
  description: string;
  score: number;                   // Overall score
  factors: Factor[];
  whyNotChosen: string;
}

interface Risk {
  id: string;
  description: string;
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  category: string;
}

interface Mitigation {
  riskId: string;
  strategy: string;
  effectiveness: 'partial' | 'full';
}
```

### 3. Consultation Request/Response

For advisory input without making a binding decision:

```typescript
interface ConsultationRequest {
  type: 'CONSULTATION_REQUEST';
  
  // What input is needed
  consultation: {
    topic: string;
    question: string;
    perspective: 'technical' | 'security' | 'cost' | 'operational';
  };
  
  // Context being evaluated
  proposal: {
    description: string;
    options?: string[];
    currentLeaning?: string;
  };
  
  // What kind of input
  inputType: 'opinion' | 'constraints' | 'requirements' | 'risks' | 'validation';
  
  // Urgency
  deadline?: string;               // ISO 8601
  blocking: boolean;
}

interface ConsultationResponse {
  type: 'CONSULTATION_RESPONSE';
  
  requestId: string;
  
  // The input
  input: {
    recommendation?: string;
    concerns: Concern[];
    constraints: Constraint[];
    suggestions: Suggestion[];
    approval?: boolean;
  };
  
  // Confidence and caveats
  confidence: number;
  caveats: string[];
  
  // Further consultation
  deferTo?: AgentType[];           // Other agents to consult
}

interface Concern {
  severity: 'info' | 'warning' | 'critical';
  category: string;
  description: string;
  recommendation?: string;
}

interface Suggestion {
  type: 'enhancement' | 'alternative' | 'consideration';
  description: string;
  rationale: string;
  effort: 'low' | 'medium' | 'high';
}
```

### 4. Event Messages

Broadcast notifications about system state changes:

```typescript
interface DecisionMadeEvent {
  type: 'DECISION_MADE';
  
  decision: {
    id: string;
    domain: DecisionDomain;
    summary: string;
    agent: AgentType;
    phase: number;
  };
  
  impact: {
    blocksAgents: AgentType[];     // Agents waiting on this
    enablesAgents: AgentType[];    // Agents now unblocked
    affectsDecisions: string[];    // Related decision IDs
  };
  
  artifacts: string[];             // Generated artifact paths
}

interface ConflictDetectedEvent {
  type: 'CONFLICT_DETECTED';
  
  conflict: {
    id: string;
    severity: 'minor' | 'major' | 'critical';
    description: string;
  };
  
  parties: {
    agent: AgentType;
    decisionId: string;
    position: string;
  }[];
  
  resolution: {
    required: boolean;
    suggestedApproach: string;
    escalateTo?: AgentType;
  };
}

interface PhaseTransitionEvent {
  type: 'PHASE_TRANSITION';
  
  transition: {
    from: number;
    to: number;
    trigger: 'completion' | 'skip' | 'rollback';
  };
  
  summary: {
    decisionsCompleted: number;
    conflictsResolved: number;
    artifactsGenerated: string[];
  };
  
  nextPhase: {
    agents: AgentType[];
    estimatedDuration: number;     // milliseconds
    blockedBy: string[];           // Outstanding dependencies
  };
}

interface ContextUpdatedEvent {
  type: 'CONTEXT_UPDATED';
  
  update: {
    path: string;                  // JSON path to updated value
    previousValue: any;
    newValue: any;
    reason: string;
  };
  
  source: AgentType;
  affectsAgents: AgentType[];
}
```

### 5. Coordination Messages

Workflow orchestration and synchronization:

```typescript
interface WorkflowStartMessage {
  type: 'WORKFLOW_START';
  
  workflow: {
    id: string;
    name: string;
    requestedBy: string;           // User or system
  };
  
  scope: {
    phases: number[];              // Phases to execute
    agents: AgentType[];           // Agents to involve
    outputFormats: string[];       // Required outputs
  };
  
  initialContext: PropagatedContext;
  
  constraints: {
    timeout: number;
    maxIterations: number;
    qualityThreshold: number;
  };
}

interface DependencySatisfiedMessage {
  type: 'DEPENDENCY_SATISFIED';
  
  dependency: {
    id: string;
    type: 'decision' | 'artifact' | 'validation';
    provider: AgentType;
  };
  
  consumers: AgentType[];          // Agents waiting on this
  
  artifact?: {
    type: string;
    location: string;
    checksum: string;
  };
}

interface BarrierSyncMessage {
  type: 'BARRIER_SYNC';
  
  barrier: {
    id: string;
    name: string;                  // e.g., "phase_2_complete"
    requiredAgents: AgentType[];
  };
  
  status: 'waiting' | 'ready' | 'released';
  
  arrived: AgentType[];            // Agents that reached barrier
  missing: AgentType[];            // Agents still working
}
```

---

## Communication Patterns

### Pattern 1: Request-Response (Synchronous)

```
┌──────────────┐         ┌──────────────┐
│   Agent A    │         │   Agent B    │
└──────┬───────┘         └──────┬───────┘
       │                        │
       │  DecisionRequest       │
       │───────────────────────►│
       │                        │
       │                        │ Processing...
       │                        │
       │  DecisionResponse      │
       │◄───────────────────────│
       │                        │
```

**Use Cases:**
- Blocking dependency resolution
- Validation requests
- Critical path decisions

**Implementation:**

```typescript
class RequestResponsePattern {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  
  async request<T extends MessagePayload>(
    destination: AgentType,
    payload: T,
    options: RequestOptions = {}
  ): Promise<ResponsePayload> {
    const envelope = this.createEnvelope(destination, payload);
    
    const promise = new Promise((resolve, reject) => {
      this.pendingRequests.set(envelope.id, {
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.pendingRequests.delete(envelope.id);
          reject(new TimeoutError(envelope.id));
        }, options.timeout ?? 30000)
      });
    });
    
    await this.messageBus.send(envelope);
    return promise;
  }
  
  handleResponse(envelope: MessageEnvelope<ResponsePayload>) {
    const pending = this.pendingRequests.get(envelope.correlationId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(envelope.correlationId);
      pending.resolve(envelope.payload);
    }
  }
}
```

### Pattern 2: Fire-and-Forget (Asynchronous)

```
┌──────────────┐         ┌──────────────┐
│   Agent A    │         │   Agent B    │
└──────┬───────┘         └──────┬───────┘
       │                        │
       │  Event/Notification    │
       │───────────────────────►│
       │                        │
       │  (no response)         │
       │                        │
```

**Use Cases:**
- Decision announcements
- Context updates
- Status notifications

### Pattern 3: Publish-Subscribe (Broadcast)

```
┌──────────────┐
│   Agent A    │
└──────┬───────┘
       │
       │  Event (topic: "decisions.database")
       │
       ▼
┌──────────────────────────────────────┐
│           Message Bus                 │
│                                      │
│   Topic: decisions.database          │
│   Subscribers: [B, C, D]             │
└──────────────────────────────────────┘
       │
       ├───────────────┬───────────────┐
       ▼               ▼               ▼
┌──────────────┐┌──────────────┐┌──────────────┐
│   Agent B    ││   Agent C    ││   Agent D    │
└──────────────┘└──────────────┘└──────────────┘
```

**Subscription Channels:**

```typescript
const CHANNELS = {
  // Decision announcements by domain
  'decisions.architecture': ['meta_coordinator', 'documentation_standards'],
  'decisions.database': ['caching_strategy', 'event_streaming', 'performance_optimization'],
  'decisions.api': ['frontend_architecture', 'integration_patterns', 'security_architecture'],
  'decisions.security': ['*'],  // All agents subscribe
  'decisions.infrastructure': ['container_orchestration', 'network_architecture', 'cicd_pipeline'],
  
  // Phase transitions
  'workflow.phase': ['*'],
  
  // Conflicts
  'conflicts.detected': ['meta_coordinator'],
  'conflicts.resolved': ['*'],
  
  // Context updates
  'context.requirements': ['*'],
  'context.constraints': ['*'],
  
  // System health
  'system.heartbeat': ['meta_coordinator'],
  'system.errors': ['meta_coordinator', 'observability_monitoring']
};
```

### Pattern 4: Request-Multicast

```
┌──────────────┐
│   Agent A    │
└──────┬───────┘
       │
       │  ConsultationRequest (multicast)
       │
       ├───────────────┬───────────────┐
       ▼               ▼               ▼
┌──────────────┐┌──────────────┐┌──────────────┐
│   Agent B    ││   Agent C    ││   Agent D    │
└──────┬───────┘└──────┬───────┘└──────┬───────┘
       │               │               │
       │               │               │
       │  Response B   │  Response C   │  Response D
       │               │               │
       └───────────────┼───────────────┘
                       │
                       ▼
               ┌──────────────┐
               │   Agent A    │
               │  (aggregate) │
               └──────────────┘
```

**Use Cases:**
- Cross-cutting concern validation (security review)
- Multi-perspective consultation
- Consensus gathering

**Implementation:**

```typescript
interface MulticastRequest {
  minResponses: number;           // Minimum responses needed
  maxWait: number;                // Max time to wait
  aggregation: 'all' | 'majority' | 'any';
  failOnConflict: boolean;
}

async function multicastRequest(
  targets: AgentType[],
  payload: ConsultationRequest,
  options: MulticastRequest
): Promise<AggregatedResponse> {
  const responses: ConsultationResponse[] = [];
  const errors: Error[] = [];
  
  const promises = targets.map(target => 
    this.request(target, payload)
      .then(r => responses.push(r))
      .catch(e => errors.push(e))
  );
  
  // Wait for minimum responses or timeout
  await Promise.race([
    waitForN(responses, options.minResponses),
    delay(options.maxWait)
  ]);
  
  return aggregateResponses(responses, options.aggregation);
}
```

### Pattern 5: Saga (Distributed Transaction)

For complex multi-agent decisions requiring rollback capability:

```
┌──────────────────────────────────────────────────────────────────┐
│                        Saga Coordinator                          │
└──────────────────────────────────────────────────────────────────┘
       │
       │ Step 1: Data Architecture Decision
       ▼
┌──────────────┐     Success
│ Data Agent   │────────────────┐
└──────────────┘                │
                                │
       │ Step 2: Caching Strategy │
       ▼                         │
┌──────────────┐     Success     │
│ Cache Agent  │─────────────────┤
└──────────────┘                 │
                                 │
       │ Step 3: Event Streaming │
       ▼                         │
┌──────────────┐     FAILURE!    │
│ Event Agent  │                 │
└──────────────┘                 │
       │                         │
       │ Compensating Actions    │
       ▼                         │
┌──────────────┐                 │
│ Cache Agent  │◄────────────────┤ Rollback
│  (compensate)│                 │
└──────────────┘                 │
       │                         │
       ▼                         │
┌──────────────┐                 │
│ Data Agent   │◄────────────────┘ Rollback
│  (compensate)│
└──────────────┘
```

**Implementation:**

```typescript
interface SagaStep {
  agent: AgentType;
  action: DecisionRequest;
  compensation: CompensationAction;
  timeout: number;
}

interface SagaDefinition {
  id: string;
  steps: SagaStep[];
  onFailure: 'rollback' | 'continue' | 'pause';
}

class SagaCoordinator {
  async executeSaga(saga: SagaDefinition): Promise<SagaResult> {
    const completedSteps: CompletedStep[] = [];
    
    for (const step of saga.steps) {
      try {
        const result = await this.executeStep(step);
        completedSteps.push({ step, result });
      } catch (error) {
        if (saga.onFailure === 'rollback') {
          await this.compensate(completedSteps.reverse());
        }
        throw new SagaFailureError(saga.id, step, error, completedSteps);
      }
    }
    
    return { status: 'completed', steps: completedSteps };
  }
  
  private async compensate(steps: CompletedStep[]) {
    for (const { step, result } of steps) {
      await this.executeCompensation(step.compensation, result);
    }
  }
}
```

---

## Context Propagation

### Propagated Context Structure

Every message carries context that accumulates through the workflow:

```typescript
interface PropagatedContext {
  // === Project Context ===
  project: {
    id: string;
    name: string;
    type: ProjectType;
    startedAt: string;
  };
  
  // === Requirements Context ===
  requirements: {
    functional: FunctionalRequirement[];
    nonFunctional: NonFunctionalRequirement[];
    constraints: Constraint[];
    assumptions: Assumption[];
  };
  
  // === Decision History ===
  decisions: {
    byDomain: Map<DecisionDomain, Decision[]>;
    byAgent: Map<AgentType, Decision[]>;
    byPhase: Map<number, Decision[]>;
    conflicts: ConflictRecord[];
  };
  
  // === Architecture State ===
  architecture: {
    style: ArchitectureStyle;
    services: ServiceDefinition[];
    dataStores: DataStoreDefinition[];
    integrations: IntegrationDefinition[];
    security: SecurityProfile;
  };
  
  // === Workflow State ===
  workflow: {
    currentPhase: number;
    completedPhases: number[];
    activeAgents: AgentType[];
    blockedAgents: Map<AgentType, string[]>;  // agent -> blocking reasons
  };
  
  // === User Preferences ===
  preferences: {
    technologyBias: TechnologyPreference[];
    budgetConstraints: BudgetProfile;
    teamSkills: SkillProfile;
    riskTolerance: 'low' | 'medium' | 'high';
  };
  
  // === Artifacts Generated ===
  artifacts: {
    adrs: ADRReference[];
    diagrams: DiagramReference[];
    specifications: SpecReference[];
  };
}
```

### Context Operations

```typescript
class ContextStore {
  private context: PropagatedContext;
  private history: ContextSnapshot[] = [];
  
  // Immutable update with history
  update(path: string, value: any, reason: string): PropagatedContext {
    const snapshot = this.createSnapshot();
    this.history.push(snapshot);
    
    this.context = this.immutableSet(this.context, path, value);
    
    this.emit('context.updated', {
      path,
      previousValue: get(snapshot.context, path),
      newValue: value,
      reason
    });
    
    return this.context;
  }
  
  // Get context scoped for specific agent
  getForAgent(agentType: AgentType): ScopedContext {
    const relevantDecisions = this.getRelevantDecisions(agentType);
    const relevantContext = this.filterContextForAgent(agentType);
    
    return {
      ...relevantContext,
      decisions: relevantDecisions,
      collaborators: this.getCollaborators(agentType)
    };
  }
  
  // Add decision to context
  addDecision(decision: Decision): void {
    this.update(
      `decisions.byDomain.${decision.domain}`,
      [...(this.context.decisions.byDomain.get(decision.domain) || []), decision],
      `New decision from ${decision.agentType}`
    );
  }
  
  // Time-travel for debugging
  rollbackTo(snapshotId: string): void {
    const snapshot = this.history.find(s => s.id === snapshotId);
    if (snapshot) {
      this.context = snapshot.context;
    }
  }
}
```

### Context Inheritance Rules

```typescript
const CONTEXT_INHERITANCE: Record<AgentType, ContextInheritance> = {
  // Phase 1 agents get minimal context
  [AgentType.REQUIREMENTS_ANALYSIS]: {
    inherit: ['project', 'preferences'],
    ignore: ['decisions', 'architecture']
  },
  
  // Phase 2 agents inherit from Phase 1
  [AgentType.CLOUD_INFRASTRUCTURE]: {
    inherit: ['*'],
    filter: {
      decisions: ['architecture_style', 'system_topology']
    }
  },
  
  // Cross-cutting agents get full context
  [AgentType.SECURITY_ARCHITECTURE]: {
    inherit: ['*'],
    filter: {} // No filtering
  },
  
  // Downstream agents get accumulated context
  [AgentType.CICD_PIPELINE]: {
    inherit: ['*'],
    filter: {
      decisions: [
        'architecture_style',
        'container_orchestration',
        'infrastructure',
        'testing'
      ]
    }
  }
};
```

---

## State Management

### Agent State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                     Agent State Machine                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│     ┌─────────┐                                                 │
│     │  IDLE   │◄────────────────────────────────┐               │
│     └────┬────┘                                 │               │
│          │ receive(DecisionRequest)             │               │
│          ▼                                      │               │
│     ┌─────────┐                                 │               │
│     │ANALYZING│                                 │               │
│     └────┬────┘                                 │               │
│          │ analyze()                            │               │
│          ▼                                      │               │
│     ┌─────────────┐    needsConsultation()     │               │
│     │ CONSULTING  │◄─────────────┐              │               │
│     └──────┬──────┘              │              │               │
│            │                     │              │               │
│            │ allResponsesReceived()             │               │
│            ▼                     │              │               │
│     ┌─────────────┐              │              │               │
│     │  DECIDING   │──────────────┘              │               │
│     └──────┬──────┘  needsMoreInput()           │               │
│            │                                    │               │
│            │ decide()                           │               │
│            ▼                                    │               │
│     ┌─────────────┐                             │               │
│     │ VALIDATING  │                             │               │
│     └──────┬──────┘                             │               │
│            │                                    │               │
│     ┌──────┴──────┐                             │               │
│     │             │                             │               │
│     ▼             ▼                             │               │
│ ┌────────┐  ┌──────────┐                        │               │
│ │COMPLETE│  │CONFLICTED│                        │               │
│ └────┬───┘  └─────┬────┘                        │               │
│      │            │ resolveConflict()           │               │
│      │            └────────────────────────────►│               │
│      │                                          │               │
│      └──────────────────────────────────────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### State Persistence

```typescript
interface AgentState {
  id: string;
  agentType: AgentType;
  status: AgentStatus;
  
  // Current work
  currentRequest?: DecisionRequest;
  consultations: Map<string, ConsultationStatus>;
  
  // Decision progress
  analysis?: AnalysisResult;
  proposedDecision?: Decision;
  validationResult?: ValidationResult;
  
  // History
  completedDecisions: DecisionSummary[];
  conflictHistory: ConflictRecord[];
  
  // Metrics
  metrics: {
    requestsProcessed: number;
    avgProcessingTime: number;
    conflictsEncountered: number;
    consultationsInitiated: number;
  };
  
  // Checkpointing
  lastCheckpoint: string;          // ISO timestamp
  checkpointData: any;
}

class AgentStateManager {
  private state: AgentState;
  private storage: StateStorage;
  
  async checkpoint(): Promise<string> {
    const checkpointId = this.generateCheckpointId();
    await this.storage.save(checkpointId, this.state);
    this.state.lastCheckpoint = new Date().toISOString();
    return checkpointId;
  }
  
  async recover(checkpointId?: string): Promise<void> {
    const id = checkpointId || await this.storage.getLatestCheckpoint(this.state.id);
    if (id) {
      this.state = await this.storage.load(id);
    }
  }
}
```

---

## Conflict Resolution Protocol

### Conflict Detection

```typescript
interface ConflictDetector {
  // Check new decision against existing decisions
  detectConflicts(
    newDecision: Decision,
    existingDecisions: Decision[],
    context: PropagatedContext
  ): Conflict[];
}

interface Conflict {
  id: string;
  type: ConflictType;
  severity: 'minor' | 'major' | 'critical';
  
  parties: ConflictParty[];
  
  description: string;
  technicalDetails: string;
  
  suggestedResolutions: Resolution[];
}

type ConflictType =
  | 'direct_contradiction'      // Mutually exclusive choices
  | 'resource_contention'       // Same resource, different uses
  | 'requirement_violation'     // Decision violates a requirement
  | 'dependency_cycle'          // Circular dependencies
  | 'constraint_violation'      // Breaks a constraint
  | 'tradeoff_disagreement';    // Different priority weightings

interface ConflictParty {
  agent: AgentType;
  decisionId: string;
  position: string;
  rationale: string;
  flexibility: 'fixed' | 'negotiable' | 'flexible';
}
```

### Resolution Strategies

```typescript
enum ResolutionStrategy {
  // Automatic resolution
  PRIORITY_BASED = 'priority_based',      // Higher-priority agent wins
  RECENCY_BASED = 'recency_based',        // More recent decision wins
  CONSTRAINT_BASED = 'constraint_based',  // Use constraints to determine
  
  // Negotiated resolution
  COMPROMISE = 'compromise',               // Find middle ground
  ALTERNATION = 'alternation',             // Use both in different contexts
  DECOMPOSITION = 'decomposition',         // Split the problem
  
  // Escalation
  COORDINATOR_DECISION = 'coordinator',    // Meta-coordinator decides
  USER_INPUT = 'user_input',               // Ask user to decide
  
  // Deferral
  DEFER = 'defer',                         // Delay decision
  PARALLEL_EXPLORATION = 'parallel'        // Explore both paths
}

class ConflictResolver {
  async resolve(conflict: Conflict): Promise<Resolution> {
    // 1. Try automatic resolution first
    const autoResolution = await this.tryAutoResolve(conflict);
    if (autoResolution) return autoResolution;
    
    // 2. Attempt negotiation between parties
    const negotiated = await this.negotiate(conflict);
    if (negotiated) return negotiated;
    
    // 3. Escalate to coordinator
    return this.escalate(conflict);
  }
  
  private async negotiate(conflict: Conflict): Promise<Resolution | null> {
    // Request flexibility assessment from each party
    const assessments = await Promise.all(
      conflict.parties.map(party => 
        this.requestFlexibilityAssessment(party)
      )
    );
    
    // Find potential compromise
    const compromise = this.findCompromise(conflict, assessments);
    
    if (compromise) {
      // Validate compromise with all parties
      const validations = await Promise.all(
        conflict.parties.map(party =>
          this.validateCompromise(party, compromise)
        )
      );
      
      if (validations.every(v => v.acceptable)) {
        return compromise;
      }
    }
    
    return null;
  }
}
```

### Resolution Message Flow

```
┌──────────────┐                              ┌──────────────┐
│ Coordinator  │                              │  Agent A     │
└──────┬───────┘                              └──────┬───────┘
       │                                             │
       │  ConflictNotification                       │
       │────────────────────────────────────────────►│
       │                                             │
       │  FlexibilityAssessmentRequest               │
       │────────────────────────────────────────────►│
       │                                             │
       │  FlexibilityAssessmentResponse              │
       │◄────────────────────────────────────────────│
       │                                             │
       │  (same exchange with Agent B)               │
       │                                             │
       │  CompromiseProposal                         │
       │────────────────────────────────────────────►│
       │                                             │
       │  CompromiseValidation                       │
       │◄────────────────────────────────────────────│
       │                                             │
       │  ResolutionDecision                         │
       │────────────────────────────────────────────►│
       │                                             │
       │  (broadcast to all interested parties)      │
       │                                             │
```

### Conflict Resolution Record

```typescript
interface ConflictResolutionRecord {
  conflictId: string;
  resolvedAt: string;
  
  resolution: {
    strategy: ResolutionStrategy;
    outcome: string;
    rationale: string;
  };
  
  decisions: {
    accepted: DecisionReference[];
    rejected: DecisionReference[];
    modified: {
      original: DecisionReference;
      modified: Decision;
      changes: string[];
    }[];
  };
  
  // For ADR generation
  dissent: {
    agent: AgentType;
    originalPosition: string;
    concerns: string[];
    acknowledgment: string;
  }[];
  
  // Impact
  impact: {
    affectedDecisions: string[];
    retriggeredAgents: AgentType[];
    delayedWorkflow: boolean;
  };
}
```

---

## Error Handling & Recovery

### Error Categories

```typescript
enum ErrorCategory {
  // Transient errors (retryable)
  TIMEOUT = 'timeout',
  NETWORK = 'network',
  RATE_LIMIT = 'rate_limit',
  TEMPORARY_UNAVAILABLE = 'temp_unavailable',
  
  // Agent errors
  AGENT_FAILURE = 'agent_failure',
  INVALID_INPUT = 'invalid_input',
  INVALID_OUTPUT = 'invalid_output',
  STATE_CORRUPTION = 'state_corruption',
  
  // Protocol errors
  MALFORMED_MESSAGE = 'malformed_message',
  UNKNOWN_MESSAGE_TYPE = 'unknown_type',
  VERSION_MISMATCH = 'version_mismatch',
  
  // Workflow errors
  DEPENDENCY_FAILURE = 'dependency_failure',
  CIRCULAR_DEPENDENCY = 'circular_dependency',
  DEADLINE_EXCEEDED = 'deadline_exceeded',
  
  // Business errors
  CONSTRAINT_VIOLATION = 'constraint_violation',
  UNRESOLVABLE_CONFLICT = 'unresolvable_conflict',
  INSUFFICIENT_CONTEXT = 'insufficient_context'
}

interface ErrorMessage {
  type: 'ERROR';
  
  error: {
    id: string;
    category: ErrorCategory;
    code: string;
    message: string;
    details?: any;
  };
  
  source: {
    agent: AgentType;
    operation: string;
    messageId?: string;
  };
  
  recovery: {
    retryable: boolean;
    suggestedAction: RecoveryAction;
    retryAfter?: number;          // milliseconds
  };
  
  context: {
    correlationId: string;
    timestamp: string;
    stackTrace?: string;
  };
}

type RecoveryAction =
  | 'retry'
  | 'retry_with_backoff'
  | 'skip'
  | 'manual_intervention'
  | 'rollback'
  | 'restart_workflow'
  | 'escalate';
```

### Retry Policy

```typescript
interface RetryPolicy {
  maxAttempts: number;
  initialDelay: number;           // milliseconds
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: ErrorCategory[];
  
  // Circuit breaker
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;     // failures before opening
    resetTimeout: number;         // ms before half-open
  };
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    ErrorCategory.TIMEOUT,
    ErrorCategory.NETWORK,
    ErrorCategory.RATE_LIMIT,
    ErrorCategory.TEMPORARY_UNAVAILABLE
  ],
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    resetTimeout: 60000
  }
};

class RetryHandler {
  async withRetry<T>(
    operation: () => Promise<T>,
    policy: RetryPolicy = DEFAULT_RETRY_POLICY
  ): Promise<T> {
    let lastError: Error;
    let delay = policy.initialDelay;
    
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (!this.isRetryable(error, policy)) {
          throw error;
        }
        
        if (attempt < policy.maxAttempts) {
          await this.delay(delay);
          delay = Math.min(delay * policy.backoffMultiplier, policy.maxDelay);
        }
      }
    }
    
    throw new MaxRetriesExceededError(lastError);
  }
}
```

### Dead Letter Queue

```typescript
interface DeadLetterEntry {
  id: string;
  originalMessage: MessageEnvelope<any>;
  error: ErrorMessage;
  attempts: AttemptRecord[];
  status: 'pending' | 'retrying' | 'abandoned' | 'resolved';
  createdAt: string;
  lastAttemptAt: string;
}

interface AttemptRecord {
  attemptNumber: number;
  timestamp: string;
  error: string;
  duration: number;
}

class DeadLetterQueue {
  async enqueue(message: MessageEnvelope<any>, error: ErrorMessage): Promise<void> {
    const entry: DeadLetterEntry = {
      id: generateId(),
      originalMessage: message,
      error,
      attempts: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
      lastAttemptAt: new Date().toISOString()
    };
    
    await this.storage.save(entry);
    this.emit('dlq.enqueued', entry);
  }
  
  async processRetries(): Promise<void> {
    const pending = await this.storage.findByStatus('pending');
    
    for (const entry of pending) {
      if (this.shouldRetry(entry)) {
        await this.retry(entry);
      } else {
        await this.abandon(entry);
      }
    }
  }
}
```

---

## Security Model

### Authentication

```typescript
interface AuthContext {
  // Agent identity
  agentId: string;
  agentType: AgentType;
  instanceId: string;
  
  // Credentials
  credentials: {
    type: 'token' | 'certificate' | 'api_key';
    value: string;
    expiresAt?: string;
  };
  
  // Permissions
  permissions: Permission[];
  
  // Session
  sessionId: string;
  createdAt: string;
}

interface Permission {
  resource: string;               // e.g., 'decisions.database'
  actions: ('read' | 'write' | 'execute')[];
  conditions?: PermissionCondition[];
}

interface PermissionCondition {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'contains';
  value: any;
}
```

### Authorization Matrix

```typescript
const AUTHORIZATION_MATRIX: Record<AgentType, AuthorizationRules> = {
  [AgentType.META_COORDINATOR]: {
    canSendTo: ['*'],
    canReceiveFrom: ['*'],
    canModifyContext: ['*'],
    canResolveConflicts: true,
    canInitiateWorkflow: true
  },
  
  [AgentType.REQUIREMENTS_ANALYSIS]: {
    canSendTo: [
      AgentType.DOMAIN_DRIVEN_DESIGN,
      AgentType.SYSTEM_TOPOLOGY,
      AgentType.META_COORDINATOR
    ],
    canReceiveFrom: [AgentType.META_COORDINATOR],
    canModifyContext: ['requirements'],
    canResolveConflicts: false,
    canInitiateWorkflow: false
  },
  
  [AgentType.SECURITY_ARCHITECTURE]: {
    canSendTo: ['*'],             // Security can advise anyone
    canReceiveFrom: ['*'],
    canModifyContext: ['architecture.security'],
    canResolveConflicts: false,
    canInitiateWorkflow: false,
    specialPermissions: ['veto_insecure_decisions']
  },
  
  // ... other agents
};
```

### Message Signing (Optional)

```typescript
interface SignedEnvelope<T> extends MessageEnvelope<T> {
  signature: {
    algorithm: 'ed25519' | 'rsa-sha256';
    value: string;
    keyId: string;
    signedFields: string[];       // Fields included in signature
  };
}

class MessageSigner {
  sign<T>(envelope: MessageEnvelope<T>): SignedEnvelope<T> {
    const signedFields = ['id', 'source', 'destination', 'type', 'payload', 'timestamp'];
    const dataToSign = this.extractFields(envelope, signedFields);
    const signature = this.crypto.sign(JSON.stringify(dataToSign), this.privateKey);
    
    return {
      ...envelope,
      signature: {
        algorithm: 'ed25519',
        value: signature,
        keyId: this.keyId,
        signedFields
      }
    };
  }
  
  verify<T>(envelope: SignedEnvelope<T>): boolean {
    const dataToVerify = this.extractFields(envelope, envelope.signature.signedFields);
    return this.crypto.verify(
      JSON.stringify(dataToVerify),
      envelope.signature.value,
      this.getPublicKey(envelope.signature.keyId)
    );
  }
}
```

---

## Observability & Tracing

### Tracing Context

```typescript
interface TracingContext {
  // W3C Trace Context compatible
  traceId: string;                // 128-bit hex
  spanId: string;                 // 64-bit hex
  parentSpanId?: string;
  
  // Sampling
  sampled: boolean;
  samplingPriority: number;
  
  // Baggage (propagated key-values)
  baggage: Record<string, string>;
  
  // Timestamps
  startTime: string;
  endTime?: string;
  duration?: number;
}

class TracingPropagator {
  inject(context: TracingContext): Record<string, string> {
    return {
      'traceparent': `00-${context.traceId}-${context.spanId}-${context.sampled ? '01' : '00'}`,
      'tracestate': this.encodeTraceState(context),
      'baggage': this.encodeBaggage(context.baggage)
    };
  }
  
  extract(headers: Record<string, string>): TracingContext {
    const [, traceId, spanId, flags] = headers['traceparent'].split('-');
    return {
      traceId,
      spanId,
      sampled: flags === '01',
      samplingPriority: this.extractSamplingPriority(headers),
      baggage: this.decodeBaggage(headers['baggage']),
      startTime: new Date().toISOString()
    };
  }
  
  createChildSpan(parent: TracingContext): TracingContext {
    return {
      ...parent,
      parentSpanId: parent.spanId,
      spanId: this.generateSpanId(),
      startTime: new Date().toISOString(),
      endTime: undefined,
      duration: undefined
    };
  }
}
```

### Metrics Collection

```typescript
interface AgentMetrics {
  // Message metrics
  messagesReceived: Counter;
  messagesSent: Counter;
  messageProcessingTime: Histogram;
  messageErrors: Counter;
  
  // Decision metrics
  decisionsGenerated: Counter;
  decisionConfidence: Histogram;
  consultationsInitiated: Counter;
  consultationResponseTime: Histogram;
  
  // Conflict metrics
  conflictsDetected: Counter;
  conflictsResolved: Counter;
  conflictResolutionTime: Histogram;
  
  // Resource metrics
  contextSize: Gauge;
  pendingRequests: Gauge;
  processingQueueDepth: Gauge;
}

const METRICS_LABELS = {
  messagesReceived: ['agent_type', 'message_type', 'source_agent'],
  messagesSent: ['agent_type', 'message_type', 'destination_agent'],
  decisionConfidence: ['agent_type', 'decision_domain'],
  conflictsDetected: ['agent_type', 'conflict_type', 'severity']
};
```

### Structured Logging

```typescript
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  
  // Context
  traceId: string;
  spanId: string;
  agentType: AgentType;
  agentId: string;
  
  // Event
  event: string;
  message: string;
  
  // Structured data
  data?: Record<string, any>;
  
  // Error details
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
}

// Example log entries
const exampleLogs: LogEntry[] = [
  {
    timestamp: '2025-12-15T10:30:00.123Z',
    level: 'info',
    traceId: 'abc123',
    spanId: 'def456',
    agentType: AgentType.DATA_ARCHITECTURE,
    agentId: 'data-arch-001',
    event: 'decision.started',
    message: 'Starting database selection decision',
    data: {
      requestId: 'req-789',
      domain: 'database_selection',
      context: { serviceCount: 5, estimatedVolume: '100M records' }
    }
  },
  {
    timestamp: '2025-12-15T10:30:05.456Z',
    level: 'info',
    traceId: 'abc123',
    spanId: 'ghi789',
    agentType: AgentType.DATA_ARCHITECTURE,
    agentId: 'data-arch-001',
    event: 'consultation.requested',
    message: 'Requesting consultation from Performance Agent',
    data: {
      consultationType: 'opinion',
      targetAgent: AgentType.PERFORMANCE_OPTIMIZATION,
      topic: 'database_performance_requirements'
    }
  }
];
```

---

## Implementation Guidelines

### Agent Implementation Template

```typescript
abstract class BaseAgent {
  protected readonly agentType: AgentType;
  protected readonly messageBus: MessageBus;
  protected readonly contextStore: ContextStore;
  protected readonly stateManager: AgentStateManager;
  protected readonly metrics: AgentMetrics;
  protected readonly logger: Logger;
  
  constructor(config: AgentConfig) {
    this.agentType = config.agentType;
    this.messageBus = config.messageBus;
    this.contextStore = config.contextStore;
    this.stateManager = new AgentStateManager(config.agentType);
    this.metrics = createMetrics(config.agentType);
    this.logger = createLogger(config.agentType);
    
    this.registerHandlers();
  }
  
  // === Message Handlers ===
  
  private registerHandlers(): void {
    this.messageBus.subscribe(this.agentType, 'DECISION_REQUEST', this.handleDecisionRequest.bind(this));
    this.messageBus.subscribe(this.agentType, 'CONSULTATION_REQUEST', this.handleConsultationRequest.bind(this));
    this.messageBus.subscribe(this.agentType, 'CONTEXT_UPDATED', this.handleContextUpdate.bind(this));
    this.messageBus.subscribe(this.agentType, 'CONFLICT_DETECTED', this.handleConflict.bind(this));
  }
  
  protected async handleDecisionRequest(
    envelope: MessageEnvelope<DecisionRequest>
  ): Promise<void> {
    const span = this.startSpan('handleDecisionRequest', envelope.tracing);
    
    try {
      this.stateManager.transition('analyzing');
      this.metrics.messagesReceived.inc({ message_type: 'DECISION_REQUEST' });
      
      // 1. Get relevant context
      const context = this.contextStore.getForAgent(this.agentType);
      
      // 2. Analyze the request
      const analysis = await this.analyze(envelope.payload, context);
      
      // 3. Consult collaborators if needed
      if (analysis.requiresConsultation) {
        this.stateManager.transition('consulting');
        const consultations = await this.consultCollaborators(
          envelope.payload.collaboration.consultAgents,
          analysis
        );
        analysis.consultationResults = consultations;
      }
      
      // 4. Make decision
      this.stateManager.transition('deciding');
      const decision = await this.decide(envelope.payload, analysis, context);
      
      // 5. Validate decision
      this.stateManager.transition('validating');
      const validation = await this.validate(decision, context);
      
      if (!validation.valid) {
        // Handle validation failure
        await this.handleValidationFailure(decision, validation, envelope);
        return;
      }
      
      // 6. Send response
      const response = this.buildResponse(envelope, decision);
      await this.messageBus.send(response);
      
      // 7. Broadcast decision
      await this.broadcastDecision(decision);
      
      // 8. Update context
      this.contextStore.addDecision(decision);
      
      this.stateManager.transition('idle');
      this.metrics.decisionsGenerated.inc({ decision_domain: decision.domain });
      
    } catch (error) {
      this.handleError(error, envelope, span);
    } finally {
      this.endSpan(span);
    }
  }
  
  // === Abstract Methods (implement per agent) ===
  
  protected abstract analyze(
    request: DecisionRequest,
    context: ScopedContext
  ): Promise<AnalysisResult>;
  
  protected abstract decide(
    request: DecisionRequest,
    analysis: AnalysisResult,
    context: ScopedContext
  ): Promise<Decision>;
  
  protected abstract validate(
    decision: Decision,
    context: ScopedContext
  ): Promise<ValidationResult>;
  
  // === Helper Methods ===
  
  protected async consultCollaborators(
    collaborators: AgentType[],
    analysis: AnalysisResult
  ): Promise<Map<AgentType, ConsultationResponse>> {
    const results = new Map();
    
    await Promise.all(
      collaborators.map(async (collaborator) => {
        const request: ConsultationRequest = {
          type: 'CONSULTATION_REQUEST',
          consultation: {
            topic: analysis.topic,
            question: analysis.consultationQuestion,
            perspective: this.getCollaboratorPerspective(collaborator)
          },
          proposal: {
            description: analysis.proposal,
            options: analysis.options,
            currentLeaning: analysis.currentLeaning
          },
          inputType: 'opinion',
          blocking: true
        };
        
        try {
          const response = await this.messageBus.request<ConsultationResponse>(
            collaborator,
            request,
            { timeout: 30000 }
          );
          results.set(collaborator, response);
        } catch (error) {
          this.logger.warn('Consultation timeout', { collaborator, error });
        }
      })
    );
    
    return results;
  }
  
  protected buildResponse(
    originalEnvelope: MessageEnvelope<DecisionRequest>,
    decision: Decision
  ): MessageEnvelope<DecisionResponse> {
    return {
      id: generateId(),
      correlationId: originalEnvelope.id,
      causationId: originalEnvelope.id,
      source: {
        id: this.agentType,
        type: this.agentType,
        phase: this.getPhase()
      },
      destination: { type: 'reply' },
      type: 'DECISION_RESPONSE',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      priority: 'normal',
      context: originalEnvelope.context,
      tracing: this.createChildSpan(originalEnvelope.tracing),
      payload: this.mapToDecisionResponse(decision, originalEnvelope.payload)
    };
  }
}
```

### Message Bus Implementation

```typescript
interface MessageBus {
  // Send message
  send<T extends MessagePayload>(envelope: MessageEnvelope<T>): Promise<void>;
  
  // Request-response pattern
  request<R extends MessagePayload>(
    destination: AgentType,
    payload: MessagePayload,
    options?: RequestOptions
  ): Promise<R>;
  
  // Subscribe to messages
  subscribe(
    agent: AgentType,
    messageType: MessageType,
    handler: MessageHandler
  ): Subscription;
  
  // Publish to channel
  publish(channel: string, event: EventMessage): Promise<void>;
  
  // Subscribe to channel
  subscribeChannel(
    channel: string,
    handler: EventHandler
  ): Subscription;
}

class InProcessMessageBus implements MessageBus {
  private handlers: Map<string, MessageHandler[]> = new Map();
  private channels: Map<string, EventHandler[]> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  
  async send<T extends MessagePayload>(envelope: MessageEnvelope<T>): Promise<void> {
    const key = this.getHandlerKey(envelope.destination, envelope.type);
    const handlers = this.handlers.get(key) || [];
    
    // Check if this is a response to a pending request
    if (envelope.correlationId && this.pendingRequests.has(envelope.correlationId)) {
      const pending = this.pendingRequests.get(envelope.correlationId)!;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(envelope.correlationId);
      pending.resolve(envelope.payload);
      return;
    }
    
    // Dispatch to handlers
    await Promise.all(handlers.map(handler => handler(envelope)));
  }
  
  async request<R extends MessagePayload>(
    destination: AgentType,
    payload: MessagePayload,
    options: RequestOptions = {}
  ): Promise<R> {
    const envelope = this.createEnvelope(destination, payload);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(envelope.id);
        reject(new TimeoutError(envelope.id));
      }, options.timeout ?? 30000);
      
      this.pendingRequests.set(envelope.id, { resolve, reject, timeout });
      this.send(envelope);
    });
  }
  
  subscribe(
    agent: AgentType,
    messageType: MessageType,
    handler: MessageHandler
  ): Subscription {
    const key = this.getHandlerKey({ type: 'direct', agentId: agent }, messageType);
    
    if (!this.handlers.has(key)) {
      this.handlers.set(key, []);
    }
    this.handlers.get(key)!.push(handler);
    
    return {
      unsubscribe: () => {
        const handlers = this.handlers.get(key);
        if (handlers) {
          const index = handlers.indexOf(handler);
          if (index > -1) handlers.splice(index, 1);
        }
      }
    };
  }
  
  async publish(channel: string, event: EventMessage): Promise<void> {
    const handlers = this.channels.get(channel) || [];
    const wildcardHandlers = this.channels.get('*') || [];
    
    await Promise.all([
      ...handlers.map(h => h(event)),
      ...wildcardHandlers.map(h => h(event))
    ]);
  }
}
```

---

## Schema Definitions

### JSON Schema for Message Validation

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://arch-agents.io/schemas/message-envelope.json",
  "title": "MessageEnvelope",
  "type": "object",
  "required": [
    "id",
    "correlationId",
    "source",
    "destination",
    "type",
    "version",
    "timestamp",
    "priority",
    "context",
    "tracing",
    "payload"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "Unique message identifier (UUID v7)"
    },
    "correlationId": {
      "type": "string",
      "format": "uuid",
      "description": "Links related messages in a conversation"
    },
    "causationId": {
      "type": "string",
      "format": "uuid",
      "description": "ID of the message that caused this one"
    },
    "source": {
      "$ref": "#/definitions/AgentIdentifier"
    },
    "destination": {
      "$ref": "#/definitions/Destination"
    },
    "type": {
      "type": "string",
      "enum": [
        "DECISION_REQUEST",
        "DECISION_RESPONSE",
        "CONSULTATION_REQUEST",
        "CONSULTATION_RESPONSE",
        "VALIDATION_REQUEST",
        "VALIDATION_RESPONSE",
        "DECISION_MADE",
        "CONTEXT_UPDATED",
        "PHASE_TRANSITION",
        "CONFLICT_DETECTED",
        "WORKFLOW_START",
        "DEPENDENCY_SATISFIED",
        "ERROR",
        "ACKNOWLEDGMENT"
      ]
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    },
    "ttl": {
      "type": "integer",
      "minimum": 0
    },
    "priority": {
      "type": "string",
      "enum": ["critical", "high", "normal", "low", "background"]
    },
    "context": {
      "$ref": "#/definitions/PropagatedContext"
    },
    "tracing": {
      "$ref": "#/definitions/TracingContext"
    },
    "payload": {
      "type": "object"
    }
  },
  "definitions": {
    "AgentIdentifier": {
      "type": "object",
      "required": ["id", "type", "phase"],
      "properties": {
        "id": { "type": "string" },
        "type": { "$ref": "#/definitions/AgentType" },
        "phase": { "type": "integer", "minimum": 1, "maximum": 11 },
        "instance": { "type": "string" }
      }
    },
    "AgentType": {
      "type": "string",
      "enum": [
        "meta_coordinator",
        "dynamic_factory",
        "implementation_planner",
        "requirements_analysis",
        "domain_driven_design",
        "system_topology",
        "cloud_infrastructure",
        "container_orchestration",
        "network_architecture",
        "aws_specialist",
        "azure_specialist",
        "gcp_specialist",
        "data_architecture",
        "caching_strategy",
        "event_streaming",
        "api_design",
        "integration_patterns",
        "backend_architecture",
        "frontend_architecture",
        "ai_integration_orchestrator",
        "llm_integration",
        "ml_pipeline",
        "vector_database",
        "ai_safety_governance",
        "security_architecture",
        "iam",
        "compliance_governance",
        "resilience_fault_tolerance",
        "high_availability",
        "disaster_recovery",
        "observability_monitoring",
        "performance_optimization",
        "scalability_design",
        "load_balancing",
        "cicd_pipeline",
        "infrastructure_as_code",
        "testing_strategy",
        "release_management",
        "cost_optimization",
        "technical_debt",
        "documentation_standards",
        "iot_edge_computing",
        "blockchain_web3",
        "ephemeral"
      ]
    },
    "Destination": {
      "oneOf": [
        {
          "type": "object",
          "required": ["type", "agentId"],
          "properties": {
            "type": { "const": "direct" },
            "agentId": { "type": "string" }
          }
        },
        {
          "type": "object",
          "required": ["type", "channel"],
          "properties": {
            "type": { "const": "broadcast" },
            "channel": { "type": "string" }
          }
        },
        {
          "type": "object",
          "required": ["type", "agentIds"],
          "properties": {
            "type": { "const": "multicast" },
            "agentIds": {
              "type": "array",
              "items": { "type": "string" }
            }
          }
        },
        {
          "type": "object",
          "required": ["type"],
          "properties": {
            "type": { "const": "coordinator" }
          }
        },
        {
          "type": "object",
          "required": ["type"],
          "properties": {
            "type": { "const": "reply" }
          }
        }
      ]
    },
    "TracingContext": {
      "type": "object",
      "required": ["traceId", "spanId", "sampled", "samplingPriority", "baggage", "startTime"],
      "properties": {
        "traceId": { "type": "string", "pattern": "^[a-f0-9]{32}$" },
        "spanId": { "type": "string", "pattern": "^[a-f0-9]{16}$" },
        "parentSpanId": { "type": "string", "pattern": "^[a-f0-9]{16}$" },
        "sampled": { "type": "boolean" },
        "samplingPriority": { "type": "integer" },
        "baggage": { "type": "object" },
        "startTime": { "type": "string", "format": "date-time" },
        "endTime": { "type": "string", "format": "date-time" },
        "duration": { "type": "integer" }
      }
    },
    "PropagatedContext": {
      "type": "object",
      "description": "Full context definition - see Context Propagation section"
    }
  }
}
```

---

## Examples

### Example 1: Database Selection Decision Flow

```typescript
// 1. Meta-Coordinator initiates request
const request: MessageEnvelope<DecisionRequest> = {
  id: 'msg-001',
  correlationId: 'workflow-123',
  source: {
    id: 'meta-coord-001',
    type: AgentType.META_COORDINATOR,
    phase: 0
  },
  destination: { type: 'direct', agentId: 'data-arch-001' },
  type: 'DECISION_REQUEST',
  version: '1.0.0',
  timestamp: '2025-12-15T10:00:00.000Z',
  priority: 'high',
  context: {
    project: { id: 'proj-001', name: 'E-Commerce Platform', type: 'web_application' },
    requirements: {
      functional: [{ id: 'F001', description: 'User management' }],
      nonFunctional: [
        { type: 'performance', metric: 'latency', target: '<100ms' },
        { type: 'scalability', metric: 'users', target: '1M concurrent' }
      ],
      constraints: [{ type: 'budget', value: '$5000/month' }],
      assumptions: []
    },
    decisions: { byDomain: new Map(), byAgent: new Map(), byPhase: new Map(), conflicts: [] },
    architecture: { style: 'microservices', services: [], dataStores: [], integrations: [], security: {} },
    workflow: { currentPhase: 3, completedPhases: [1, 2], activeAgents: [], blockedAgents: new Map() },
    preferences: { technologyBias: [], budgetConstraints: {}, teamSkills: { postgres: 'expert', mongodb: 'intermediate' }, riskTolerance: 'medium' },
    artifacts: { adrs: [], diagrams: [], specifications: [] }
  },
  tracing: {
    traceId: 'abc123def456789012345678901234567',
    spanId: '1234567890abcdef',
    sampled: true,
    samplingPriority: 1,
    baggage: { userId: 'user-001' },
    startTime: '2025-12-15T10:00:00.000Z'
  },
  payload: {
    type: 'DECISION_REQUEST',
    decision: {
      domain: 'database_selection',
      question: 'Select primary database technology for user service',
      scope: 'user-service',
      urgency: 'blocking'
    },
    context: {
      requirements: [
        { type: 'read_heavy', ratio: '80/20' },
        { type: 'consistency', level: 'strong' },
        { type: 'query_patterns', patterns: ['pk_lookup', 'range_scans', 'complex_joins'] }
      ],
      constraints: [
        { type: 'budget', limit: '$500/month for database' },
        { type: 'team_skills', skills: ['PostgreSQL: expert', 'MongoDB: intermediate'] }
      ],
      preferences: [
        { type: 'managed_service', preferred: true }
      ],
      assumptions: [
        { assumption: 'Data volume will grow to 100M records in 2 years' }
      ]
    },
    dependencies: {
      requires: [
        { decisionId: 'dec-001', agentType: AgentType.SYSTEM_TOPOLOGY, domain: 'architecture_style', summary: 'Microservices architecture selected' }
      ],
      influences: [
        { decisionId: 'dec-002', agentType: AgentType.DOMAIN_DRIVEN_DESIGN, domain: 'domain_model', summary: 'User aggregate defined' }
      ]
    },
    expectedOutput: {
      format: 'recommendation',
      includeAlternatives: true,
      maxAlternatives: 3,
      requireQuantification: true
    },
    collaboration: {
      primaryAgent: AgentType.DATA_ARCHITECTURE,
      consultAgents: [AgentType.PERFORMANCE_OPTIMIZATION, AgentType.COST_OPTIMIZATION],
      notifyAgents: [AgentType.CACHING_STRATEGY, AgentType.HIGH_AVAILABILITY]
    }
  }
};

// 2. Data Architecture Agent consults Performance Agent
const consultationRequest: MessageEnvelope<ConsultationRequest> = {
  id: 'msg-002',
  correlationId: 'msg-001',
  causationId: 'msg-001',
  source: {
    id: 'data-arch-001',
    type: AgentType.DATA_ARCHITECTURE,
    phase: 3
  },
  destination: { type: 'direct', agentId: 'perf-opt-001' },
  type: 'CONSULTATION_REQUEST',
  version: '1.0.0',
  timestamp: '2025-12-15T10:00:05.000Z',
  priority: 'high',
  context: request.context,
  tracing: {
    ...request.tracing,
    parentSpanId: request.tracing.spanId,
    spanId: 'fedcba0987654321',
    startTime: '2025-12-15T10:00:05.000Z'
  },
  payload: {
    type: 'CONSULTATION_REQUEST',
    consultation: {
      topic: 'Database performance for user service',
      question: 'What are your performance concerns with PostgreSQL vs MongoDB for this use case?',
      perspective: 'technical'
    },
    proposal: {
      description: 'Considering PostgreSQL for strong consistency and complex joins',
      options: ['PostgreSQL', 'MongoDB', 'CockroachDB'],
      currentLeaning: 'PostgreSQL'
    },
    inputType: 'opinion',
    blocking: true
  }
};

// 3. Performance Agent responds
const consultationResponse: MessageEnvelope<ConsultationResponse> = {
  id: 'msg-003',
  correlationId: 'msg-002',
  causationId: 'msg-002',
  source: {
    id: 'perf-opt-001',
    type: AgentType.PERFORMANCE_OPTIMIZATION,
    phase: 8
  },
  destination: { type: 'reply' },
  type: 'CONSULTATION_RESPONSE',
  version: '1.0.0',
  timestamp: '2025-12-15T10:00:10.000Z',
  priority: 'high',
  context: request.context,
  tracing: {
    ...consultationRequest.tracing,
    endTime: '2025-12-15T10:00:10.000Z',
    duration: 5000
  },
  payload: {
    type: 'CONSULTATION_RESPONSE',
    requestId: 'msg-002',
    input: {
      recommendation: 'PostgreSQL is a strong choice for this use case',
      concerns: [
        {
          severity: 'warning',
          category: 'scalability',
          description: 'PostgreSQL may face vertical scaling limits at very high scale',
          recommendation: 'Plan for read replicas and connection pooling from the start'
        }
      ],
      constraints: [
        { type: 'connection_pooling', requirement: 'Use PgBouncer or similar' },
        { type: 'indexing', requirement: 'Index strategy critical for range scans' }
      ],
      suggestions: [
        {
          type: 'enhancement',
          description: 'Consider partitioning for the users table if expecting 100M+ records',
          rationale: 'Improves query performance and maintenance operations',
          effort: 'medium'
        }
      ]
    },
    confidence: 0.85,
    caveats: ['Analysis based on stated 80/20 read/write ratio'],
    deferTo: [AgentType.CACHING_STRATEGY]
  }
};

// 4. Data Architecture Agent makes decision
const decisionResponse: MessageEnvelope<DecisionResponse> = {
  id: 'msg-004',
  correlationId: 'msg-001',
  causationId: 'msg-001',
  source: {
    id: 'data-arch-001',
    type: AgentType.DATA_ARCHITECTURE,
    phase: 3
  },
  destination: { type: 'reply' },
  type: 'DECISION_RESPONSE',
  version: '1.0.0',
  timestamp: '2025-12-15T10:00:20.000Z',
  priority: 'high',
  context: request.context,
  tracing: {
    ...request.tracing,
    endTime: '2025-12-15T10:00:20.000Z',
    duration: 20000
  },
  payload: {
    type: 'DECISION_RESPONSE',
    requestId: 'msg-001',
    decision: {
      id: 'dec-003',
      domain: 'database_selection',
      recommendation: 'PostgreSQL 15+ (AWS RDS)',
      confidence: 0.9,
      status: 'final'
    },
    rationale: {
      summary: 'PostgreSQL selected for strong consistency, team expertise, and mature ecosystem',
      reasoning: [
        { step: 1, thought: 'User service requires strong consistency for account operations', evidence: 'Requirement: strong consistency', conclusion: 'Need ACID-compliant database' },
        { step: 2, thought: 'Team has expert-level PostgreSQL skills', evidence: 'Constraint: team_skills', conclusion: 'Reduces implementation risk' },
        { step: 3, thought: 'Complex joins required for user relationships', evidence: 'Query pattern: complex_joins', conclusion: 'Relational database preferred' }
      ],
      keyFactors: [
        { name: 'Consistency', weight: 0.3, score: 0.95, explanation: 'PostgreSQL provides strong ACID compliance' },
        { name: 'Team Expertise', weight: 0.25, score: 0.9, explanation: 'Team has expert-level PostgreSQL experience' },
        { name: 'Query Support', weight: 0.2, score: 0.85, explanation: 'Excellent support for complex joins and range scans' },
        { name: 'Managed Service', weight: 0.15, score: 0.8, explanation: 'AWS RDS provides fully managed PostgreSQL' },
        { name: 'Cost', weight: 0.1, score: 0.75, explanation: 'Within budget at ~$200/month for expected load' }
      ]
    },
    tradeoffs: {
      pros: [
        { aspect: 'Consistency', description: 'Strong ACID compliance', severity: 'high' },
        { aspect: 'Team Skills', description: 'No learning curve', severity: 'high' },
        { aspect: 'Ecosystem', description: 'Mature tooling and community', severity: 'medium' }
      ],
      cons: [
        { aspect: 'Horizontal Scaling', description: 'More complex than NoSQL options', severity: 'medium' },
        { aspect: 'Schema Flexibility', description: 'Less flexible than document stores', severity: 'low' }
      ],
      risks: [
        { id: 'R001', description: 'Scaling bottleneck at very high scale', probability: 'low', impact: 'high', category: 'scalability' }
      ],
      mitigations: [
        { riskId: 'R001', strategy: 'Implement read replicas and connection pooling from day one', effectiveness: 'full' }
      ]
    },
    alternatives: [
      {
        name: 'MongoDB',
        description: 'Document database with flexible schema',
        score: 0.7,
        factors: [
          { name: 'Consistency', weight: 0.3, score: 0.6, explanation: 'Eventually consistent by default' },
          { name: 'Team Expertise', weight: 0.25, score: 0.6, explanation: 'Intermediate team skills' }
        ],
        whyNotChosen: 'Lower consistency guarantees and less team expertise'
      },
      {
        name: 'CockroachDB',
        description: 'Distributed SQL database',
        score: 0.75,
        factors: [
          { name: 'Consistency', weight: 0.3, score: 0.9, explanation: 'Strong consistency' },
          { name: 'Team Expertise', weight: 0.25, score: 0.3, explanation: 'No team experience' }
        ],
        whyNotChosen: 'Higher learning curve and cost for current scale'
      }
    ],
    impact: {
      affects: [
        { name: 'user-service', type: 'service', impact: 'primary_datastore' }
      ],
      dependencies: {
        enables: ['caching_strategy', 'high_availability_configuration'],
        requires: ['cloud_infrastructure'],
        conflicts: []
      },
      estimatedEffort: {
        setup: '8 hours',
        integration: '16 hours',
        testing: '8 hours'
      }
    },
    artifacts: {
      adr: {
        id: 'ADR-003',
        title: 'Use PostgreSQL for User Service Database',
        status: 'accepted',
        context: 'The user service requires a primary database...',
        decision: 'We will use PostgreSQL 15+ via AWS RDS...',
        consequences: 'Strong consistency, team expertise leveraged...'
      }
    },
    followUp: {
      questionsForUser: [],
      recommendedConsultations: [
        { agent: AgentType.CACHING_STRATEGY, topic: 'Caching strategy for user data' }
      ],
      blockedPendingDecisions: []
    }
  }
};

// 5. Broadcast decision to interested agents
const decisionEvent: MessageEnvelope<DecisionMadeEvent> = {
  id: 'msg-005',
  correlationId: 'msg-001',
  causationId: 'msg-004',
  source: {
    id: 'data-arch-001',
    type: AgentType.DATA_ARCHITECTURE,
    phase: 3
  },
  destination: { type: 'broadcast', channel: 'decisions.database' },
  type: 'DECISION_MADE',
  version: '1.0.0',
  timestamp: '2025-12-15T10:00:21.000Z',
  priority: 'normal',
  context: request.context,
  tracing: {
    ...decisionResponse.tracing,
    parentSpanId: decisionResponse.tracing.spanId,
    spanId: 'abcd1234efgh5678',
    startTime: '2025-12-15T10:00:21.000Z'
  },
  payload: {
    type: 'DECISION_MADE',
    decision: {
      id: 'dec-003',
      domain: 'database_selection',
      summary: 'PostgreSQL 15+ (AWS RDS) selected for user service',
      agent: AgentType.DATA_ARCHITECTURE,
      phase: 3
    },
    impact: {
      blocksAgents: [],
      enablesAgents: [AgentType.CACHING_STRATEGY, AgentType.HIGH_AVAILABILITY],
      affectsDecisions: ['caching_strategy', 'replication_topology']
    },
    artifacts: ['docs/architecture/adrs/003-postgresql-for-user-service.md']
  }
};
```

### Example 2: Conflict Detection and Resolution

```typescript
// Security Agent detects conflict with Performance Agent's caching decision
const conflictEvent: MessageEnvelope<ConflictDetectedEvent> = {
  id: 'msg-100',
  correlationId: 'workflow-123',
  source: {
    id: 'security-arch-001',
    type: AgentType.SECURITY_ARCHITECTURE,
    phase: 6
  },
  destination: { type: 'coordinator' },
  type: 'CONFLICT_DETECTED',
  version: '1.0.0',
  timestamp: '2025-12-15T11:00:00.000Z',
  priority: 'critical',
  context: { /* ... */ },
  tracing: { /* ... */ },
  payload: {
    type: 'CONFLICT_DETECTED',
    conflict: {
      id: 'conflict-001',
      severity: 'major',
      description: 'Caching strategy caches PII without encryption, violating security requirements'
    },
    parties: [
      {
        agent: AgentType.CACHING_STRATEGY,
        decisionId: 'dec-010',
        position: 'Cache user profiles including email/phone for performance',
        rationale: 'Reduces database load by 80%',
        flexibility: 'negotiable'
      },
      {
        agent: AgentType.SECURITY_ARCHITECTURE,
        decisionId: 'dec-015',
        position: 'PII must be encrypted at rest in all storage layers',
        rationale: 'GDPR and security policy compliance',
        flexibility: 'fixed'
      }
    ],
    resolution: {
      required: true,
      suggestedApproach: 'Implement field-level encryption for PII in cache',
      escalateTo: AgentType.META_COORDINATOR
    }
  }
};

// Meta-Coordinator resolves conflict
const resolutionMessage: MessageEnvelope<ConflictResolutionRecord> = {
  id: 'msg-101',
  correlationId: 'conflict-001',
  source: {
    id: 'meta-coord-001',
    type: AgentType.META_COORDINATOR,
    phase: 0
  },
  destination: { type: 'broadcast', channel: 'conflicts.resolved' },
  type: 'CONFLICT_RESOLVED',
  version: '1.0.0',
  timestamp: '2025-12-15T11:05:00.000Z',
  priority: 'high',
  context: { /* ... */ },
  tracing: { /* ... */ },
  payload: {
    conflictId: 'conflict-001',
    resolvedAt: '2025-12-15T11:05:00.000Z',
    resolution: {
      strategy: ResolutionStrategy.COMPROMISE,
      outcome: 'Cache user profiles with field-level encryption for PII fields',
      rationale: 'Maintains performance benefits while ensuring security compliance'
    },
    decisions: {
      accepted: [
        { decisionId: 'dec-015', agentType: AgentType.SECURITY_ARCHITECTURE, domain: 'security', summary: 'PII encryption requirement' }
      ],
      rejected: [],
      modified: [
        {
          original: { decisionId: 'dec-010', agentType: AgentType.CACHING_STRATEGY, domain: 'caching', summary: 'Cache user profiles' },
          modified: {
            id: 'dec-010-v2',
            domain: 'caching',
            recommendation: 'Cache user profiles with encrypted PII fields',
            confidence: 0.85
          },
          changes: ['Added field-level encryption for email, phone, address fields']
        }
      ]
    },
    dissent: [],
    impact: {
      affectedDecisions: ['dec-010'],
      retriggeredAgents: [AgentType.CACHING_STRATEGY],
      delayedWorkflow: false
    }
  }
};
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Dec 2025 | Initial specification |

---

## References

1. **Enterprise Integration Patterns** - Hohpe & Woolf
2. **W3C Trace Context Specification** - https://www.w3.org/TR/trace-context/
3. **OpenTelemetry Semantic Conventions** - https://opentelemetry.io/docs/
4. **Saga Pattern** - Chris Richardson, microservices.io
5. **MCP Protocol Specification** - Anthropic

---

**Document Status**: Design Specification  
**Maintainer**: Architecture Team  
**License**: MIT
