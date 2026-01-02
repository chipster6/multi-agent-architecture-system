# Technology Stack & Build System

## Core Technologies

### Runtime & Language

- **Language**: TypeScript (Node.js runtime)
- **Target**: Node.js 18+ for MCP compatibility
- **Package Manager**: npm (standard for MCP projects)

### Key Dependencies

- **MCP SDK**: `@modelcontextprotocol/sdk` - Core MCP server implementation
- **LLM Provider**: `@anthropic-ai/sdk` - Primary LLM integration (configurable)
- **Validation**: `zod` - Schema validation for agent inputs/outputs
- **Storage**: File-based (markdown docs) + SQLite for state management

### Development Tools

- **Testing**: Vitest for unit/integration tests
- **Code Quality**: ESLint + Prettier
- **Type Checking**: TypeScript strict mode

## Project Architecture

### Directory Structure

```
src/
├── index.ts                    # MCP server entry point
├── coordinator/                # Meta-coordinator and workflow engine
├── agents/                     # 40+ specialized agents organized by phase
│   ├── phase-1-strategic/      # Requirements, domain design, topology
│   ├── phase-2-infrastructure/ # Cloud, containers, networking
│   ├── phase-3-data/          # Data architecture, caching, events
│   └── ...                    # Additional phases
├── tools/                     # MCP tool implementations
├── shared/                    # Common types and utilities
└── prompts/                   # Agent prompt templates
```

### Agent Organization

- **Phase-based structure**: Agents grouped by architectural design phases
- **Dependency management**: Clear phase dependencies (Phase 1 → Phase 2 → etc.)
- **Parallel execution**: Agents within phases can run concurrently where possible

## Build & Development Commands

### Setup

```bash
npm install                     # Install dependencies
npm run build                   # Compile TypeScript
```

### Development

```bash
npm run dev                     # Development mode with watch
npm run type-check             # TypeScript validation
npm run lint                   # ESLint checking
npm run format                 # Prettier formatting
```

### Testing

```bash
npm test                       # Run all tests
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests
npm run test:e2e              # End-to-end workflow tests
```

### MCP Server

```bash
npm start                      # Start MCP server
npm run server:debug          # Debug mode with verbose logging
```

## Configuration

### Agent Configuration

- **Model Selection**: Configurable per agent complexity (Claude Opus for critical, Sonnet for standard)
- **Orchestration Strategy**: API-based for complex agents, prompt-based for simpler ones
- **Timeout Settings**: Per-agent timeout configuration
- **Retry Policies**: Configurable retry logic for LLM calls

### Environment Variables

```bash
ANTHROPIC_API_KEY=             # Required for LLM integration
LOG_LEVEL=info                 # Logging verbosity
MCP_SERVER_PORT=3000          # Server port (if applicable)
```

## Code Standards

### TypeScript

- Strict mode enabled
- Explicit return types for public methods
- Interface-first design for agent contracts
- Zod schemas for runtime validation

### Agent Implementation

- All agents extend `BaseAgent` abstract class
- Standardized input/output schemas
- Consistent error handling patterns
- Structured logging with correlation IDs

### Testing Strategy

- Unit tests for individual agents
- Integration tests for agent collaboration
- E2E tests for complete workflows
- Mock LLM responses for deterministic testing

## Performance Considerations

### Parallel Execution

- Agents within phases execute concurrently
- Dependency graph prevents blocking
- Context sharing optimized to minimize data transfer

### LLM Optimization

- Model selection based on agent complexity
- Prompt caching where possible
- Structured outputs to reduce parsing overhead
- Circuit breaker patterns for API failures
