# ADR-0001: Coordinator Memory Using Postgres + pgvector

**Status**: Accepted
**Date**: 2026-01-08

## Context
The coordinator needs durable memory to aggregate agent decisions, artifacts, and logs for review, conflict resolution, and traceability. We also want semantic retrieval across decisions (vector search) without introducing a second datastore later.

## Decision
Use **Postgres** as the system of record with the **pgvector** extension for embeddings. Run Postgres locally via Docker with persistent storage. Use a **hybrid artifact strategy**: small artifacts in Postgres (JSONB), large artifacts on disk with DB references. Retain logs for **90 days**.

## Rationale
- Postgres provides strong durability, querying, and audit trails.
- pgvector enables semantic similarity search directly in the same database.
- Docker + bind mount provides reproducible local setup with persistent storage.
- Hybrid artifacts prevent database bloat while retaining structured metadata.

## Consequences
- Requires Docker for local development.
- Requires an embeddings provider (Gemini API chosen) to generate vectors; pgvector only stores/searches vectors.
- Needs periodic retention cleanup for logs and optional artifact archival.

## Follow-ups
- Add schema + migrations for decisions, artifacts, messages, logs, and embeddings.
- Implement coordinator memory adapter and embedding pipeline.
- Add retention job for logs and expired records.

