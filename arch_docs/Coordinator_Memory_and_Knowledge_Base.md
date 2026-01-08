# Coordinator Memory & Knowledge Base

**Status**: Draft (v0.1)

## Rationale
The coordinator needs persistent memory to review decisions and artifacts across agents, reconcile conflicts, and produce coherent architecture guidance.

## Memory Layers
1) **Short-term session memory**
   - In-memory store of all messages for the current run.
   - Fast lookup by correlationId/agentId.

2) **Decision ledger (persistent)**
   - Stores decisions, rationales, and artifacts.
   - Indexed by domain, component, and phase.

3) **Knowledge base (long-lived)**
   - ADRs, reusable patterns, and final architecture summaries.

## Minimum v0.1 Implementation
- In-memory ledger scoped to process lifetime.
- Persist coordinator outputs and final ADRs to disk (JSON/Markdown).

## v0.2 Enhancements
- Pluggable persistence adapter (SQLite/Postgres).
- Full-text search across decisions.
- Conflict detection by correlation/causation analysis.

## Required API
- appendDecision(agentId, decision, artifacts)
- listDecisions(filters)
- getDecision(decisionId)
- persistSessionSnapshot()

## Data Model (suggested)
```ts
interface DecisionRecord {
  id: string;
  agentId: string;
  phase: string;
  domain: string;
  correlationId: string;
  timestamp: string;
  decision: unknown;
  artifacts?: unknown[];
}
```

