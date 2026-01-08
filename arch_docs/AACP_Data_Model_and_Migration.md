# AACP Data Model & Migration Guide

**Status**: Draft (v0.1 → v0.2)

## Canonical Envelope (v0.2 target)
```ts
interface MessageEnvelope<T> {
  id: string;                 // UUID v7
  correlationId: string;      // Conversation/group tracking
  causationId?: string;       // Upstream message ID

  source: AgentIdentifier;
  destination: Destination;

  type: MessageType;
  version: string;            // AACP version (semver)
  timestamp: string;          // ISO 8601 w/ microseconds
  ttl?: number;               // ms
  priority: Priority;

  context: PropagatedContext; // Shared decision state
  tracing: TracingContext;    // traceId/spanId

  payload: T;

  auth?: AuthContext;
  signature?: string;
}
```

## v0.1 Compatibility Constraints
- Allow `messageId` UUIDv4 for legacy messages.
- Optional fields in v0.1 should default to empty objects where required.

## Migration Strategy
- **Phase 1**: Accept both v0.1 and v0.2 envelope shapes.
- **Phase 2**: Store normalized envelope in ledger (always v0.2 form).
- **Phase 3**: Deprecate v0.1 producers after toolchain upgrade.

## Backward-Compatible Decoding
- If `id` missing, map `messageId` → `id`.
- If `correlationId` missing, derive from `requestId` if present.
- If `source/target` missing, map `sourceAgentId/targetAgentId`.

## Storage Guidance
- Persist full envelope (normalized) + derived indexes for search.
- Store `correlationId`, `causationId`, `source.id`, `destination` as first-class indexes.

## Version Field Rules
- `version` is required for all new messages.
- If missing, default to `0.1.0` and tag message as legacy.

