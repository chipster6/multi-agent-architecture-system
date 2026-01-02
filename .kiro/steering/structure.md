# Project Structure & Organization

## High-Level Architecture

The project follows a **multi-agent orchestration pattern** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server Layer                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Meta-Coordinator Agent                       │  │
│  │  • Request routing & workflow planning                │  │
│  │  • Agent orchestration (sequential & parallel)        │  │
│  │  • Conflict detection & resolution                    │  │
│  │  • Context management & state persistence             │  │
│  └────────┬──────────────────────────────────────┬───────┘  │
│           │                                      │           │
│  ┌────────▼──────────┐                ┌─────────▼────────┐  │
│  │  Phase 1-10       │                │  Implementation  │  │
│  │  Architecture     │                │  Planning Agent  │  │
│  │  Agents (40)      │                │  (Phase 11)      │  │
│  └───────────────────┘                └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Agent Organization Principles

### Phase-Based Structure

Agents are organized into 11 sequential phases, each building on previous phases:

1. **Phase 1 - Strategic Design**: Requirements → Domain Design → System Topology
2. **Phase 2 - Infrastructure**: Cloud → Containers → Networking
3. **Phase 3 - Data & Integration**: Data Architecture → Caching → Events → APIs
4. **Phase 4 - Application**: Backend → Frontend
5. **Phase 5 - AI/ML**: AI Orchestrator → LLM → ML Pipeline → Vector DB
6. **Phase 6 - Security**: Security Architecture → IAM → Compliance
7. **Phase 7 - Resilience**: Fault Tolerance → High Availability → Disaster Recovery
8. **Phase 8 - Performance**: Optimization → Scalability → Load Balancing
9. **Phase 9 - DevOps**: CI/CD → IaC → Testing → Release Management
10. **Phase 10 - Governance**: Cost → Tech Debt → Documentation
11. **Phase 11 - Implementation**: Task breakdown and execution planning

### Agent Collaboration Patterns

#### Sequential Dependencies (Between Phases)

- Phase 1 must complete before Phase 2 can begin
- System Topology decision gates all downstream phases
- Security reviews are mandatory checkpoints

#### Parallel Execution (Within Phases)

- Agents within the same phase can run concurrently
- Context sharing enables independent work streams
- Dependency graph prevents conflicts

#### Cross-Cutting Concerns

- **Security Agent**: Reviews all decisions (non-blocking unless critical)
- **Cost Optimization Agent**: Evaluates all resource decisions
- **Documentation Agent**: Captures all architectural decisions

## File Organization

### Core Structure

```
├── src/
│   ├── index.ts                    # MCP server entry point
│   ├── coordinator/
│   │   ├── meta-coordinator.ts     # Main orchestration logic
│   │   ├── workflow-engine.ts      # Phase execution engine
│   │   └── conflict-resolver.ts    # Conflict detection/resolution
│   ├── agents/
│   │   ├── base-agent.ts           # Abstract base class
│   │   ├── phase-1-strategic/      # Strategic design agents
│   │   ├── phase-2-infrastructure/ # Infrastructure agents
│   │   └── ...                     # Additional phases
│   ├── tools/                      # MCP tool implementations
│   ├── shared/                     # Common utilities and types
│   └── prompts/                    # Agent prompt templates
```

### Agent Implementation Pattern

Each agent follows a consistent structure:

- Extends `BaseAgent` abstract class
- Implements required methods: `analyze()`, `decide()`, `validate()`
- Uses standardized input/output schemas
- Includes collaboration and handoff logic

### Output Organization

Generated architecture documentation follows C4 model structure:

```
docs/architecture/
├── blueprint.md                    # Executive summary
├── system-context/                 # C4 Level 1
├── containers/                     # C4 Level 2
├── components/                     # C4 Level 3
├── adrs/                          # Architecture Decision Records
├── data-models/                   # Domain and data models
├── apis/                          # API specifications
├── deployment/                    # Infrastructure topology
├── security/                      # Security architecture
└── implementation/                # Implementation roadmap
```

## Communication Protocols

### Message Types

- **Decision Requests**: Request architectural decisions from agents
- **Consultation Requests**: Request advisory input without binding decisions
- **Event Messages**: Broadcast notifications about state changes
- **Coordination Messages**: Workflow orchestration and synchronization

### Context Propagation

- **Immutable Context**: Decisions accumulate without modification
- **Scoped Context**: Each agent receives relevant subset
- **Conflict Detection**: Automatic detection of contradictory decisions
- **State Persistence**: Checkpointing for recovery scenarios

## Quality Assurance

### Agent Quality Gates

- **Input Validation**: Zod schemas validate all agent inputs
- **Output Validation**: Structured schemas ensure consistent outputs
- **Confidence Scoring**: Agents report confidence levels (0.0-1.0)
- **Conflict Resolution**: Automatic detection and resolution workflows

### Testing Strategy

- **Unit Tests**: Individual agent logic and decision-making
- **Integration Tests**: Agent collaboration and handoff scenarios
- **End-to-End Tests**: Complete architecture generation workflows
- **Regression Tests**: Validate consistency across system changes

## Extensibility Patterns

### Dynamic Agent Factory

- **Technology Detection**: Automatically identify unknown technologies
- **Agent Template Generation**: Create ephemeral agents for new domains
- **Integration Patterns**: Seamlessly integrate with existing workflow

### Configuration-Driven Behavior

- **Agent Selection**: Configure which agents to include per project type
- **Model Selection**: Choose appropriate LLM models per agent complexity
- **Orchestration Strategy**: API-based vs prompt-based execution

## Error Handling & Recovery

### Error Categories

- **Transient Errors**: Network timeouts, rate limits (retryable)
- **Agent Errors**: Invalid inputs/outputs, state corruption
- **Workflow Errors**: Dependency failures, circular dependencies
- **Business Errors**: Constraint violations, unresolvable conflicts

### Recovery Mechanisms

- **Retry Policies**: Exponential backoff for transient failures
- **Circuit Breakers**: Prevent cascade failures
- **Dead Letter Queue**: Handle permanently failed messages
- **State Rollback**: Recovery to previous valid state

## Documentation Standards

### Architecture Decision Records (ADRs)

- **Standard Format**: Context → Decision → Consequences
- **Traceability**: Link decisions to requirements and constraints
- **Dissenting Opinions**: Capture alternative viewpoints
- **Status Tracking**: Proposed → Accepted → Superseded

### Code Documentation

- **TSDoc Comments**: Comprehensive API documentation
- **README Files**: Per-module usage and examples
- **Architecture Diagrams**: Visual representation of system structure
- **Runbooks**: Operational procedures and troubleshooting
