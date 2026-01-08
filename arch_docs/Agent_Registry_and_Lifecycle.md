# Agent Registry & Lifecycle Specification

**Status**: Draft (v0.1)

## Goals
- Provide deterministic agent discovery.
- Support hybrid in-process and external agents.
- Enable health checks and graceful shutdown.

## Registry Model
- **Registry source**: static manifest + dynamic registration (optional).
- **Agent ID**: stable logical ID (e.g., `security-architect`).
- **Instance ID**: runtime unique ID for scaled agents.

## Lifecycle States
- `REGISTERED` → `READY` → `BUSY` → `READY` → `DRAINING` → `STOPPED`

## Registration Requirements
- `id`, `type`, `phase`, `capabilities`, `dependencies` required.
- Optional: `endpoint` (for external MCP agents), `healthcheck`.

## External Agents
- Treated as MCP clients.
- Registration requires endpoint URL and supported protocol version.

## Health & Heartbeats
- Heartbeat interval configurable.
- Registry marks agent `UNHEALTHY` after N missed heartbeats.

## Shutdown
- Coordinator sends `DRAIN` signal.
- Agents complete in-flight work or timeout.
- Registry removes agent on `STOPPED`.

## Minimal v0.1 Implementation
- Static manifest with core agents.
- In-process agents registered at startup.
- External agent stubs allowed but not required.

