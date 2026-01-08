# Storage & Retention Policy

**Status**: Draft (v0.1)

## Objectives
- Ensure dedupe and replay safety.
- Bound storage growth.
- Provide auditability for coordinator decisions.

## Data Types
- AACP envelopes (normalized)
- Request records (dedupe keys)
- Agent outputs/decisions/artifacts
- Coordinator summaries and ADRs

## Retention Rules
- Default TTL: 5 minutes for in-memory (v0.1).
- v0.2: configurable TTL for requests and messages.
- Keep coordinator decisions/ADRs longer (hours/days).

## Purge Policy
- Scheduled purge for expired records.
- Purge returns count and is logged.

## Replay & Recovery
- Requests with duplicate `requestId` return cached result if completed.
- In-progress duplicates are ignored.

