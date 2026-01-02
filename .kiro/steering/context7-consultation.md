---
inclusion: always
---

# Context7 MCP Server Consultation Protocol

## Mandatory Technology Consultation

For this **Multi-Agent Software Architecture Design System**, staying current with technology evolution is critical. You MUST consult the Context7 MCP server before implementing any task.

### Required Process

1. **Pre-Task Analysis**: Before starting any task, identify all libraries, frameworks, and technologies mentioned
2. **Library Resolution**: Use `resolve-library-id` for each technology to get Context7-compatible IDs
3. **Documentation Retrieval**: Use `get-library-docs` to fetch latest documentation and best practices
4. **Implementation Adjustment**: Modify your approach based on current best practices discovered

### Key Technologies to Always Consult

- **MCP SDK**: `@modelcontextprotocol/sdk` - Core protocol implementation patterns
- **Validation**: `ajv`, `zod` - Schema validation best practices
- **Testing**: `vitest`, `fast-check` - Modern testing patterns
- **TypeScript**: Latest language features and compiler options
- **Node.js**: Runtime best practices and performance patterns
- **Architecture Patterns**: Microservices, event-driven, CQRS patterns
- **Cloud Technologies**: AWS, Azure, GCP services and patterns
- **AI/ML Libraries**: When implementing agent coordination and LLM integration

### Documentation Template

When consulting Context7, document findings in this format:

```markdown
## Technology Consultation Summary

### Libraries Consulted:

- Library: [name] | ID: [context7-id] | Version: [latest]
- Key Changes: [breaking changes, new features, deprecations]
- Best Practices: [current recommended patterns]
- Security Updates: [security considerations]

### Implementation Adjustments:

- [List specific changes to make based on consultation]
- [Updated patterns to use]
- [Deprecated patterns to avoid]
```

### Why This Matters

Our multi-agent system will be making architectural decisions for real projects. Using outdated patterns or missing security updates could result in:

- Vulnerable architectures
- Performance bottlenecks
- Maintenance debt
- Incompatible technology choices

Always consult Context7 to ensure our agents recommend current, secure, and performant solutions.
