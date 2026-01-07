---
inclusion: always
---

# Context7 MCP Server Consultation Protocol

## Overview

This document defines the **process and workflow** for consulting the Context7 MCP server to maintain current technology knowledge. For the actual technology information and patterns, see `context7-quick-reference.md` (the canonical knowledge base).

## BLOCKING REQUIREMENT: Technology Consultation

For this **Multi-Agent Software Architecture Design System**, staying current with technology evolution is critical.

**HARD STOP**: You are FORBIDDEN from implementing any task without first consulting the Context7 MCP server. This is a BLOCKING requirement, not a suggestion.

**ENFORCEMENT**: If Context7 MCP server is unavailable, you MUST acknowledge this limitation and explain why you cannot proceed with current best practices consultation.

## Mandatory Consultation Workflow

For this **Multi-Agent Software Architecture Design System**, staying current with technology evolution is critical. All agents MUST follow this consultation protocol:

### Step 1: Check Canonical Reference First
- **Always start** by consulting `context7-quick-reference.md`
- Look for existing information about required technologies
- Check consultation dates to determine if information is current (>30 days = outdated)
- Only proceed to Context7 if information is missing or outdated

### Step 2: Context7 Consultation Process
When Context7 consultation is needed:

1. **Technology Identification**: Scan task for all libraries, frameworks, and technologies mentioned
2. **Library Resolution**: Use `resolve-library-id` for each technology to get Context7-compatible IDs
3. **Documentation Retrieval**: Use `get-library-docs` to fetch latest documentation and best practices
4. **Immediate Documentation**: Update canonical reference using the standard template (below)

### Step 3: Update Canonical Reference
**MANDATORY**: Immediately update `context7-quick-reference.md` with all findings using this template:

```markdown
## [Technology Name] - Context7 Consultation

**Context7 ID**: `[library-id]`
**Trust Score**: [score]
**Last Consulted**: [YYYY-MM-DD]
**Agent**: [agent-name]
**Task Context**: [brief description of why consulted]

### Key Findings:
- **Version**: [current version]
- **Breaking Changes**: [list any breaking changes since last consultation]
- **New Features**: [notable new features]
- **Security Updates**: [security considerations and updates]
- **Deprecated Patterns**: [patterns to avoid]
- **Recommended Patterns**: [current best practices]

### Implementation Impact:
- [How this affects current project]
- [Required changes to existing code]
- [New patterns to adopt]

### Code Examples:
```typescript
// Updated patterns based on consultation
[include relevant code examples]
```

### References:
- Documentation URL: [if available]
- Related Technologies: [dependencies/related libs]
```

## Consultation Triggers

Agents MUST consult Context7 and update the canonical reference when:

### Mandatory Triggers
- **New Technology**: Any technology not documented in canonical reference
- **Outdated Information**: Technology information >30 days old
- **Security Alerts**: Suspected vulnerabilities or security updates
- **Implementation Failures**: Patterns fail or produce warnings
- **Best Practice Questions**: Uncertainty about current recommended approaches

### Technology Categories Requiring Consultation

#### Core Infrastructure
- **MCP SDK**: `@modelcontextprotocol/sdk` - Protocol implementation patterns
- **Validation Libraries**: `ajv`, `zod` - Schema validation approaches
- **Testing Frameworks**: `vitest`, `fast-check` - Modern testing patterns
- **TypeScript**: Language features and compiler options
- **Node.js**: Runtime best practices and performance patterns

#### Architecture & Cloud
- **Architecture Patterns**: Microservices, event-driven, CQRS patterns
- **Cloud Technologies**: AWS, Azure, GCP services and deployment patterns
- **Container Technologies**: Docker, Kubernetes orchestration patterns
- **Database Technologies**: SQL/NoSQL databases and ORM patterns

#### AI/ML Integration
- **LLM Libraries**: When implementing agent coordination and LLM integration
- **Vector Databases**: For AI/ML data storage and retrieval
- **ML Pipeline Tools**: For model training and deployment workflows

## Quality Assurance Protocol

### Pre-Consultation Checklist
- [ ] Checked canonical reference for existing information
- [ ] Identified specific technology gaps or outdated information
- [ ] Prepared Context7 library names for resolution
- [ ] Ready to document findings immediately

### During Consultation
- [ ] Use exact Context7 library IDs from `resolve-library-id`
- [ ] Focus on security updates and breaking changes
- [ ] Capture implementation patterns and code examples
- [ ] Note trust scores and version information

### Post-Consultation Requirements
- [ ] Updated canonical reference with standard template
- [ ] Added consultation to history tracking table
- [ ] Updated currency tracking section
- [ ] Verified all code examples are current
- [ ] Cross-referenced with related technologies

## Consultation History Management

### History Tracking
All consultations must be recorded in the canonical reference history table:

| Date | Technology | Context7 ID | Agent | Task Context | Status |
|------|------------|-------------|-------|--------------|--------|
| YYYY-MM-DD | [Tech Name] | [ID] | [Agent] | [Context] | Current/Outdated |

### Currency Management
- **Current**: Information <30 days old
- **Outdated**: Information >30 days old (requires re-consultation)
- **Deprecated**: Technology no longer recommended (mark clearly)

### Audit Trail
Maintain clear audit trail of:
- When each technology was last consulted
- Which agent performed the consultation
- What task context triggered the consultation
- What changes were discovered and documented

## Error Handling & Recovery

### Failed Consultations
If Context7 consultation fails:
1. Document the failure in consultation history
2. Use most recent available information from canonical reference
3. Mark information as "potentially outdated" 
4. Retry consultation when Context7 becomes available
5. Prioritize re-consultation for security-critical technologies

### Conflicting Information
If Context7 provides conflicting information:
1. Document both approaches in canonical reference
2. Note the conflict and Context7 trust scores
3. Prefer higher trust score recommendations
4. Escalate to human review for critical decisions

## Integration with Development Workflow

### Pre-Implementation Protocol
Every agent must execute this workflow before any code implementation:

1. **Check Canonical Reference**: Review existing technology documentation
2. **Identify Gaps**: Determine what information is missing or outdated
3. **Consult Context7**: Only for missing/outdated information
4. **Update Documentation**: Immediately update canonical reference
5. **Proceed with Implementation**: Using verified current patterns

### Continuous Improvement
- Regular review of consultation patterns to identify frequently needed technologies
- Proactive consultation for emerging technologies in the architecture domain
- Feedback loop to improve consultation efficiency and accuracy

---

**Related Documents**:
- **Canonical Knowledge Base**: `.kiro/steering/context7-quick-reference.md`
- **Technology Patterns**: All verified implementation patterns stored in canonical reference
- **Security Guidelines**: Security requirements documented in canonical reference

**Last Updated**: January 2026

