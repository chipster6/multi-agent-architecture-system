# Protocol Compliance & Versioning Plan

**Status**: Draft (v0.1)

## Goals
- Guarantee MCP protocol compliance across stdio and HTTP transports.
- Provide a predictable version negotiation strategy.
- Avoid breaking changes for clients during upgrades.

## Supported Protocol Versions
- **v0.1 (initial)**: `2024-11-05` (stdio), `2025-11-25` (HTTP Streamable).
- **Future**: explicit list in config with deprecation windows.

## Negotiation Rules (stdio)
- Client sends `initialize.params.protocolVersion`.
- Server validates against `supportedVersions`.
- If unsupported: return JSON-RPC error `-32602` with `supported` list.
- Server responds with the negotiated version in `InitializeResult.protocolVersion`.

## Negotiation Rules (HTTP)
- Client MUST send `MCP-Protocol-Version` header.
- Server validates header against supported versions.
- Unsupported version => HTTP 400 with JSON-RPC error (id null) describing supported versions.
- Server response includes `MCP-Protocol-Version` header set to negotiated version.

## Compliance Requirements
- JSON-RPC 2.0 formatting for all requests/responses.
- Tool call results returned exactly once per request.
- No stdout pollution in stdio mode.
- Enforce timeouts and return TIMEOUT errors.

## Deprecation Policy
- Maintain two versions in parallel for at least one minor release.
- Announce deprecation in release notes and in server info.
- Remove deprecated versions only after adoption threshold is met.

## Test Coverage
- Version negotiation tests per transport.
- HTTP header validation tests.
- Protocol error formatting tests.

