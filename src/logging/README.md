# Structured Logging Module

This module provides structured logging capabilities for the Multi-Agent Architecture Design System MCP server.

## LogEntry Interface

The `LogEntry` interface defines the structure for all log entries in the system, supporting:

- **JSON Output**: Compatible with MCP protocol requirements
- **Correlation Tracking**: Links related operations across agent interactions
- **Performance Monitoring**: Duration tracking for operation timing
- **Error Context**: Structured error information preservation
- **Extensible Fields**: Agent-specific metadata via index signature

### Required Fields

- `timestamp`: ISO 8601 timestamp (generated via injected Clock)
- `level`: Log severity ('debug' | 'info' | 'warn' | 'error')
- `message`: Human-readable description

### Optional Fields

- `correlationId`: Request-scoped correlation identifier
- `runId`: Individual operation identifier
- `durationMs`: Operation duration for performance monitoring
- `error`: Structured error information

### Extensible Fields

The interface supports additional fields via index signature:

```typescript
[key: string]: unknown;
```

Common extensions include:
- `agentId`: Source agent identifier
- `phase`: Architecture design phase
- `toolName`: Executed tool name
- `resourceUsage`: Performance metrics
- `securityContext`: Security metadata

## Usage Example

```typescript
import type { LogEntry } from './structuredLogger.js';

const logEntry: LogEntry = {
  timestamp: '2024-01-15T10:30:00.000Z',
  level: 'info',
  message: 'Agent coordination started',
  correlationId: 'req-123',
  runId: 'run-456',
  durationMs: 150,
  agentId: 'requirements-analyzer',
  phase: 'strategic-design'
};
```

## Design Principles

1. **Type Safety**: Strict TypeScript typing with proper optional field handling
2. **JSON Compatibility**: All fields must be JSON-serializable
3. **Performance**: Minimal overhead for high-frequency logging
4. **Extensibility**: Support for agent-specific metadata without breaking changes
5. **Deterministic Testing**: Clock injection for reproducible timestamps

## Next Steps

The LogEntry interface is ready for use in the StructuredLogger class implementation (Task 2.1 remaining subtasks).