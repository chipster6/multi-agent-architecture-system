# Design Document: Foundation MCP Runtime (v0.1)

## Overview

This design specifies a foundational MCP (Model Context Protocol) server that provides core infrastructure for hosting and orchestrating AI agents. The server implements stdio transport, tool registry management, configuration loading, structured logging, standardized error handling, resource management, and basic in-memory agent coordination.

Design priorities:

- **Reliability**: Graceful error handling; no crashes on malformed input
- **Testability**: Deterministic behavior with injectable dependencies (clock, ID generators)
- **Extensibility**: Transport-agnostic core with clear extension points
- **Security**: Safe defaults, secret redaction, log sanitization, strict input validation

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Transport Layer                          │  │
│  │  ┌──────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │ StdioTransport│  │ (Future SSE)│  │ (Future HTTP)   │  │  │
│  │  └──────┬───────┘  └─────────────┘  └─────────────────┘  │  │
│  └─────────┼─────────────────────────────────────────────────┘  │
│            │                                                     │
│  ┌─────────▼─────────────────────────────────────────────────┐  │
│  │                   Protocol Handler                         │  │
│  │  • initialize / initialized                                │  │
│  │  • tools/list                                              │  │
│  │  • tools/call                                              │  │
│  │  • (admin tools, gated; optional)                          │  │
│  └─────────┬─────────────────────────────────────────────────┘  │
│            │                                                     │
│  ┌─────────▼─────────────────────────────────────────────────┐  │
│  │                   Core Components                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │ ToolRegistry  │  │ConfigManager │  │StructuredLogger│  │  │
│  │  └──────────────┘  └──────────────┘  └────────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │ResourceManager│  │ ErrorHandler │  │AgentCoordinator│  │  │
│  │  └──────────────┘  └──────────────┘  └────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Protocol Lifecycle

### State Machine (Per Connection)

The protocol lifecycle is maintained **per client session / transport connection**. Each connection has independent state.

```
┌──────────┐    initialize    ┌─────────────┐   initialized   ┌─────────┐
│ STARTING │ ───────────────► │ INITIALIZING│ ───────────────► │ RUNNING │
└──────────┘                  └─────────────┘                  └─────────┘
     │                              │                               │
     │ (any other method)           │ (any other method)            │
     ▼                              ▼                               │
  Return                         Return                             │
  NotInitialized                 NotInitialized                     │
  JSON-RPC error                 JSON-RPC error                     │
                                                                    │
                                                              ┌─────▼─────┐
                                                              │ All MCP   │
                                                              │ methods   │
                                                              │ allowed   │
                                                              └─────┬─────┘
                                                                    │
                                                              ┌─────▼─────┐
                                                              │  CLOSED   │
                                                              │ (terminal)│
                                                              └───────────┘
```

**CLOSED State Rules (Normative)**:

- Once CLOSED, state is terminal; no responses may be written
- All requests are ignored or result in no-op (transport is gone)
- In-flight handlers continue but their responses are discarded

### Initialization Rules (Normative)

1. Server MUST receive `initialize` before any other method.
2. Server MUST reply to `initialize` with `InitializeResult`.
3. Client MUST send `initialized` notification after receiving `InitializeResult`.
4. Server MUST NOT process `tools/list` or `tools/call` until `initialized` is received.
5. If methods arrive before RUNNING state, server MUST return a state error (`NOT_INITIALIZED`) as a JSON-RPC error.
6. **Strict initialization gate**: This server blocks ALL methods except `initialize` and `initialized` until RUNNING.

## Error Model

Errors are categorized into three types with different response formats.

### 1) Protocol Errors (JSON-RPC Level)

Examples:

- Parse errors (malformed JSON)
- Invalid JSON-RPC structure
- Method not found
- Invalid params shape

Protocol errors MUST be returned as JSON-RPC error responses:

```typescript
interface JsonRpcError {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number; // JSON-RPC error codes
    message: string;
    data?: unknown;
  };
}
```

**JSON-RPC id rules (Normative)**:

- If the server cannot determine the request `id` (e.g., parse error), `id` MUST be `null`.
- If the request `id` is present but invalid (e.g., non-string/number/null), treat as invalid request per JSON-RPC and reply with `id: null`.

### 2) Tool Errors (Application Level)

Examples:

- Schema validation failures
- Timeouts
- Handler exceptions
- Resource exhaustion (payload too large, concurrency exceeded)
- Tool not found (unknown tools/call name)

Tool errors MUST be returned as `tools/call` results with `isError: true` and a `StructuredError` JSON payload in the returned content.

### 3) State Errors (Initialization Violations)

Examples:

- Any method (except initialize/initialized) called before RUNNING

State errors MUST be returned as JSON-RPC error responses (NOT tool results), using:

- `error.code`: `-32002`
- `error.data`: a `StructuredError` with `code: 'NOT_INITIALIZED'`

**State Error Correlation Rule (Normative)**:
All NOT_INITIALIZED state errors MUST use `connectionCorrelationId` as `error.data.correlationId`, regardless of request contents.

### State Error Response Shape (Canonical)

```typescript
interface NotInitializedJsonRpcError extends JsonRpcError {
  error: {
    code: -32002;
    message: 'Not initialized';
    data: {
      code: 'NOT_INITIALIZED';
      message: string;
      correlationId: string; // MUST be included
      // runId is omitted because no tools/call invocation occurred
    };
  };
}
```

### JSON-RPC Error Code Mapping

| Error Type       | JSON-RPC Code | Description                         |
| ---------------- | ------------- | ----------------------------------- |
| Parse error      | -32700        | Invalid JSON                        |
| Invalid Request  | -32600        | Invalid JSON-RPC structure          |
| Method not found | -32601        | Unknown method name                 |
| Invalid params   | -32602        | Invalid method parameters           |
| Internal error   | -32603        | Internal JSON-RPC error             |
| Not initialized  | -32002        | Method called before initialization |

## Correlation ID Contract

### Goals

`correlationId` enables tracing across tool invocations and protocol failures.

### Source and Propagation (Normative)

1. **Client-provided**: Client MAY include `_meta.correlationId` in `tools/call` params (NOT inside `arguments`).
2. **Server-generated**: If not provided, server MUST generate a UUID v4 `correlationId` for that request.
3. **Stripping**: Server MUST NOT pass `_meta` to the tool handler.
4. **Propagation**: Server MUST include `correlationId` in all logs and error responses for that request/invocation.

`_meta` is an implementation-specific extension field. Unknown meta keys MUST be ignored.

```typescript
interface ToolsCallParams {
  name: string;
  arguments?: Record<string, unknown>; // MUST be an object if present
  _meta?: {
    correlationId?: string;
    // Unknown keys ignored
  };
}
```

### CorrelationId for Protocol Errors (Including Parse Errors)

Some protocol errors occur before request params can be read.

**Rule (Normative)**:

- Each connection MUST have a server-generated `connectionCorrelationId` created at connection open.
- If a request-level `correlationId` cannot be derived (e.g., parse error), the server MUST use `connectionCorrelationId` in `error.data.correlationId`.

### ID Lifecycle

| ID                        | Generated                        | Scope               | Included In                                                 |
| ------------------------- | -------------------------------- | ------------------- | ----------------------------------------------------------- |
| `runId`                   | Per tools/call invocation        | Single invocation   | Logs, tool error payloads                                   |
| `correlationId`           | Per request (or client-provided) | Request chain       | Logs, protocol/state/tool error payloads                    |
| `connectionCorrelationId` | Per connection                   | Connection lifetime | Protocol errors where request correlation cannot be derived |

## Processing Order (Normative)

To prevent ambiguity, the server MUST apply this order for `tools/call`:

1. **State gate**: connection must be RUNNING; otherwise return state error JSON-RPC (-32002).
2. **JSON-RPC params shape validation**:
   - `name` MUST be a string
   - `arguments` (if present) MUST be an object (not array/primitive)
   - `_meta` (if present) MUST be an object
   - Failures return JSON-RPC invalid params (-32602)
3. **Assign IDs**:
   - Determine `correlationId` (client-provided via `_meta` or generated)
   - Generate `runId` (tools/call only)
4. **Payload size check** (fast reject):
   - Measure UTF-8 byte length of JSON-serialized `arguments` (treat absent `arguments` as `{}`)
   - Reject with tool error `RESOURCE_EXHAUSTED` if too large
5. **Tool existence check**:
   - If tool not found, return tool error `NOT_FOUND`
6. **Acquire concurrency slot**:
   - If none available, return tool error `RESOURCE_EXHAUSTED`
7. **Schema validation** using precompiled Ajv validator:
   - If invalid, return tool error `INVALID_ARGUMENT`
8. **Execute handler** with timeout policy (see Timeout Contract)
9. **Release slot** (always, in finally; see Timeout Contract for timing)
10. **Wrap result/error** into MCP tools/call format

## Timeout Contract (Normative)

Timeout enforcement is a **response deadline**, not a guaranteed hard-kill of computation.

1. The server MUST enforce a per-invocation deadline (`tools.defaultTimeoutMs` unless tool-specific override exists).
2. If the deadline is exceeded, the server MUST return tool error `TIMEOUT`.
3. The server MUST provide **cooperative cancellation** to handlers:
   - `ToolContext` MUST include an `AbortSignal` (`context.abortSignal`).
   - On timeout, the server MUST call `abortController.abort()`.
   - Handlers SHOULD stop promptly when aborted.
4. **Concurrency slot handling on timeout** (safety rule):
   - The slot MUST remain held until the handler returns (or is cooperatively cancelled and returns).
   - The server MUST NOT release the slot immediately on timeout, because the handler may still be consuming resources.
5. Late handler completion after timeout MUST NOT produce an additional response; it MAY be logged.

## Components and Interfaces

### 1) MCP Server Entry Point (`src/index.ts`)

```typescript
interface ServerOptions {
  config: ServerConfig;
  logger: StructuredLogger;
  toolRegistry: ToolRegistry;
  resourceManager: ResourceManager;
  agentCoordinator?: AgentCoordinator;
  idGenerator: IdGenerator;
  clock: Clock;
}

async function createServer(options: ServerOptions): Promise<MCPServer>;
async function startServer(server: MCPServer): Promise<void>;
```

### 2) Tool Registry (`src/mcp/toolRegistry.ts`)

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema7; // draft-07
  version?: string;
}

interface ToolContext {
  runId: string;
  correlationId: string;
  logger: StructuredLogger;
  abortSignal: AbortSignal; // cooperative cancellation
}

interface ToolHandler {
  (args: Record<string, unknown>, context: ToolContext): Promise<unknown>;
}

type CompiledValidator = import('ajv').ValidateFunction;

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  validator: CompiledValidator; // compiled at registration time
}

interface ToolRegistry {
  register(definition: ToolDefinition, handler: ToolHandler, opts?: { isDynamic?: boolean }): void;
  unregister(name: string): boolean;
  get(name: string): RegisteredTool | undefined;
  list(): ToolDefinition[]; // lexicographically sorted by name
  validateDefinition(definition: ToolDefinition, opts?: { isDynamic?: boolean }): ValidationResult;
}
```

### Schema Validation Strategy (Normative)

1. ToolRegistry MUST compile JSON Schema validators at registration time using Ajv.
2. Compiled validators MUST be cached per tool for reuse.
3. If schema compilation fails, registration MUST fail immediately with descriptive error.
4. `tools/call` MUST only use precompiled validators (no runtime compilation).
5. **Object root constraint**: Tool schemas MUST be object-root (`type: 'object'`). Non-object roots MUST be rejected at registration time with `INVALID_ARGUMENT`.

### Dynamic Registration Security

Dynamic registration is definition-only with predefined ToolType mapping.

**Rules**:

- Any tool registered via `admin/registerTool` uses predefined handler mapping based on `toolType`
- No arbitrary code upload is supported in v0.1
- `config.security.allowArbitraryCodeTools` is reserved for future use and not used in v0.1

### 3) Protocol Handlers (`src/mcp/handlers.ts`)

```typescript
interface InitializeResult {
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  capabilities: { tools?: {} };
}

interface ToolsListResult {
  tools: Array<{ name: string; description: string; inputSchema: JSONSchema7; version?: string }>;
}

interface ToolsCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

interface RequestContext {
  correlationId: string;
  runId?: string; // set for tools/call only
  transport: Transport;
  connectionCorrelationId: string; // always present
  logger: StructuredLogger;
}

async function handleInitialize(
  params: InitializeParams,
  ctx: RequestContext
): Promise<InitializeResult>;
async function handleInitialized(ctx: RequestContext): Promise<void>;
async function handleToolsList(ctx: RequestContext): Promise<ToolsListResult>;
async function handleToolsCall(
  params: ToolsCallParams,
  ctx: RequestContext
): Promise<ToolsCallResult>;
```

### Result Wrapping (Normative)

- Tool handler results MUST be JSON-serializable.
- Non-serializable results MUST return tool error `INTERNAL` with `details: { reason: 'result_not_serializable' }`.

```typescript
function wrapResult(result: unknown, ctx: RequestContext): ToolsCallResult {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false };
  } catch {
    return wrapToolError(
      createError(ErrorCode.Internal, 'Result not serializable', {
        reason: 'result_not_serializable',
      }),
      ctx
    );
  }
}

function wrapToolError(err: StructuredError, ctx: RequestContext): ToolsCallResult {
  const enriched: StructuredError = {
    ...err,
    correlationId: ctx.correlationId,
    runId: ctx.runId,
  };
  return { content: [{ type: 'text', text: JSON.stringify(enriched) }], isError: true };
}
```

### 4) Configuration Manager (`src/config/configManager.ts`)

```typescript
interface AdminPolicy {
  mode: 'deny_all' | 'local_stdio_only' | 'token';
  tokenEnvVar?: string;
}

interface ServerConfig {
  server: { name: string; version: string; shutdownTimeoutMs: number }; // default 10000

  tools: {
    defaultTimeoutMs: number; // default 30000
    maxPayloadBytes: number; // default 1048576
    maxStateBytes: number; // default 262144 (256KB)
    adminRegistrationEnabled: boolean; // default false
    adminPolicy: AdminPolicy; // default { mode: 'deny_all' }
  };

  resources: {
    maxConcurrentExecutions: number; // default 10
  };

  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    redactKeys: string[]; // default denylist
  };

  security: {
    dynamicRegistrationEnabled: boolean; // default false
    allowArbitraryCodeTools: boolean; // default false
  };

  aacp?: {
    defaultTtlMs: number; // default 86400000 (24 hours)
  };
}

interface ConfigManager {
  load(): ServerConfig;
  validate(config: Partial<ServerConfig>): ValidationResult;
  get<K extends keyof ServerConfig>(key: K): ServerConfig[K];
}
```

### Configuration Precedence (Normative)

Environment variables override config file values, which override defaults. Invalid configs MUST fail fast at startup with a descriptive error.

### Dynamic Registration Effective Enablement (Normative)

Dynamic registration is enabled only if BOTH are true:

- `tools.adminRegistrationEnabled === true`
- `security.dynamicRegistrationEnabled === true`

```typescript
const dynamicRegistrationEffective =
  config.tools.adminRegistrationEnabled && config.security.dynamicRegistrationEnabled;
```

### Admin Authorization Enforcement (Normative)

Authorization is enforced at protocol handler layer.

```typescript
interface Transport {
  type: 'stdio' | 'sse' | 'http';
}

function enforceAdminPolicy(policy: AdminPolicy, transport: Transport): void {
  switch (policy.mode) {
    case 'deny_all':
      throw new UnauthorizedError('Admin operations are disabled');
    case 'local_stdio_only':
      if (transport.type !== 'stdio')
        throw new UnauthorizedError('Admin operations only allowed via stdio');
      return;
    case 'token':
      // Reserved for future HTTP/SSE transports
      throw new UnauthorizedError('Token mode not supported in v0.1');
  }
}
```

### Administrative Operations

Administrative tools exist only when `dynamicRegistrationEffective` is true.

```typescript
type ToolType = 'echo' | 'health' | 'agentProxy';

interface DynamicToolDefinition extends ToolDefinition {
  toolType: ToolType; // required for dynamic registration
}
```

**ToolType Canonical Schemas (Normative)**:

- `'echo'`: `{ type: 'object', properties: { message: { type: 'string' } }, required: ['message'] }`
- `'health'`: `{ type: 'object', properties: {}, additionalProperties: false }`
- `'agentProxy'`: `{ type: 'object', properties: { targetAgentId: { type: 'string' }, message: { type: 'object' } }, required: ['targetAgentId', 'message'] }`

**Schema Enforcement Rules (Normative)**:

- The server uses the canonical schema for the declared toolType
- If the client supplies inputSchema, it is treated as an assertion and MUST byte-match canonical; otherwise reject with INVALID_ARGUMENT
- Unknown toolTypes MUST be rejected with INVALID_ARGUMENT

| Tool Name              | Description                     | Condition                                             |
| ---------------------- | ------------------------------- | ----------------------------------------------------- |
| `admin/registerTool`   | Register a new tool dynamically | `dynamicRegistrationEffective` + `enforceAdminPolicy` |
| `admin/unregisterTool` | Remove a registered tool        | `dynamicRegistrationEffective` + `enforceAdminPolicy` |

When not enabled, admin tools MUST NOT appear in `tools/list`.

### 5) Structured Logger (`src/logging/structuredLogger.ts`)

```typescript
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  correlationId?: string;
  runId?: string;
  durationMs?: number;
  error?: { code: string; message: string; details?: unknown };
  [key: string]: unknown;
}

interface StructuredLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): StructuredLogger;
  redact(obj: unknown): unknown;
  sanitize(str: string): string;
}
```

### Redaction (Normative)

- Case-insensitive key match against `redactKeys`
- Recursively applied to nested objects/arrays
- Replace values with `"[REDACTED]"`
- MUST NOT mutate original runtime data (copy-on-write)

### Sanitization (Normative)

- Escape control characters (`\n`, `\r`, `\t`, and `\u0000-\u001F`) using unicode escapes
- Applied to log output only
- MUST NOT mutate runtime data

### 6) Error Handler (`src/errors/errorHandler.ts`)

```typescript
enum ErrorCode {
  InvalidArgument = 'INVALID_ARGUMENT',
  NotFound = 'NOT_FOUND',
  Timeout = 'TIMEOUT',
  ResourceExhausted = 'RESOURCE_EXHAUSTED',
  Internal = 'INTERNAL',
  Unauthorized = 'UNAUTHORIZED',
  NotInitialized = 'NOT_INITIALIZED',
}

enum ToolCompletionOutcome {
  Success = 'success',
  ToolError = 'tool_error',
  Timeout = 'timeout',
  LateCompleted = 'late_completed',
  Aborted = 'aborted',
  DisconnectedCompleted = 'disconnected_completed',
  ProtocolError = 'protocol_error',
}

interface StructuredError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  runId?: string;
  correlationId?: string;
}

function createError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): StructuredError;
```

### 7) Resource Manager (`src/resources/resourceManager.ts`)

```typescript
interface ResourceTelemetry {
  memoryUsageBytes: number;
  eventLoopDelayMs: number;
  concurrentExecutions: number;
  maxConcurrentExecutions: number;
}

type ReleaseFunction = () => void;

interface ResourceManager {
  acquireSlot(): Promise<ReleaseFunction>;
  tryAcquireSlot(): ReleaseFunction | null;
  validatePayloadSize(payload: unknown): ValidationResult;
  getTelemetry(): ResourceTelemetry;
  isApproachingLimits(): boolean;
}
```

### 8) Agent Coordinator (`src/agents/agentCoordinator.ts`)

```typescript
interface AgentMessage {
  type: string;
  payload: unknown;
  sourceAgentId?: string;
}

interface AgentContext {
  agentId: string;
  state: Map<string, unknown>;
  logger: StructuredLogger;
}

type AgentResponse = unknown;

interface AgentHandler {
  (message: AgentMessage, context: AgentContext): Promise<AgentResponse>;
}

interface AgentCoordinator {
  registerAgent(id: string, handler: AgentHandler): void;
  unregisterAgent(id: string): boolean;
  sendMessage(targetAgentId: string, message: AgentMessage): Promise<AgentResponse>;
  getAgentState(agentId: string): Map<string, unknown> | undefined;
  onStateChange?: (agentId: string, state: Map<string, unknown>) => void;
}
```

### Agent Concurrency Model (Normative)

- Agent handlers MUST be invoked sequentially per agent via a per-agent queue.
- Different agents MAY process messages concurrently.

### 9) Health Tool (`src/tools/healthTool.ts`)

```typescript
interface HealthResponse {
  server: { name: string; version: string };
  config: {
    toolTimeoutMs: number;
    maxConcurrentExecutions: number;
    maxPayloadBytes: number;
    maxStateBytes: number;
  };
  resources: ResourceTelemetry;
  status: 'healthy' | 'degraded' | 'unhealthy';
}
```

### Health Thresholds (Normative)

| Status      | Criteria                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `healthy`   | All metrics within normal bounds                                                                                  |
| `degraded`  | concurrentExecutions > 80% of max OR eventLoopDelayMs > 100ms                                                     |
| `unhealthy` | concurrentExecutions == max OR eventLoopDelayMs > 500ms OR 3+ consecutive RESOURCE_EXHAUSTED tool-call rejections |

### ResourceExhausted Counter (Process-Level)

- **Scope**: process-wide rolling counter (not per-session)
- **Increment**: on each tools/call rejection with `RESOURCE_EXHAUSTED`
- **Reset**: on first non-`RESOURCE_EXHAUSTED` tools/call completion (success or other error)
- Does not count protocol/state errors

## MVP Scope and Non-Goals

### In Scope (v0.1)

- Stdio transport only
- Tool registration, listing, invocation
- JSON Schema validation (draft-07) with Ajv precompile/cache
- Structured logging with redaction + sanitization
- Resource limits (concurrency, payload size)
- Basic agent coordination (in-memory state, per-agent sequential queue)
- Health tool with telemetry
- Deterministic test mode

### Non-Goals (Future Iterations)

- SSE/HTTP transports
- Persistent agent state
- Token-based authentication for remote admin
- Distributed tracing integration
- Metrics export (Prometheus/OpenTelemetry exporters)
- Hot configuration reload
- Hard-kill execution isolation (worker/process termination) for tool timeouts

## AACP Foundation (v0.2 Target)

### Agent-to-Agent Communication Protocol (AACP)

While v0.1 focuses on the MCP server backbone, we define AACP interfaces now to avoid architectural constraints in future iterations. AACP provides reliable, resumable communication between agents with message ordering guarantees and deduplication.

### AACP Envelope and Invariants

```typescript
interface AACPEnvelope {
  messageId: string; // UUID v4, unique per transmission attempt
  requestId?: string; // UUID v4, stable across retries for same logical request
  sourceAgentId: string; // sending agent identifier
  targetAgentId: string; // receiving agent identifier
  seq: number; // sequence number per source-target pair
  ack?: number; // acknowledgment of highest received seq
  messageType: 'REQUEST' | 'RESPONSE' | 'EVENT';
  timestamp: string; // ISO 8601 timestamp
  payload: unknown; // application-specific message content
}
```

**AACP Invariants (Normative for v0.2)**:

1. **Message ID Uniqueness**: Each `messageId` MUST be globally unique per transmission attempt
2. **Request ID Stability**: `requestId` MUST remain stable across retries for the same logical request
3. **Sequence Ordering**: `seq` numbers MUST be monotonically increasing per `sourceAgentId → targetAgentId` pair
4. **Request-Response Pairing**: RESPONSE messages MUST include the `requestId` from the corresponding REQUEST
5. **Acknowledgment Semantics**: `ack` field MUST indicate the highest `seq` number successfully received and processed
6. **Deduplication Rule**: Messages with duplicate `requestId` MUST be processed idempotently; duplicate `messageId` MUST be ignored

**Deduplication and Acknowledgment Keys**:

- **Transport acknowledgment**: Keys on `messageId` (confirms message received)
- **Semantic acknowledgment**: Keys on `requestId` (confirms request processed)
- **Deduplication**: Keys on `requestId` for idempotent request semantics
- **Ordered streams**: May key on `(requestId, seq)` for sequence-dependent processing

### Resumability Contract

AACP supports resumable communication across agent restarts and network partitions:

```typescript
enum AACPOutcome {
  COMPLETED = 'COMPLETED', // Message successfully processed
  FAILED = 'FAILED', // Message processing failed permanently
  UNKNOWN = 'UNKNOWN', // Message state unknown (timeout, partition)
}

interface AACPMessageStatus {
  messageId: string;
  requestId?: string; // present for REQUEST/RESPONSE messages
  outcome: AACPOutcome;
  timestamp: string;
  error?: StructuredError; // present when outcome === FAILED
  completionRef?: string; // reference to completion record/payload
}
```

**Resumability Rules (Normative for v0.2)**:

1. **Idempotency Requirement**: All AACP message handlers MUST be idempotent (safe to retry)
2. **State Persistence**: Message status MUST be persisted before outcome reporting
3. **Recovery Protocol**: On restart, agents MUST query message status and resume from last known state
4. **Timeout Handling**: Messages in UNKNOWN state MUST be retried with exponential backoff

**Timeout and Disconnect Completion Outcomes (Normative)**:

- **Timeout exceeded, handler completes later**: `late_completed`
- **Disconnect triggered, handler returns normally**: `disconnected_completed`
- **Disconnect triggered, handler throws due to abort**: `aborted`
- **Handler exceeds deadline after disconnect**: `late_completed` (deadline remains the driver)
- **Normal completion**: `success` or `tool_error`
- **Protocol-level errors**: `protocol_error`
  **Timeout and UNKNOWN State Semantics (Critical)**:
- **MCP Timeout Behavior**: When an MCP tool call times out, the handler may continue running after the timeout response is returned
- **AACP Timeout Rule**: If a request times out at the caller, the outcome is UNKNOWN unless the caller later receives a durable completion signal
- **Late Completion Handling**: If the underlying handler finishes after timeout, that completion MUST be:
  - Recorded in the ledger (if enabled) for AACP continuation/recovery
  - Ignored for the already-returned MCP response (no duplicate response)
  - Available for future AACP recovery operations
- **Observability Loss**: Timeouts represent observability loss, not necessarily failure; the work may have completed successfully

### Persistence Adapter Interface

```typescript
interface AACPPersistenceAdapter {
  // Ledger-first message operations (structured records, not blob storage)
  putRequestRecord(requestId: string, record: AACPRequestRecord): Promise<void>;
  putMessageRecord(messageId: string, record: AACPMessageRecord): Promise<void>;
  getRequestRecord(requestId: string): Promise<AACPRequestRecord | null>;
  getMessageRecord(messageId: string): Promise<AACPMessageRecord | null>;

  // Completion tracking
  markCompleted(requestId: string, outcome: AACPOutcome, completionRef?: string): Promise<void>;
  markFailed(requestId: string, error: StructuredError): Promise<void>;

  // Sequence tracking
  getLastSequence(sourceAgentId: string, targetAgentId: string): Promise<number>;
  updateLastSequence(sourceAgentId: string, targetAgentId: string, seq: number): Promise<void>;

  // Recovery operations
  getUnacknowledgedMessages(sourceAgentId: string, targetAgentId: string): Promise<AACPEnvelope[]>;
  listPendingRequests(olderThan?: Date): Promise<AACPRequestRecord[]>;
  listMessagesInState(outcome: AACPOutcome, olderThan?: Date): Promise<AACPMessageRecord[]>;

  // Retention operations (v0.2 seam)
  purgeExpired(now: Date): Promise<number>; // returns count of purged records
}

interface AACPRequestRecord {
  requestId: string;
  sourceAgentId: string;
  targetAgentId: string;
  messageType: 'REQUEST' | 'RESPONSE';
  payload: unknown; // small payloads stored inline for v0.1
  status: AACPOutcome;
  timestamp: string;
  expiresAt?: string; // ISO 8601 timestamp for TTL/retention
  completionRef?: string; // future: reference to blob storage for large payloads
  error?: StructuredError;
}

interface AACPMessageRecord {
  messageId: string;
  requestId?: string;
  envelope: AACPEnvelope;
  status: AACPOutcome;
  timestamp: string;
  expiresAt?: string; // ISO 8601 timestamp for TTL/retention
  retryCount: number;
  nextRetryAt?: string; // ISO 8601 timestamp for next retry attempt
}
```

**v0.1 Implementation Note**: The initial implementation will use an in-memory persistence adapter with structured records (not blob storage). Small payloads are stored inline; large payload support via `completionRef` is reserved for v0.2. This ledger-first approach avoids size blow-ups, secret retention issues, and expensive rehydration problems.

**Important**: The in-memory AACPPersistenceAdapter provides best-effort tracking for a single process lifetime only and MUST NOT be considered durable across restarts.

**ExpiresAt Semantics (Normative)**:

- On record creation, the server MUST set `expiresAt = creationTime + config.aacp.defaultTtlMs` unless an explicit `expiresAt` is provided
- `purgeExpired(now)` MUST delete all records with `expiresAt <= now` and return count deleted

### AACP Clarifications (Implementation-Critical)

**Type Definitions**:

```typescript
type AACPMessageType = 'REQUEST' | 'RESPONSE' | 'EVENT';
```

**Acknowledgment Semantics (Normative)**:

- `ack` field represents cumulative receipt acknowledgment for contiguous sequence prefix only
- Receiver MUST only advance `ack` to the highest contiguous `seq` such that all `seq ≤ ack` have been received
- Out-of-order messages do not advance `ack` until gaps are filled
- Semantic completion is tracked separately in the ledger via `requestId` status (COMPLETED/FAILED/UNKNOWN)
- **Receipt vs Processing**: `ack` confirms receipt; ledger status confirms processing/commitment

**Retry Contract (Normative)**:

- Retries MUST reuse the same `requestId` for idempotent semantics
- Retries MAY use a new `messageId` per attempt (tracked via `retryCount` in `AACPMessageRecord`)
- Receiver MUST deduplicate by `requestId` before execution
- Retries MUST be idempotent at the receiver via `requestId` deduplication

**Durable Completion Signals**:
A "durable completion signal" includes any of:

- Ledger shows `requestId` marked COMPLETED/FAILED
- Receiver sends RESPONSE with `requestId` and outcome
- Status query returns completed state from persistent storage

**Gap Handling**:

- Messages arriving out of order create sequence gaps
- Cumulative `ack` cannot advance past gaps
- Retransmission fills gaps based on missing sequence numbers
- Receivers maintain gap detection for proper `ack` advancement

### AACP Module Boundaries (v0.2 Architecture)

```typescript
// Message type definition
type AACPMessageType = 'REQUEST' | 'RESPONSE' | 'EVENT';

// Message encoding/decoding
interface AACPEncoder {
  encode(envelope: AACPEnvelope): string;
  decode(data: string): AACPEnvelope;
}

// Session management with sequence tracking
interface AACPSessionManager {
  createSession(sourceAgentId: string, targetAgentId: string): Promise<AACPSession>;
  getSession(sourceAgentId: string, targetAgentId: string): Promise<AACPSession | null>;
  closeSession(sourceAgentId: string, targetAgentId: string): Promise<void>;
}

interface AACPSession {
  sourceAgentId: string;
  targetAgentId: string;
  nextSeq: number;
  lastAck: number;
  sendMessage(payload: unknown, messageType: AACPMessageType): Promise<string>; // returns messageId
  acknowledgeMessage(seq: number): Promise<void>;
}

// Message ledger with persistence
interface AACPLedger {
  append(envelope: AACPEnvelope): Promise<void>;
  getByMessageId(messageId: string): Promise<AACPEnvelope | null>;
  getUnacknowledged(sourceAgentId: string, targetAgentId: string): Promise<AACPEnvelope[]>;
  markCompleted(messageId: string): Promise<void>;
  markFailed(messageId: string, error: StructuredError): Promise<void>;
}

// Retransmission and recovery
interface AACPRetransmitter {
  scheduleRetry(messageId: string, delay: number): Promise<void>;
  cancelRetry(messageId: string): Promise<void>;
  processRetries(): Promise<void>; // background process

  // Policy hooks for retry behavior
  shouldRetry(record: AACPMessageRecord, error?: StructuredError): boolean;
  getBackoffDelay(retryCount: number): number; // exponential backoff strategy
  getMaxAttempts(): number;
}

interface AACPRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  shouldRetryError: (error: StructuredError) => boolean;
}
```

**Retry and Deduplication Processing Order (Normative for v0.2)**:

1. **Deduplication check**: Check for duplicate `requestId` before execution
2. **Idempotency check**: If duplicate found, return cached result if available
3. **Execution**: Execute handler only if not duplicate and not already completed
4. **Retry decision**: Apply `shouldRetry` policy after execution failure
5. **Backoff scheduling**: Use exponential backoff with jitter for retry timing

````

### Integration with Agent Coordinator

The existing `AgentCoordinator` will be extended in v0.2 to support AACP:

```typescript
interface AgentCoordinatorV2 extends AgentCoordinator {
  // AACP-enabled message sending (additive, not breaking)
  sendReliableMessage(targetAgentId: string, payload: unknown): Promise<string>; // returns messageId
  sendRequest(targetAgentId: string, payload: unknown): Promise<unknown>; // returns response payload

  // AACP event handlers
  onMessageReceived?: (envelope: AACPEnvelope) => Promise<void>;
  onMessageCompleted?: (messageId: string) => Promise<void>;
  onMessageFailed?: (messageId: string, error: StructuredError) => Promise<void>;
}
````

**v0.1 Compatibility (Normative)**:

- The existing `sendMessage()` method MUST continue to work for simple in-memory communication
- AACP methods are additive extensions that do not break existing code
- Existing `AgentCoordinator` interface remains intact and functional
- Migration to v0.2 is opt-in via new methods, not forced upgrade

## External Type Definitions

```typescript
import { JSONSchema7 } from 'json-schema';
import { ValidateFunction } from 'ajv';

type CompiledValidator = ValidateFunction;

interface Transport {
  type: 'stdio' | 'sse' | 'http';
}

interface ValidationResult {
  valid: boolean;
  errors?: Array<{ path: string; message: string }>;
}

interface IdGenerator {
  generateRunId(): string;
  generateCorrelationId(): string;
  generateConnectionCorrelationId(): string;
}

interface Clock {
  now(): Date;
  timestamp(): string; // ISO 8601
}
```

## Correctness Properties (v0.1)

1. **Initialization Response Completeness**: `initialize` result includes configured server name/version/capabilities.
2. **Strict Initialization Gate**: before RUNNING, only `initialize`/`initialized` allowed; others return JSON-RPC (-32002) with correlationId.
3. **Protocol Error Correlation**: all protocol errors include request `correlationId` if derivable else `connectionCorrelationId`.
4. **Tools/List Ordering**: `tools/list` returns all tools sorted lexicographically by name.
5. **Validator Precompilation**: `tools/call` uses only precompiled validators; no runtime schema compilation.
6. **Arguments Shape Enforcement**: if `arguments` is present and not an object, return JSON-RPC invalid params (-32602); handler not executed.
7. **Concurrency Limit Enforcement**: if concurrent invocations exceed max, reject with `RESOURCE_EXHAUSTED`.
8. **Timeout Enforcement with Cooperative Cancellation**: return `TIMEOUT`, abort signal is fired, slot held until handler completes/cancels.
9. **Log Redaction and Sanitization**: redact configured keys and escape control chars without mutating runtime objects.
10. **Agent Serialism**: per agent, messages process sequentially; state remains consistent.

## Application Error Code Mapping

| Scenario                     | ErrorCode            | Notes                                |
| ---------------------------- | -------------------- | ------------------------------------ |
| Schema validation failure    | `INVALID_ARGUMENT`   | tools/call result, isError: true     |
| Tool not found               | `NOT_FOUND`          | tools/call result, isError: true     |
| Tool timeout                 | `TIMEOUT`            | tools/call result, isError: true     |
| Concurrency/payload exceeded | `RESOURCE_EXHAUSTED` | tools/call result, isError: true     |
| Handler exception            | `INTERNAL`           | tools/call result, isError: true     |
| Admin unauthorized           | `UNAUTHORIZED`       | tools/call result, isError: true     |
| Not initialized              | `NOT_INITIALIZED`    | JSON-RPC (-32002), not a tool result |

## Testing Strategy

### Unit Tests

- **ToolRegistry**: registration, retrieval, ordering, schema precompile, root object constraint, duplicate prevention
- **ConfigManager**: precedence, validation, defaults, effective dynamic registration logic
- **StructuredLogger**: redaction + sanitization correctness; no mutation
- **ResourceManager**: slot acquire/release; limit enforcement; payload sizing
- **AgentCoordinator**: per-agent sequential queue and state stability
- **Error handling**: JSON-RPC protocol errors vs tool errors vs state errors
- **Timeout contract**: abort signal fired; slot not released until handler completion

### Property-Based Tests

- Each correctness property has a property test (min 100 iterations)
- Use injectable `Clock` and `IdGenerator` for determinism
- Include malformed JSON-RPC shapes and pathological payload sizes

### Integration Tests

- End-to-end init lifecycle enforcement (STARTING/INITIALIZING/RUNNING)
- `tools/list` and `tools/call` compliance
- Protocol errors (-32700, -32600, -32601, -32602) and id/null rules
- State error (-32002) shape and correlation behavior
- Resource exhaustion, timeout behaviors, and slot holding after timeout
- Health tool thresholds and exhausted counter behavior

### Performance Tests

- p50/p95 latency for no-op tool invocation
- Throughput under concurrent load up to `maxConcurrentExecutions`
- Memory usage under sustained operation
- Event loop delay monitoring behavior

## Appendix: Timeout Guidance for Tool Authors (Normative + Practical)

This server enforces timeouts as response deadlines with cooperative cancellation. Tool authors MUST understand what a timeout means operationally and how to write handlers that stop promptly.

### A. Semantics: What `TIMEOUT` Means

- A timeout is a **server-side deadline**, not a guaranteed termination of computation.
- When the deadline is exceeded:
  - The server returns a `TIMEOUT` tool error to the client.
  - The server triggers cooperative cancellation via `AbortSignal`.
- The handler may still run after the client receives `TIMEOUT` if it does not cooperate with cancellation.
- **Resource safety rule**: the server holds the concurrency slot until the handler returns (or stops after cancellation). This prevents resource overcommit from "timed-out but still running" work.

### B. ToolContext Contract for Cancellation

`ToolContext` includes an `AbortSignal`:

```typescript
interface ToolContext {
  runId: string;
  correlationId: string;
  logger: StructuredLogger;
  abortSignal: AbortSignal; // cooperative cancellation
}
```

**Normative requirement**: Tool handlers SHOULD treat `abortSignal` as authoritative and attempt to terminate promptly when aborted.

### C. Handler Implementation Requirements and Best Practices

#### 1) Fast Abort Checks (Recommended)

Tool handlers SHOULD check `abortSignal.aborted`:

- At the start of execution
- Between major steps
- Inside long loops

Example:

```typescript
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const err = new Error('Aborted');
    (err as any).code = 'ABORTED';
    throw err;
  }
}

async function handler(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  throwIfAborted(ctx.abortSignal);
  // ... step 1 ...
  throwIfAborted(ctx.abortSignal);
  // ... step 2 ...
  return { ok: true };
}
```

#### 2) Pass AbortSignal into Cancellable APIs (Recommended)

Many modern APIs support cancellation via `AbortSignal` (e.g., `fetch`). Handlers SHOULD pass `abortSignal` into such APIs.

Example:

```typescript
const res = await fetch(url, { signal: ctx.abortSignal });
```

For third-party libraries (HTTP/DB), handlers SHOULD use the library's cancellation primitives where available. If the library has no cancellation mechanism, document that the operation may continue until completion.

#### 3) Avoid Long Synchronous CPU Work (Strongly Recommended)

Node.js cannot preempt synchronous CPU-bound work running on the event loop thread. Handlers SHOULD avoid:

- Tight compute loops
- Large JSON parsing/stringifying in hot paths
- Compression/encryption on very large payloads without yielding

If CPU-heavy work is required, handlers SHOULD:

- Chunk work and periodically yield to the event loop (e.g., `await setImmediate(...)` patterns), and check `abortSignal` between chunks; or
- Move compute to a Worker Thread / child process (future scope unless you explicitly choose to implement it now).

#### 4) Cancellation is Cooperative, Not Guaranteed

Even with `AbortSignal`:

- Some operations ignore it.
- Cancellation often stops waiting on I/O, but remote systems may still be processing the request.
- Cleanup logic SHOULD be idempotent and safe to run after cancellation.

### D. Logging and Observability Guidance

- Handlers SHOULD log cancellation events at `info` or `warn` with `{ runId, correlationId }`, for example:
  - "handler aborted"
  - "cancellation requested during phase X"
  - "external call aborted"
- Handlers MUST NOT log secrets; logger redaction still applies, but tool authors should avoid placing sensitive data in log contexts.

### E. Operational Expectations (Explicit)

- **Clients** MUST assume that `TIMEOUT` means: "the server stopped waiting and responded with an error," not necessarily "the underlying work stopped."
- **Server operators** MUST assume that handlers which do not cooperate with cancellation may contribute to sustained utilization; the concurrency slot holding rule mitigates this at the server level.
