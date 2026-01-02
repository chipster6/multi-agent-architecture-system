# Multi-Agent Software Architecture Design System

A production-ready MCP (Model Context Protocol) server that orchestrates 40+ specialized AI agents to automate complete software architecture design processes. Transform business requirements into comprehensive architecture documentation including C4 diagrams, Architecture Decision Records (ADRs), and detailed implementation plans.

## 🚀 Key Features

- **40+ Specialized Agents**: Each agent focuses on specific architectural domains (security, data, infrastructure, AI/ML, etc.)
- **Automated Architecture Design**: From requirements analysis through implementation planning
- **Production Documentation**: Generates complete architecture blueprints with ADRs, diagrams, and implementation roadmaps
- **MCP Server Integration**: Works seamlessly with Claude Code and other MCP-compatible tools
- **Parallel Orchestration**: Executes agents in parallel where possible while respecting dependencies
- **Conflict Resolution**: Built-in mechanisms to detect and resolve conflicting architectural decisions
- **Dynamic Agent Factory**: Creates ephemeral agents for emerging technologies not covered by core agents

## 🏗️ Architecture Overview

The system follows a multi-agent orchestration pattern with 11 sequential phases:

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

### Architecture Phases

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

## 🛠️ Technology Stack

- **Language**: TypeScript (Node.js 18+)
- **Package Manager**: npm
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **LLM Provider**: `@anthropic-ai/sdk` (configurable)
- **Validation**: `zod` for schema validation
- **Storage**: File-based (markdown docs) + SQLite for state management
- **Testing**: Vitest for unit/integration tests
- **Code Quality**: ESLint + Prettier

## 📋 Prerequisites

- Node.js 18 or higher
- npm (comes with Node.js)
- Git
- An Anthropic API key (for Claude integration)

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/chipster6/multi-agent-architecture-system.git
cd multi-agent-architecture-system

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### Development

```bash
# Start development mode with watch
npm run dev

# Type checking
npm run type-check

# Linting and formatting
npm run lint
npm run format

# Run tests
npm test
```

### Production

```bash
# Build the project
npm run build

# Start the MCP server
npm start
```

## 📁 Project Structure

```
├── src/
│   ├── index.ts                    # MCP server entry point
│   ├── coordinator/                # Meta-coordinator and workflow engine
│   │   ├── meta-coordinator.ts     # Main orchestration logic
│   │   ├── workflow-engine.ts      # Phase execution engine
│   │   └── conflict-resolver.ts    # Conflict detection/resolution
│   ├── agents/                     # 40+ specialized agents organized by phase
│   │   ├── base-agent.ts           # Abstract base class
│   │   ├── phase-1-strategic/      # Requirements, domain design, topology
│   │   ├── phase-2-infrastructure/ # Cloud, containers, networking
│   │   ├── phase-3-data/          # Data architecture, caching, events
│   │   └── ...                    # Additional phases
│   ├── tools/                     # MCP tool implementations
│   ├── shared/                    # Common types and utilities
│   └── prompts/                   # Agent prompt templates
├── docs/                          # Generated architecture documentation
├── tests/                         # Test suites
└── scripts/                       # Build and utility scripts
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Required
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional
LOG_LEVEL=info
MCP_SERVER_PORT=3000
NODE_ENV=development
```

### Agent Configuration

Agents can be configured per project type and complexity:

- **Model Selection**: Claude Opus for critical decisions, Sonnet for standard operations
- **Orchestration Strategy**: API-based for complex agents, prompt-based for simpler ones
- **Timeout Settings**: Per-agent timeout configuration
- **Retry Policies**: Configurable retry logic for LLM calls

## 📖 Usage

### As an MCP Server

The system runs as an MCP server that can be integrated with Claude Code or other MCP-compatible tools:

1. Start the server: `npm start`
2. Connect your MCP client to the server
3. Use the available tools to generate architecture documentation

### Available MCP Tools

- `analyze_requirements`: Parse and analyze business requirements
- `generate_architecture`: Create complete architecture documentation
- `validate_decisions`: Check for conflicts and validate architectural decisions
- `create_implementation_plan`: Generate detailed implementation roadmap

### Example Workflow

```typescript
// 1. Analyze requirements
const requirements = await analyzeRequirements({
  description: 'E-commerce platform with AI recommendations',
  constraints: ['PCI compliance', '99.9% uptime', 'global scale'],
  technologies: ['Node.js', 'React', 'AWS'],
});

// 2. Generate architecture
const architecture = await generateArchitecture({
  requirements,
  preferences: {
    cloudProvider: 'AWS',
    architectureStyle: 'microservices',
  },
});

// 3. Get implementation plan
const plan = await createImplementationPlan({
  architecture,
  timeline: '6 months',
  teamSize: 8,
});
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests
npm run test:e2e              # End-to-end workflow tests

# Run tests with coverage
npm run test:coverage
```

## 📚 Documentation

- [Agent Communication Protocol](./Agent_Communication_Protocol_Specification.md)
- [Agent Prompt Templates](./Agent_Prompt_Templates_Specification.md)
- [System Architecture](./Multi-Agent%20Software%20Architecture%20Design%20System.md)
- [Production Agent Prompts](./Phase1_Production_Agent_Prompts.md)

## 🎯 Target Users

- **Software Architects**: Designing new systems with comprehensive documentation
- **Development Teams**: Needing architecture guidance and standardization
- **Organizations**: Standardizing architecture practices across teams
- **Consultants**: Providing architecture services with automated documentation

## 🔄 System Scope

### In Scope

- Requirements analysis and translation
- Architecture style selection and justification
- Technology stack recommendations
- Security and compliance architecture
- Performance and scalability design
- Implementation planning and task breakdown

### Out of Scope

- Actual code implementation
- Project management beyond architecture tasks
- Business strategy or product decisions
- Detailed UI/UX design

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- Create an [issue](https://github.com/chipster6/multi-agent-architecture-system/issues) for bug reports or feature requests
- Check the [documentation](./docs/) for detailed guides
- Review existing [discussions](https://github.com/chipster6/multi-agent-architecture-system/discussions) for common questions

## 🙏 Acknowledgments

- Built on the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- Powered by [Anthropic's Claude](https://www.anthropic.com/)
- Inspired by the C4 model for software architecture documentation
