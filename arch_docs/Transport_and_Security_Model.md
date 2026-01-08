# Transport & Security Model

**Status**: Draft (v0.1)

## Transports
- **stdio**: primary for local MCP clients.
- **Streamable HTTP**: required for external integrations.

## HTTP Requirements (Streamable)
- Validate `MCP-Protocol-Version` header.
- Enforce `MCP-Session-Id` on non-initialize requests.
- Origin validation for browser-based clients.
- Host header validation to mitigate DNS rebinding.

## Security Posture (v0.1)
- No OAuth in v0.1; optional in v0.2.
- Reject unknown origins by default (configurable allowlist).
- Rate limits per IP/session (basic token bucket).

## Auth/Signature (AACP)
- Envelope may include `auth` and `signature` fields.
- Signature verification optional in v0.1; enabled in v0.2.

## Logging & Redaction
- Never emit secrets to stdout.
- Use redaction list for all logs.

