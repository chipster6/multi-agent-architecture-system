# Tasks: Foundation MCP Runtime (v0.1)

## Overview

Implementation tasks for the foundational MCP server backbone. Tasks are organized by component with dependencies noted. Each task includes acceptance criteria derived from requirements and design specifications.

## 🔍 MANDATORY PRE-TASK CONSULTATION

**BEFORE STARTING ANY TASK OR SUBTASK**, you MUST:

1. **Identify relevant libraries/technologies** mentioned in the task
2. **Use `resolve-library-id`** to get Context7-compatible library IDs for each technology
3. **Use `get-library-docs`** to fetch current documentation, best practices, and API changes
4. **Document findings** in a brief "Technology Consultation Summary" before implementation
5. **Adjust implementation** based on latest documentation and best practices discovered

This ensures our multi-agent architecture system stays current with evolving technologies and incorporates the latest patterns, security practices, and performance optimizations.

**Example Technologies to Always Consult:**

- `@modelcontextprotocol/sdk` - Core MCP functionality
- `ajv` - JSON Schema validation patterns
- `vitest` - Testing frameworks and patterns
- `typescript` - Latest language features and best practices
- Any cloud providers, databases, or frameworks mentioned in tasks

---

## Phase 1: Project Scaffolding

### Task 1.1: Initialize TypeScript Project

- [x] Create `package.json` with name, version, scripts, and dependencies
- [x] Configure `tsconfig.json` with strict mode, ES2022 target, Node16 module resolution
- [x] Add dependencies: `@modelcontextprotocol/sdk`, `ajv`, `json-schema` (types)
- [x] Add dev dependencies: `vitest`, `fast-check`, `typescript`, `eslint`, `prettier`
- [x] Create directory structure per design:
  ```
  src/
  ├── index.ts
  ├── mcp/
  ├── config/
  ├── logging/
  ├── errors/
  ├── resources/
  ├── agents/
  ├── tools/
  └── shared/
  ```
- [x] Add npm scripts: `build`, `start`, `test`, `test:unit`, `test:integration`, `test:perf`, `test:property`, `type-check`, `lint`, `format`

_Requirements: 1.1, 8.1_

**Acceptance Criteria:**

- `npm install` succeeds
- `npm run build` compiles without errors
- `npm run type-check` passes
- All scripts defined and runnable

### Task 1.2: Configure Vitest Test Infrastructure

- [x] Create `vitest.config.ts` with test patterns and coverage settings
- [x] Configure test projects: unit, integration, performance, property
- [x] Add setup files for deterministic testing (injectable Clock, IdGenerator)
- [x] Configure coverage thresholds (lines: 80%, branches: 80%)
- [x] Configure fast-check for property-based testing (min 100 iterations)

_Requirements: 8.1, 8.5, 8.6_

**Acceptance Criteria:**

- `npm test` runs and reports results
- Coverage report generates in `./coverage`
- Deterministic test mode available via setup files
- Property tests run with minimum 100 iterations

### Task 1.3: Implement Shared Utilities Module

**File:** `src/shared/`

- [x] Create `utf8.ts` with `getUtf8ByteLength(str: string): number`
- [x] Create `json.ts` with `safeStringify(value: unknown): string | null` (returns null if not serializable)
- [x] Export from `src/shared/index.ts`

_Requirements: 3.2, 9.2_

**Acceptance Criteria:**

- UTF-8 byte length calculated correctly for multi-byte characters
- `safeStringify` returns null for circular references, BigInt, etc.

### Task 1.4: Configure ESLint and Prettier

- [x] Create `.eslintrc.js` with TypeScript rules
- [x] Create `.prettierrc` with consistent formatting
- [x] Add lint and format scripts to `package.json`

_Requirements: N/A (code quality)_

**Acceptance Criteria:**

- `npm run lint` passes on clean codebase
- `npm run format` applies consistent formatting

---

## Phase 2: Core Infrastructure

> **🔍 PRE-PHASE CONSULTATION**: Before starting Phase 2, consult Context7 for latest patterns on:
>
> - Structured logging frameworks and best practices
> - Error handling patterns in Node.js/TypeScript
> - Configuration management security practices
> - Resource management and monitoring approaches

### Task 2.1: Implement Structured Logger

**File:** `src/logging/structuredLogger.ts`

- [ ] Define `LogEntry` interface per design
- [ ] Implement `StructuredLogger` class with debug/info/warn/error methods
- [ ] **Constructor accepts `clock: Clock` for timestamp generation** (enables deterministic testing)
- [ ] Implement `child()` method for scoped loggers with inherited context and clock
- [ ] Implement `redact()` with configurable denylist keys (case-insensitive, recursive)
- [ ] Implement `sanitize()` for control character escaping on ALL string leaf values in log entries
- [ ] Ensure copy-on-write semantics (no mutation of runtime data)
- [ ] Output logs as JSON to **stderr only** (stdout reserved for MCP protocol)

_Requirements: 5.1-5.7, 10.1, 10.4_

**Acceptance Criteria:**

- Logs emit as valid JSON with timestamp, level, message to stderr
- **Timestamps generated via injected Clock (not `new Date()` directly)**
- Redaction replaces sensitive values with `"[REDACTED]"` (case-insensitive key match)
- Sanitization escapes `\n`, `\r`, `\t`, and `\u0000-\u001F` in all string fields
- Original objects remain unmodified after redact/sanitize
- No output to stdout from logger
- Deterministic timestamps in test mode via Clock injection
- **Note**: Sanitization of ALL string leaf values may have performance overhead on large objects

### Task 2.2: Implement Error Handler

**File:** `src/errors/errorHandler.ts`

- [ ] Define `ErrorCode` enum per design (InvalidArgument, NotFound, Timeout, ResourceExhausted, Internal, Unauthorized, NotInitialized)
- [ ] Define `StructuredError` interface with code, message, details, runId?, correlationId?
- [ ] Implement `createError()` factory function
- [ ] Implement `toJsonRpcError(code, message, data, id)` helper for protocol/state errors
- [ ] Implement `toToolError(error: StructuredError, ctx: RequestContext)` helper for tools/call wrapping
- [ ] Define JSON-RPC error code constants (-32700, -32600, -32601, -32602, -32603, -32002)

_Requirements: 6.1-6.6_

**Acceptance Criteria:**

- All error codes defined and exported
- `createError()` produces valid `StructuredError` objects
- `toJsonRpcError()` produces valid JSON-RPC error shape with correct id handling
- `toToolError()` produces `{ content: [...], isError: true }` with enriched StructuredError
- JSON-RPC error codes map correctly per design table

### Task 2.3: Implement Configuration Manager

**File:** `src/config/configManager.ts`

- [ ] Define `ServerConfig` interface per design
- [ ] Define `AdminPolicy` interface with modes: 'deny_all' | 'local_stdio_only' | 'token'
- [ ] Implement `load()` with environment variable precedence over config file over defaults
- [ ] Implement `validate()` with fail-fast on invalid config (descriptive error messages)
- [ ] Provide sensible defaults for all options
- [ ] Implement `isDynamicRegistrationEffective()` computed property:
  ```typescript
  dynamicRegistrationEffective =
    tools.adminRegistrationEnabled && security.dynamicRegistrationEnabled;
  ```

_Requirements: 4.1-4.5_

**Acceptance Criteria:**

- Config loads from env vars and optional JSON file with correct precedence
- Invalid config fails fast with descriptive error at startup
- Defaults applied: `defaultTimeoutMs: 30000`, `maxPayloadBytes: 1048576`, `maxConcurrentExecutions: 10`
- `isDynamicRegistrationEffective()` returns true only when BOTH flags are true
- Admin tools appear in tools/list only when `isDynamicRegistrationEffective() === true`
- Dynamic tool registration rejects when either flag is false

### Task 2.4: Implement ID Generator and Clock

**File:** `src/shared/idGenerator.ts`, `src/shared/clock.ts`

- [ ] Implement `IdGenerator` interface:
  - `generateRunId(): string` - UUID v4 for tool invocations
  - `generateCorrelationId(): string` - UUID v4 for request chains
  - `generateConnectionCorrelationId(): string` - UUID v4 for connection lifetime
- [ ] Implement `Clock` interface with `now()` and `timestamp()` (ISO 8601)
- [ ] Support injection for deterministic testing (accept seed or fixed values)

_Requirements: 5.2, 8.5_

**Acceptance Criteria:**

- Generated IDs are valid UUID v4 format
- Timestamps are ISO 8601 format (e.g., `2024-01-15T10:30:00.000Z`)
- Test mode allows injecting fixed/sequential values for determinism
- `generateConnectionCorrelationId()` available for protocol error fallback

---

## Phase 3: Tool Registry

> **🔍 PRE-PHASE CONSULTATION**: Before starting Phase 3, consult Context7 for latest patterns on:
>
> - JSON Schema validation with Ajv (latest version and security practices)
> - Dynamic tool registration security patterns
> - Schema compilation and caching strategies
> - Input validation best practices

### Task 3.1: Implement Tool Registry Core

**File:** `src/mcp/toolRegistry.ts`

- [ ] Define `ToolDefinition`, `ToolHandler`, `RegisteredTool` interfaces per design
- [ ] Define `ToolContext` interface with **`abortSignal: AbortSignal`** for cooperative cancellation:
  ```typescript
  interface ToolContext {
    runId: string;
    correlationId: string;
    logger: StructuredLogger;
    abortSignal: AbortSignal; // cooperative cancellation
  }
  ```
- [ ] Constructor accepts config reference for security settings
- [ ] Implement `register(definition, handler, opts?: { isDynamic?: boolean })` with duplicate name prevention
- [ ] Implement `unregister(name: string): boolean`
- [ ] Implement `get(name: string): RegisteredTool | undefined`
- [ ] Implement `list(): ToolDefinition[]` returning tools sorted lexicographically by name
- [ ] Implement `validateDefinition(definition, opts?: { isDynamic?: boolean }): ValidationResult`

_Requirements: 2.1-2.9_

**Acceptance Criteria:**

- Tools register with name, description, inputSchema, optional version
- **ToolContext includes `abortSignal: AbortSignal` for handler cancellation**
- Duplicate names rejected with descriptive error
- `list()` returns tools in deterministic alphabetical order
- Tool version included in list response when provided
- ToolRegistry receives config via constructor (not global)
- Tool authors can check `context.abortSignal.aborted` in handlers

### Task 3.2: Implement Schema Validation with Ajv

**File:** `src/mcp/toolRegistry.ts` (continued)

- [ ] Initialize Ajv instance for JSON Schema draft-07
- [ ] Compile validators at registration time using `ajv.compile(schema)`
- [ ] Cache compiled validators in `RegisteredTool.validator`
- [ ] Enforce object-root constraint (`type: 'object'` required at schema root)
- [ ] Reject non-object root schemas at registration with `INVALID_ARGUMENT` error

_Requirements: 3.2_

**Acceptance Criteria:**

- Schema compilation happens at registration, not at call time
- Invalid schemas fail registration immediately with descriptive error
- Non-object root schemas rejected with clear error message
- Compiled validators reused for all invocations (no runtime compilation)
- `ajv.errors` array available for detailed validation failure messages

### Task 3.3: Implement Dynamic Registration Security

**File:** `src/mcp/toolRegistry.ts` (continued)

- [ ] Track `isDynamic` flag on registered tools
- [ ] In `register()`, log dynamic registrations at WARN level via injected logger
- [ ] Note: `config.security.allowArbitraryCodeTools` is reserved for future use and not used in v0.1
- [ ] Note: Admin policy enforcement happens at protocol handler layer, not here

_Requirements: 2.5-2.7, 10.2, 10.3_

**Acceptance Criteria:**

- Dynamic tools (`isDynamic: true`) logged at WARN level with tool name
- ToolRegistry does NOT enforce admin policy (that's protocol handler's job)
- Static tools (registered at startup) always allowed
- `allowArbitraryCodeTools` config field exists but is not used in v0.1

---

## Phase 4: Resource Management

### Task 4.1: Implement Resource Manager

**File:** `src/resources/resourceManager.ts`

- [ ] Define `ResourceTelemetry` interface per design
- [ ] Implement concurrency slot management:
  - `acquireSlot(): Promise<ReleaseFunction>` - blocks if at limit
  - `tryAcquireSlot(): ReleaseFunction | null` - returns null if at limit
- [ ] Implement `validatePayloadSize(payload: unknown): ValidationResult`
  - Serialize to JSON, measure UTF-8 byte length
  - Compare against `config.tools.maxPayloadBytes`
- [ ] Implement `getTelemetry(): ResourceTelemetry`:
  - `memoryUsageBytes`: use `process.memoryUsage().heapUsed`
  - `eventLoopDelayMs`: use `perf_hooks.monitorEventLoopDelay()`, report p99
    - **Histogram enabled at startup**
    - **Reset histogram every 10 seconds to get rolling window**
    - **Report p99 from current window snapshot**
  - `concurrentExecutions`: current slot count
  - `maxConcurrentExecutions`: from config
- [ ] Implement `isApproachingLimits(): boolean` for load shedding (>80% utilization)

_Requirements: 9.1-9.5_

**Acceptance Criteria:**

- Slots acquired/released correctly with proper counting
- Payload size validated using UTF-8 byte length of JSON-serialized arguments
- `memoryUsageBytes` reports `process.memoryUsage().heapUsed`
- `eventLoopDelayMs` reports p99 from `monitorEventLoopDelay()` histogram
- **Event loop histogram enabled at startup, reset every 10s for rolling window**
- Load shedding triggers when `concurrentExecutions > 0.8 * maxConcurrentExecutions`
- **Client retry guidance documented**: exponential backoff + jitter recommended for RESOURCE_EXHAUSTED
- **Server logs include hint on RESOURCE_EXHAUSTED**: single-line guidance for client retry behavior

### Task 4.2: Implement Health Thresholds

**File:** `src/resources/resourceManager.ts` (continued)

- [ ] Implement health status calculation returning 'healthy' | 'degraded' | 'unhealthy'
- [ ] Track ResourceExhausted counter (process-level rolling):
  - Increment on tools/call **rejection** with RESOURCE_EXHAUSTED (not handler-returned errors)
  - Reset on first non-RESOURCE_EXHAUSTED tools/call completion
- [ ] Implement `getHealthStatus(): HealthStatus` using thresholds:
  - `healthy`: all metrics within normal bounds
  - `degraded`: concurrentExecutions > 80% of max OR eventLoopDelayMs > 100ms
  - `unhealthy`: concurrentExecutions == max OR eventLoopDelayMs > 500ms OR 3+ consecutive ResourceExhausted rejections

_Requirements: 9.4, 9.5_

**Acceptance Criteria:**

- Health status calculated correctly per threshold table
- Counter increments only on server-side rejections (not handler errors)
- Counter resets on successful completion or non-ResourceExhausted error
- `getHealthStatus()` returns correct status based on current metrics

---

## Phase 5: Protocol Handlers

### Task 5.1: Implement Connection/Session Context

**File:** `src/mcp/session.ts`

- [ ] Define `SessionContext` interface:
  ```typescript
  interface SessionContext {
    connectionCorrelationId: string;
    state: 'STARTING' | 'INITIALIZING' | 'RUNNING' | 'CLOSED';
    transport: Transport;
    logger: StructuredLogger; // child logger with connectionCorrelationId
  }
  ```
- [ ] Implement `createSession(transport, idGenerator, logger): SessionContext`
- [ ] Generate `connectionCorrelationId` at session creation

_Requirements: 1.3, 1.4, 5.2_

**Acceptance Criteria:**

- Session created with unique connectionCorrelationId
- State initialized to 'STARTING'
- Child logger includes connectionCorrelationId in all entries
- Transport type captured for admin policy enforcement

### Task 5.2: Implement MCP Server Entry Point

**File:** `src/index.ts`

- [ ] Define `ServerOptions` interface per design
- [ ] Implement `createServer(options): MCPServer` factory function
- [ ] Implement `startServer(server): Promise<void>` with stdio transport
- [ ] Wire up all components (registry, config, logger, resources, session)
- [ ] Create session on connection with connectionCorrelationId

_Requirements: 1.1-1.5_

**Acceptance Criteria:**

- Server starts and accepts stdio connections
- All components properly initialized and wired
- Session created per connection with unique connectionCorrelationId
- Server info (name, version) available from config

### Task 5.3: Implement Protocol Lifecycle State Machine

**File:** `src/mcp/handlers.ts`

- [ ] Implement per-session state tracking (STARTING → INITIALIZING → RUNNING)
- [ ] Implement `handleInitialize(params, session)`:
  - Transition state to INITIALIZING
  - Return `InitializeResult` with server name, version, capabilities
- [ ] Implement `handleInitialized(session)`:
  - Transition state to RUNNING
- [ ] Enforce strict initialization gate:
  - Block ALL methods except `initialize` and `initialized` before RUNNING
  - Return JSON-RPC error for violations

_Requirements: 1.2, 1.3_

**Acceptance Criteria:**

- State transitions correctly: STARTING → INITIALIZING → RUNNING
- `initialize` returns name, version, capabilities from config
- Methods before RUNNING return JSON-RPC error with:
  - `error.code`: -32002
  - `error.message`: 'Not initialized'
  - `error.data`: `{ code: 'NOT_INITIALIZED', message: string, correlationId: string }`
- correlationId in state error uses connectionCorrelationId (since request correlation may not be derivable)

### Task 5.4: Implement tools/list Handler

**File:** `src/mcp/handlers.ts` (continued)

- [ ] Implement `handleToolsList(session): ToolsListResult`
- [ ] Return all registered tools from ToolRegistry
- [ ] Include name, description, inputSchema, optional version per tool
- [ ] Ensure lexicographic ordering by name (delegated to registry)
- [ ] Exclude admin tools when `isDynamicRegistrationEffective() === false`

_Requirements: 2.3, 2.8, 2.9_

**Acceptance Criteria:**

- Returns all registered tools with schemas
- Tools sorted alphabetically by name
- Version included when present in tool definition
- Admin tools hidden when dynamic registration not effective

### Task 5.5: Implement tools/call Handler - Processing Order

**File:** `src/mcp/handlers.ts` (continued)

Implement the 10-step normative processing order:

- [ ] **Step 1**: State gate - verify session.state === 'RUNNING', else return JSON-RPC -32002
- [ ] **Step 2**: JSON-RPC params shape validation:
  - `name` MUST be a string
  - `arguments` (if present) MUST be an object (not array/primitive)
  - `_meta` (if present) MUST be an object
  - Failures return JSON-RPC -32602 (invalid params)
- [ ] **Step 3**: Assign IDs:
  - Extract `correlationId` from `_meta.correlationId` or generate new
  - Generate `runId` for this invocation
  - Strip `_meta` before passing to handler
- [ ] **Step 4**: Payload size check (fast reject):
  - Attempt JSON.stringify on `arguments` (treat absent as `{}`)
  - If JSON serialization fails, return tool error INVALID_ARGUMENT with `details: { reason: 'arguments_not_serializable' }`
  - Measure UTF-8 byte length of JSON-serialized `arguments`
  - Reject with tool error RESOURCE_EXHAUSTED if exceeds limit
- [ ] **Step 5**: Tool existence check:
  - If tool not found, return tool error NOT_FOUND
- [ ] **Step 6**: Acquire concurrency slot using **`tryAcquireSlot()` (non-blocking)**:
  - If returns null (no slot available), return tool error RESOURCE_EXHAUSTED
  - Increment ResourceExhausted counter on rejection
  - **Do NOT use blocking `acquireSlot()` - tools/call must reject-fast**
- [ ] **Step 7**: Schema validation using precompiled Ajv validator:
  - If invalid, return tool error INVALID_ARGUMENT with validation details
- [ ] **Step 8**: Execute handler with timeout and AbortSignal (see Task 5.6)
- [ ] **Step 9**: Release slot (always, in finally block)
- [ ] **Step 10**: Wrap result/error into MCP tools/call format

_Requirements: 3.1-3.6, 9.1-9.3_

**Acceptance Criteria:**

- Processing order matches design specification exactly
- Invalid params return JSON-RPC -32602 (not tool error)
- Unknown tool returns tool error NOT_FOUND with isError: true
- Schema validation failures return INVALID_ARGUMENT with Ajv error details
- Slot always released in finally block regardless of outcome
- runId and correlationId included in all tool error responses

### Task 5.6: Implement Timeout and Cooperative Cancellation

**File:** `src/mcp/handlers.ts` (continued)

- [ ] Create `AbortController` per invocation
- [ ] Pass `abortController.signal` to handler via `ToolContext.abortSignal`
- [ ] Start timeout timer using `config.tools.defaultTimeoutMs`
- [ ] On timeout:
  - Call `abortController.abort()`
  - Return tool error TIMEOUT immediately
  - **Do NOT release slot** - slot held until handler returns
- [ ] On handler completion (success or error):
  - Cancel timeout timer
  - Release slot in finally block
  - **Log thin completion record using ToolCompletionOutcome enum**: `{ runId, correlationId, toolName, durationMs, outcome: ToolCompletionOutcome, errorCode?, payloadBytes }`
  - **MUST NOT log**: full tool arguments, full tool results, agent state contents
  - **MUST sanitize/redact**: any logged string fields via sanitize(), any logged objects via redact()+sanitize()
- [ ] On late handler completion (after timeout returned):
  - Log completion record with `outcome: ToolCompletionOutcome.LateCompleted`
  - **MUST NOT emit MCP response**
  - Log at WARN level with runId, correlationId
- [ ] On disconnect-triggered completion:
  - If handler returns normally: `outcome: ToolCompletionOutcome.DisconnectedCompleted`
  - If handler throws due to abort: `outcome: ToolCompletionOutcome.Aborted`
  - If handler exceeds deadline after disconnect: `outcome: ToolCompletionOutcome.LateCompleted`

_Requirements: 3.5, 3.6, 5.4_

**Acceptance Criteria:**

- Timeout returns TIMEOUT error with abort signal fired
- Slot held until handler actually returns (not released on timeout)
- **Every tools/call invocation logs thin completion record using ToolCompletionOutcome enum**
- **Completion logs never include arguments/results**
- **Completion logs always include runId/correlationId/toolName/durationMs/outcome**
- **Late completion produces exactly one completion log record; no protocol response**
- **Disconnect and timeout outcomes mapped consistently per normative rules**
- AbortSignal.aborted === true after timeout fires

### Task 5.7: Implement Result Wrapping

**File:** `src/mcp/handlers.ts` (continued)

- [ ] Implement `wrapResult(result, ctx): ToolsCallResult`:
  - Attempt JSON.stringify on result
  - Return `{ content: [{ type: 'text', text: JSON }], isError: false }`
  - On serialization failure, return INTERNAL error with `{ reason: 'result_not_serializable' }`
- [ ] Implement `wrapToolError(error, ctx): ToolsCallResult`:
  - Enrich error with correlationId and runId from ctx
  - Return `{ content: [{ type: 'text', text: JSON }], isError: true }`
- [ ] For protocol/state errors (not tools/call): runId is absent, only correlationId present

_Requirements: 3.4, 6.2, 6.3_

**Acceptance Criteria:**

- Successful results wrapped as `{ content: [{ type: 'text', text }], isError: false }`
- Tool errors wrapped with `isError: true` and StructuredError JSON payload
- Non-serializable results return INTERNAL error with reason
- runId present in tool errors, absent in protocol/state errors
- correlationId always present in error responses

### Task 5.8: Implement Protocol Error Handlers

**File:** `src/mcp/handlers.ts` (continued)

- [ ] Implement parse error handler (-32700):
  - Return JSON-RPC error with `id: null`
  - Include `connectionCorrelationId` in `error.data.correlationId`
- [ ] Implement invalid request handler (-32600):
  - Return JSON-RPC error with `id: null` if id invalid/missing
- [ ] Implement method not found handler (-32601):
  - Return JSON-RPC error with request id
- [ ] Implement invalid params handler (-32602):
  - Return JSON-RPC error with request id

_Requirements: 6.1, 6.2, 6.4_

**Acceptance Criteria:**

- Parse errors return `id: null` with connectionCorrelationId in data
- Invalid request with bad/missing id returns `id: null`
- Method not found includes the unknown method name in message
- All protocol errors include correlationId (request-level or connection-level fallback)

### Task 5.9: Implement Connection Lifecycle Management

**File:** `src/mcp/handlers.ts` (continued)

- [ ] Implement connection close handling with explicit semantics:
  - **On transport disconnect, server MUST**:
    - Mark session CLOSED and stop writing responses for that connection
    - Abort all in-flight tool invocations by firing their AbortControllers
    - Continue running handlers until return (cooperative cancellation), holding slots until return
    - Emit normal completion log record for each invocation (even though client is gone)
    - Ensure no slot leaks: all slots eventually released when handlers exit
- [ ] Implement graceful shutdown:
  - Wait for in-flight tool calls to complete (with timeout)
  - Release all resource slots
  - Close transport cleanly

_Requirements: 1.4_

**Acceptance Criteria:**

- **Disconnect during tools/call does not crash server**
- **No stdout writes after disconnect**
- **AbortSignal fired for in-flight invocations on disconnect**
- **Slots eventually released; concurrentExecutions returns to prior level**
- **Completion record logged for each in-flight invocation**
- Session resources cleaned up on disconnection
- Graceful shutdown waits for completion with configurable timeout (server.shutdownTimeoutMs)

### Task 5.10: Implement Admin Tool Handlers

**File:** `src/mcp/adminHandlers.ts`

- [ ] Define `ToolType` as closed union: `'echo' | 'health' | 'agentProxy'`
- [ ] Implement `admin/registerTool` handler (definition-only registration):
  - Call `enforceAdminPolicy(config.tools.adminPolicy, transport)`
  - Require `toolType` field in registration payload
  - Reject unknown `toolType` with INVALID_ARGUMENT
  - Validate tool definition with canonical schema for toolType:
    - `toolType: 'agentProxy'` → fixed schema for agent message routing
    - `toolType: 'echo'` → fixed schema `{ message: string }`
    - `toolType: 'health'` → no arguments schema `{}`
  - Reject caller-supplied schema that deviates from canonical schema
  - Register tool definition with predefined handler mapping
  - Log at WARN level: "Dynamic tool registered: {toolName} (type: {toolType})"
  - Return success response
- [ ] Implement `admin/unregisterTool` handler:
  - Call `enforceAdminPolicy(config.tools.adminPolicy, transport)`
  - Call `toolRegistry.unregister(name)`
  - Log at WARN level: "Tool unregistered: {toolName}"
  - Return success/not-found response
- [ ] Implement `enforceAdminPolicy(policy, transport)`:
  - `deny_all`: throw UNAUTHORIZED
  - `local_stdio_only`: throw UNAUTHORIZED if transport.type !== 'stdio'
  - `token`: throw UNAUTHORIZED (not supported in v0.1)
- [ ] Register admin tools only when `isDynamicRegistrationEffective() === true`
- [ ] Exclude admin tools from `tools/list` when not enabled

_Requirements: 2.5-2.7, 10.2, 10.3_

**Acceptance Criteria:**

- **ToolType defined as closed union**: 'echo' | 'health' | 'agentProxy'
- **Unknown toolType rejected** with INVALID_ARGUMENT
- **toolType schema enforced**: server uses canonical schema; client schema must byte-match or rejected with INVALID_ARGUMENT
- **tools/list shows dynamic tool definitions deterministically**
- **tools/call for dynamic tool routes to mapped implementation**
- Security enforcement: admin policy correctly gates access based on transport type
- Dynamic registrations logged at WARN level with toolType information
- Admin tools hidden from `tools/list` when not enabled

---

## Phase 6: Agent Coordination

### Task 6.1: Implement Agent Coordinator

**File:** `src/agents/agentCoordinator.ts`

- [ ] Define `AgentMessage`, `AgentContext`, `AgentHandler` interfaces per design
- [ ] Implement `registerAgent(id, handler)` with duplicate prevention
- [ ] Implement `unregisterAgent(id): boolean`
- [ ] Implement `sendMessage(targetAgentId, message): Promise<AgentResponse>`:
  - If agent not registered, throw error (caller converts to NOT_FOUND if via tool)
  - Use per-agent FIFO queue for sequential processing
  - Different agents process concurrently
- [ ] Implement `getAgentState(agentId): Map<string, unknown> | undefined`
- [ ] Implement optional `onStateChange` callback hook

_Requirements: 7.1-7.6_

**Acceptance Criteria:**

- Agents register/unregister correctly with duplicate prevention
- Messages processed sequentially per agent (FIFO queue)
- Different agents process messages concurrently
- State accessible via `getAgentState()`
- Sending to unregistered agent throws error (not silent failure)
- In-memory state only (persistence is future scope)

### Task 6.2: Implement Agent Coordination Tools

**File:** `src/tools/agentTools.ts`

- [ ] Implement `agent/sendMessage` tool with payload limits:
  - Schema: `{ targetAgentId: string, message: { type: string, payload: unknown } }`
  - **Enforce same payload size limit as tools/call** (maxPayloadBytes using UTF-8 measurement)
  - Route to `agentCoordinator.sendMessage(targetAgentId, message)`
  - Return agent response or NOT_FOUND error if agent not registered
  - Reject oversized payload with RESOURCE_EXHAUSTED
- [ ] Implement `agent/list` tool with bounded response:
  - **Enforce max serialized response size** (same mechanism as result wrapping)
  - **Truncate deterministically** with `{ agentIds: string[], truncated: boolean }` if needed
  - Return list of registered agent IDs
- [ ] Implement `agent/getState` tool with size and redaction limits:
  - Schema: `{ agentId: string }`
  - **Enforce maximum response size** (tools.maxStateBytes with default)
  - **Return bounded state view**: either keys-only summary OR size-limited serialized state with truncation
  - **Redact sensitive keys**: MUST NOT return values for keys matching redactKeys unless explicitly allowed (return "[REDACTED]")
  - Return agent state or NOT_FOUND error
- [ ] Register tools at server startup (static, not dynamic)
- [ ] **General rule**: Any tool returning variable-size lists MUST enforce max serialized response size and truncate deterministically with truncated marker

_Requirements: 7.5_

**Acceptance Criteria:**

- Agent tools appear in `tools/list`
- `agent/sendMessage` routes correctly to AgentCoordinator
- **agent/sendMessage rejects oversized payload with RESOURCE_EXHAUSTED**
- `agent/list` returns registered agent IDs with bounded response size
- **agent/list truncates deterministically with truncated: true marker when needed**
- `agent/getState` returns agent state or NOT_FOUND
- **agent/getState bounded response size; never exceeds maxStateBytes**
- **agent/getState redacts sensitive keys in returned payload**
- **All agent tools enforce max serialized response size constraints**
- Tools integrate with resource limits, correlation propagation, error handling
- End-to-end correctness: serialization, timeouts, structured errors

---

## Phase 7: Health Tool

### Task 7.1: Implement Health Tool

**File:** `src/tools/healthTool.ts`

- [ ] Define `HealthResponse` interface per design
- [ ] Implement health tool handler returning:
  - `server`: { name, version } from config
  - `config`: { toolTimeoutMs, maxConcurrentExecutions, maxPayloadBytes, maxStateBytes }
  - `resources`: ResourceTelemetry from ResourceManager
  - `status`: health status from ResourceManager
- [ ] Register health tool at server startup (static, not dynamic)
- [ ] Tool name: `health`

_Requirements: 4.5, 9.4_

**Acceptance Criteria:**

- Health tool appears in `tools/list`
- Returns server name and version from config
- Returns config summary (timeout, concurrency, payload limits, state limits)
- Returns resource telemetry (memory, event loop delay, concurrent executions)
- Returns health status (healthy/degraded/unhealthy)
- Registered as static tool (always available)

---

## Phase 8: Testing

### Task 8.1: Implement Test Harness

**File:** `tests/helpers/testHarness.ts`

- [ ] Implement reusable MCP server test harness:
  - `startTestServer(config?: Partial<ServerConfig>): Promise<TestServerInstance>`
  - `TestServerInstance` with methods: `sendRequest()`, `close()`, `getLogs()`
  - Wire stdio streams for JSON-RPC communication
  - Capture stderr logs for assertion
  - Support deterministic mode with injected Clock/IdGenerator
- [ ] Implement helper functions:
  - `sendInitialize()`, `sendInitialized()`, `sendToolsList()`, `sendToolsCall()`
  - JSON-RPC request/response parsing and validation
- [ ] Export for use in all integration tests

_Requirements: 8.1_

**Acceptance Criteria:**

- Reusable harness reduces duplicated test code
- Supports deterministic testing with injectable dependencies
- Captures logs and responses for assertion
- Clean startup/shutdown lifecycle
- JSON-RPC protocol compliance validation

### Task 8.2: Unit Tests - Structured Logger

**File:** `src/logging/__tests__/structuredLogger.test.ts`

- [ ] Test log output format (JSON with timestamp, level, message)
- [ ] Test redaction correctness:
  - Case-insensitive key matching
  - Nested objects and arrays
  - All denylist keys (token, key, secret, password, apiKey, authorization, bearer, session, cookie)
- [ ] Test sanitization (control characters in all string fields)
- [ ] Test no mutation of original objects (copy-on-write)
- [ ] Test child logger context inheritance
- [ ] Test output goes to stderr, not stdout

_Requirements: 5.1-5.7, 10.1_

**Acceptance Criteria:**

- All StructuredLogger methods covered
- Redaction covers all denylist keys case-insensitively
- Sanitization escapes all control chars
- Original objects unchanged after logging

### Task 8.3: Unit Tests - Error Handler

**File:** `src/errors/__tests__/errorHandler.test.ts`

- [ ] Test all ErrorCode enum values
- [ ] Test `createError()` produces valid StructuredError
- [ ] Test `toJsonRpcError()` produces correct shape with id handling
- [ ] Test `toToolError()` produces correct MCP format
- [ ] Test JSON-RPC error code mapping

_Requirements: 6.1-6.6_

**Acceptance Criteria:**

- All error codes tested
- Helper functions produce correct output shapes
- id: null behavior tested for parse errors

### Task 8.4: Unit Tests - Configuration Manager

**File:** `src/config/__tests__/configManager.test.ts`

- [ ] Test env var precedence over config file
- [ ] Test config file precedence over defaults
- [ ] Test validation and fail-fast behavior with descriptive errors
- [ ] Test all default values
- [ ] Test `isDynamicRegistrationEffective()` logic:
  - true only when BOTH flags true
  - false when either flag false

_Requirements: 4.1-4.5_

**Acceptance Criteria:**

- All config scenarios covered
- Invalid configs fail with descriptive errors
- Effective dynamic registration computed correctly

### Task 8.5: Unit Tests - Tool Registry

**File:** `src/mcp/__tests__/toolRegistry.test.ts`

- [ ] Test registration, retrieval, ordering
- [ ] Test schema precompilation and caching
- [ ] Test object-root constraint enforcement
- [ ] Test duplicate name prevention
- [ ] Test dynamic registration security (allowArbitraryCodeTools)
- [ ] Test version field inclusion in list

_Requirements: 2.1-2.9, 3.2_

**Acceptance Criteria:**

- All ToolRegistry methods covered
- Edge cases tested (empty registry, max tools)
- Security flags enforced correctly

### Task 8.6: Unit Tests - Resource Manager

**File:** `src/resources/__tests__/resourceManager.test.ts`

- [ ] Test slot acquire/release counting
- [ ] Test limit enforcement (rejection when at max)
- [ ] Test payload size validation (UTF-8 byte length)
- [ ] Test telemetry values (heapUsed, event loop delay p99)
- [ ] Test health threshold calculations
- [ ] Test ResourceExhausted counter increment/reset logic

_Requirements: 9.1-9.5_

**Acceptance Criteria:**

- Concurrency limits enforced correctly
- Payload limits enforced using UTF-8 byte length
- Health status calculated correctly per thresholds
- Counter increments on rejection, resets on completion

### Task 8.7: Unit Tests - Timeout Contract

**File:** `src/mcp/__tests__/timeout.test.ts`

- [ ] Test abort signal fired on timeout
- [ ] Test slot NOT released until handler completion
- [ ] Test late completion handling (logged, not returned)
- [ ] Test AbortSignal.aborted === true after timeout
- [ ] Test cooperative cancellation semantics documented

_Requirements: 3.5, 3.6_

**Acceptance Criteria:**

- AbortSignal.abort() called on timeout
- Slot held until handler returns (even after timeout)
- Late completions logged at WARN, no duplicate response
- **Test documents: timeout cancellation is cooperative; handler may continue running**

### Task 8.8: Unit Tests - Agent Coordinator

**File:** `src/agents/__tests__/agentCoordinator.test.ts`

- [ ] Test agent registration/unregistration
- [ ] Test per-agent sequential queue (FIFO ordering)
- [ ] Test concurrent processing across different agents
- [ ] Test state access and modification
- [ ] Test sending to unregistered agent throws error

_Requirements: 7.1-7.6_

**Acceptance Criteria:**

- Sequential processing per agent verified
- Concurrent processing across agents verified
- Error on unregistered agent target

### Task 8.9: Integration Tests - Protocol Lifecycle

**File:** `tests/integration/lifecycle.test.ts`

- [ ] Test STARTING → INITIALIZING → RUNNING transitions
- [ ] Test methods blocked before RUNNING return -32002
- [ ] Test initialize/initialized sequence
- [ ] Test state error includes correlationId (connectionCorrelationId)

_Requirements: 1.2, 1.3, 8.2_

**Acceptance Criteria:**

- State machine enforced correctly
- NotInitialized errors returned with correct shape
- correlationId present in state errors

### Task 8.10: Integration Tests - tools/list and tools/call

**File:** `tests/integration/tools.test.ts`

- [ ] Test tools/list returns registered tools in order
- [ ] Test tools/call with valid arguments succeeds
- [ ] Test tools/call with invalid arguments returns INVALID_ARGUMENT
- [ ] Test tools/call with unknown tool returns NOT_FOUND
- [ ] Test tools/call with handler exception returns INTERNAL
- [ ] Test tools/call with timeout returns TIMEOUT

_Requirements: 2.3, 3.1-3.6, 8.2, 8.3_

**Acceptance Criteria:**

- All scenarios return correct response types
- Error codes match design specification
- runId and correlationId present in responses

### Task 8.11: Integration Tests - Protocol Errors

**File:** `tests/integration/protocol-errors.test.ts`

- [ ] Test parse error (-32700) returns `id: null`
- [ ] Test parse error includes `connectionCorrelationId` in `error.data.correlationId`
- [ ] Test invalid request (-32600) with bad id returns `id: null`
- [ ] Test method not found (-32601) includes method name
- [ ] Test invalid params (-32602) for tools/call shape violations

_Requirements: 6.1, 6.2, 8.3_

**Acceptance Criteria:**

- JSON-RPC error codes correct per spec
- id handling per JSON-RPC spec (null when not derivable)
- **Parse error correlation fallback uses connectionCorrelationId**

### Task 8.12: Integration Tests - Resource Exhaustion

**File:** `tests/integration/resources.test.ts`

- [ ] Test concurrency limit exceeded returns RESOURCE_EXHAUSTED
- [ ] Test payload size exceeded returns RESOURCE_EXHAUSTED
- [ ] Test health status transitions (healthy → degraded → unhealthy)
- [ ] Test ResourceExhausted counter behavior (increment on rejection, reset on completion)

_Requirements: 9.1-9.5, 8.3_

**Acceptance Criteria:**

- ResourceExhausted errors returned correctly
- Health status reflects resource state
- Counter behavior matches specification

### Task 8.13: Performance Tests

**File:** `tests/performance/latency.test.ts`

- [ ] Implement no-op tool for latency measurement
- [ ] Test p50/p95 latency for tool invocation
- [ ] Test throughput under concurrent load (up to maxConcurrentExecutions)
- [ ] Test memory usage under sustained operation
- [ ] Configure SLA targets: p95 < 50ms for no-op tool

_Requirements: 8.6, 8.7_

**Acceptance Criteria:**

- Performance metrics reported (p50, p95 latency)
- SLA targets configurable via test config
- Tests runnable in CI with consistent results

### Task 8.14: Property-Based Tests

**File:** `tests/property/`

Implement property tests for all 10 correctness properties (min 100 iterations each):

- [ ] **Property 1**: Initialization Response Completeness
  - `initialize` result includes configured server name/version/capabilities
- [ ] **Property 2**: Strict Initialization Gate
  - Before RUNNING, only `initialize`/`initialized` allowed; others return JSON-RPC -32002 with correlationId
- [ ] **Property 3**: Protocol Error Correlation
  - All protocol errors include request correlationId if derivable, else connectionCorrelationId
- [ ] **Property 4**: Tools/List Ordering
  - `tools/list` returns all tools sorted lexicographically by name
- [ ] **Property 5**: Validator Precompilation
  - `tools/call` uses only precompiled validators; no runtime schema compilation
- [ ] **Property 6**: Arguments Shape Enforcement
  - If `arguments` present and not an object, return JSON-RPC -32602; handler not executed
- [ ] **Property 7**: Concurrency Limit Enforcement
  - If concurrent invocations exceed max, reject with RESOURCE_EXHAUSTED
- [ ] **Property 8**: Timeout Enforcement with Cooperative Cancellation
  - Return TIMEOUT, abort signal fired, slot held until handler completes/cancels
- [ ] **Property 9**: Log Redaction and Sanitization
  - Redact configured keys and escape control chars without mutating runtime objects
- [ ] **Property 10**: Agent Serialism
  - Per agent, messages process sequentially; state remains consistent

_Requirements: 8.1-8.7_

**Acceptance Criteria:**

- All 10 correctness properties have dedicated property tests
- Each test runs minimum 100 iterations
- Tests use injectable Clock and IdGenerator for determinism
- Tests include malformed JSON-RPC shapes and pathological payload sizes
- Tests tagged with property number for traceability

---

## Phase 9: Documentation

### Task 9.1: API Documentation

- [ ] Add TSDoc comments to all public interfaces
- [ ] Document error codes and their meanings
- [ ] Document configuration options with defaults
- [ ] Document ToolContext and AbortSignal usage for tool authors

_Requirements: N/A (developer experience)_

**Acceptance Criteria:**

- All public APIs documented with TSDoc
- Examples included where helpful
- Error code reference complete

### Task 9.2: README and Usage Guide

- [ ] Create README.md with quick start
- [ ] Document configuration options (env vars, config file)
- [ ] Document tool registration API with example
- [ ] Include example tool implementation with AbortSignal handling
- [ ] **Add "Timeout Semantics" section explaining cooperative cancellation**:
  - Timeout means server stopped waiting, not that work stopped
  - Handlers should check AbortSignal and stop promptly
  - Late completions are logged but not returned

_Requirements: N/A (developer experience)_

**Acceptance Criteria:**

- New users can start server from README
- Tool authors have clear guidance on AbortSignal usage
- Timeout semantics clearly documented as sharp edge

---

## Phase 10: AACP Foundation (v0.2 Target)

**Note**: These tasks define interfaces and basic implementations for Agent-to-Agent Communication Protocol (AACP) to avoid architectural constraints in future iterations. The v0.1 implementation will be minimal (in-memory only) but architecturally sound.

### Task 10.1: Define AACP Core Interfaces

**File:** `src/aacp/types.ts`

- [ ] Define `AACPMessageType` type as `'REQUEST' | 'RESPONSE' | 'EVENT'`
- [ ] Define `AACPEnvelope` interface with messageId, requestId, sourceAgentId, targetAgentId, seq, ack, messageType, timestamp, payload
- [ ] Define `AACPOutcome` enum (COMPLETED, FAILED, UNKNOWN)
- [ ] Define `AACPMessageStatus` interface with messageId, requestId?, outcome, timestamp, error?, completionRef?
- [ ] Define `AACPRequestRecord` and `AACPMessageRecord` interfaces for ledger-first storage
- [ ] Define `AACPRetryPolicy` interface with maxAttempts, backoff strategy, error classification
- [ ] Export all types for use in v0.2 implementations

_Requirements: Future AACP support_

**Acceptance Criteria:**

- **AACPMessageType defined**: explicit type definition for message types
- **requestId stability rules**: requestId remains stable across retries for same logical request
- **messageId uniqueness rules**: messageId unique per transmission attempt, new messageId per retry allowed
- **dedup key definition**: deduplication keys on requestId for idempotent semantics
- **explicit error taxonomy**: clear distinction between timeout (UNKNOWN), failure (FAILED), and success (COMPLETED)
- **timeout semantics**: UNKNOWN state represents observability loss, not necessarily failure
- **cumulative ack semantics**: ack represents contiguous sequence prefix, gaps prevent advancement
- All AACP types support the 6 AACP invariants (uniqueness, stability, ordering, pairing, acknowledgment, deduplication)

### Task 10.2: Implement AACP Persistence Adapter Interface

**File:** `src/aacp/persistenceAdapter.ts`

- [ ] Define `AACPPersistenceAdapter` interface with ledger-first operations:
  - `putRequestRecord(requestId, record): Promise<void>`
  - `putMessageRecord(messageId, record): Promise<void>`
  - `getRequestRecord(requestId): Promise<AACPRequestRecord | null>`
  - `getMessageRecord(messageId): Promise<AACPMessageRecord | null>`
  - `markCompleted(requestId, outcome, completionRef?): Promise<void>`
  - `markFailed(requestId, error): Promise<void>`
  - Sequence tracking and recovery operations
  - **Retention operations**: `purgeExpired(now: Date): Promise<number>`
- [ ] Add TTL/retention fields to AACP records:
  - `expiresAt?: string` on AACPRequestRecord and AACPMessageRecord
- [ ] Implement `InMemoryAACPPersistenceAdapter` for v0.1:
  - Use Map<string, AACPRequestRecord> for request ledger
  - Use Map<string, AACPMessageRecord> for message ledger
  - Use Map<string, number> for sequence tracking (key: `${sourceAgentId}:${targetAgentId}`)
  - Store small payloads inline; completionRef reserved for v0.2
  - **Implement purgeExpired**: MUST delete records with expiresAt <= now and return deterministic count
- [ ] Add explicit durability disclaimer: "The in-memory AACPPersistenceAdapter provides best-effort tracking for a single process lifetime only and MUST NOT be considered durable across restarts"
- [ ] Document that v0.2 will add persistent storage for true durability

_Requirements: Future AACP support_

**Acceptance Criteria:**

- **Ledger-first design**: stores structured records, not raw outputs or blob storage
- **Small payload support**: payloads stored inline for v0.1 (completionRef for future large payloads)
- **Avoids size blow-ups**: no "store everything forever" approach
- **Clear retention policy**: structured records with explicit completion states
- **Interface contains purgeExpired and record expiry metadata**
- **In-memory implementation compiles and passes unit tests with purgeExpired returning deterministic count**
- **Durability disclaimer**: explicitly states non-durable nature of v0.1 in-memory implementation
- **Gap handling support**: interface supports sequence gap detection and cumulative ack logic
- Interface supports both transport acknowledgment (messageId) and semantic acknowledgment (requestId)

### Task 10.3: Define AACP Module Boundaries

**File:** `src/aacp/interfaces.ts`

- [ ] Define `AACPMessageType`: `export type AACPMessageType = 'REQUEST' | 'RESPONSE' | 'EVENT'`
- [ ] Define `AACPEncoder` interface:
  - `encode(envelope): string`
  - `decode(data): AACPEnvelope`
- [ ] Define `AACPSessionManager` interface (sequence tracking per source→target pair)
- [ ] Define `AACPLedger` interface (append, lookup, unacknowledged queries, status updates)
- [ ] Define `AACPRetransmitter` interface (retry scheduling + policy hooks)
- [ ] Add normative semantics comments:
  - `ack` is cumulative for highest contiguous seq received (specify whether it implies "committed" or "received")
  - Dedup keys on `requestId`; duplicate `requestId` must be idempotent

_Requirements: Future AACP support_

**Acceptance Criteria:**

- **AACP module boundaries defined** with no circular imports
- **AACPMessageType consistent** with the envelope definition
- **Ack and dedup semantics explicitly stated** (receipt vs commit chosen)
- **Retransmitter policy hooks** (shouldRetry, maxAttempts, backoff) defined even if stubbed
- **Dedup check ordering**: deduplication before execution documented
- Documentation explains the role of each component and processing order

### Task 10.4: Implement In-Memory AACP Ledger

**File:** `src/aacp/ledger.ts`

- [ ] Implement `AACPLedger` using `AACPPersistenceAdapter`
- [ ] Implement `append(envelope)`: writes message record keyed by messageId and request record keyed by requestId (if present)
- [ ] Implement `markCompleted/markFailed`: update request record outcome first, then message record
- [ ] Implement deduplication check:
  - If requestId exists and request record is COMPLETED, return cached completionRef/summary
  - If requestId exists and request record is IN_PROGRESS/UNKNOWN, treat as duplicate and do not execute
- [ ] Document that in-memory ledger is not durable across restart

_Requirements: Future AACP support_

**Acceptance Criteria:**

- **Dedup by requestId works deterministically** in unit tests
- **Completed outcomes queryable** by requestId after append/markCompleted
- **Ledger operations do not store unbounded payloads**; completionRef reserved for large results
- **Durability disclaimer**: explicitly states non-durable nature across restart
- **Idempotency guarantee**: duplicate requestId handling is deterministic

### Task 10.5: Implement AACP Session Manager (Sequence + Ack Tracking)

**File:** `src/aacp/sessionManager.ts`

- [ ] Implement per `(sourceAgentId, targetAgentId)` session state:
  - `nextSeq` incremented monotonically
  - `lastAck` tracked cumulatively
- [ ] Define ack semantics explicitly:
  - **Option 1 (receipt ack)**: ack means received in order up to N
  - **Option 2 (commit ack)**: ack means processed + recorded in ledger up to N
- [ ] Implement "highest contiguous seq" rule for advancing ack
- [ ] Persist nextSeq / last sequence via persistence adapter

_Requirements: Future AACP support_

**Acceptance Criteria:**

- **Sequence numbers monotonic** per pair
- **Ack cannot skip gaps** (highest contiguous seq rule enforced)
- **State survives within process lifetime** via adapter (durability across restart deferred)
- **Gap handling**: out-of-order messages handled correctly
- **Cumulative ack semantics**: clear definition of receipt vs commit chosen and implemented

### Task 10.6: Implement Retransmission Skeleton (No Background Loop Yet)

**File:** `src/aacp/retransmitter.ts`

- [ ] Implement `AACPRetryPolicy`:
  - Exponential backoff with jitter
  - Max attempts configuration
  - Retryable error classification (timeout ⇒ UNKNOWN ⇒ retryable)
- [ ] Implement `scheduleRetry(messageId, delayMs)` and `cancelRetry(messageId)`
- [ ] For v0.1: expose `processRetriesOnce()` (called manually in tests; no background worker)
- [ ] Document retry contract: reuse requestId, new messageId per attempt

_Requirements: Future AACP support_

**Acceptance Criteria:**

- **Backoff delay deterministic** under injected RNG in tests
- **UNKNOWN states retried**; FAILED not retried unless policy allows
- **No background timers required** in v0.1 (manual processRetriesOnce)
- **Retry policy configurable**: maxAttempts, backoff strategy, error classification
- **Jitter implementation**: prevents thundering herd on retry

### Task 10.7: Extend AgentCoordinator for v0.2 Compatibility (Non-breaking)

**File:** `src/agents/agentCoordinator.ts`

- [ ] Define `AgentCoordinatorV2` interface (additive):
  - `sendReliableMessage()`, `sendRequest()`
  - Optional hooks: `onMessageReceived/onMessageCompleted/onMessageFailed`
- [ ] Ensure existing `sendMessage()` remains unchanged
- [ ] Add JSDoc explaining migration path and backward compatibility

_Requirements: Future AACP support_

**Acceptance Criteria:**

- **TypeScript compilation passes** with existing AgentCoordinator users
- **v0.2 methods optional** and do not break v0.1 behavior
- **Extension is additive, not breaking**: existing methods remain intact
- **Clear migration documentation**: explains opt-in upgrade path

### Task 10.8: Create AACP Foundation Module

**File:** `src/aacp/index.ts`

- [ ] Export all AACP types and interfaces
- [ ] Export `InMemoryAACPPersistenceAdapter` as default v0.1 implementation
- [ ] Add module-level documentation explaining:
  - AACP purpose and benefits (reliability, resumability, ordering)
  - v0.1 limitations (in-memory only, no persistence across restarts)
  - v0.2 roadmap (persistent storage, distributed coordination)
  - Integration points with existing AgentCoordinator

_Requirements: Future AACP support_

**Acceptance Criteria:**

- Clean module exports for all AACP components
- Documentation explains current state and future roadmap
- Module can be imported without affecting v0.1 MCP server functionality
- Foundation ready for v0.2 implementation

---

## Dependencies

```
Phase 1 (Scaffolding) → Phase 2 (Core Infrastructure)
Phase 2 → Phase 3 (Tool Registry)
Phase 2 → Phase 4 (Resource Management)
Phase 2 → Phase 5.1 (Session Context)
Phase 3 + Phase 4 + Phase 5.1 → Phase 5.2-5.9 (Protocol Handlers)
Phase 2 → Phase 6 (Agent Coordination)
Phase 4 + Phase 5 → Phase 7 (Health Tool)
Phase 6 → Phase 10 (AACP Foundation) [v0.2 target, interfaces only]
Phase 1-7 → Phase 8 (Testing)
Phase 1-8 + Phase 10 → Phase 9 (Documentation)
```

---

## Estimated Effort

| Phase                        | Tasks  | Estimated Hours |
| ---------------------------- | ------ | --------------- |
| Phase 1: Scaffolding         | 4      | 5               |
| Phase 2: Core Infrastructure | 4      | 10              |
| Phase 3: Tool Registry       | 3      | 8               |
| Phase 4: Resource Management | 2      | 6               |
| Phase 5: Protocol Handlers   | 10     | 18              |
| Phase 6: Agent Coordination  | 2      | 4               |
| Phase 7: Health Tool         | 1      | 2               |
| Phase 8: Testing             | 18     | 25              |
| Phase 9: Documentation       | 2      | 4               |
| Phase 10: AACP Foundation    | 8      | 8               |
| **Total**                    | **52** | **91**          |

---

## Notes

- All log output MUST go to stderr (stdout reserved for MCP protocol)
- Timeout cancellation is cooperative; handlers may continue running after timeout
- Dynamic registration requires BOTH `adminRegistrationEnabled` AND `dynamicRegistrationEnabled`
- Property tests use fast-check library with minimum 100 iterations
- Event loop delay measured using `perf_hooks.monitorEventLoopDelay()` p99
- Memory usage measured using `process.memoryUsage().heapUsed`
- **AACP Foundation (Phase 10)**: Interfaces and basic implementations for v0.2 agent-to-agent communication
  - v0.1 includes only interface definitions and in-memory implementations
  - v0.2 will add persistent storage, distributed coordination, and full AACP protocol
  - Foundation prevents architectural constraints when scaling to multi-agent systems
- **Architectural Trade-offs**:
  - **Reject-fast concurrency**: `tryAcquireSlot()` prevents queue buildup but requires client retry logic
  - **Logger sanitization**: ALL string leaf values sanitized; may have performance overhead on large objects
  - **Event loop monitoring**: 10-second rolling window provides operational visibility but complicates deterministic testing
- **Durability Levels**:
  - v0.1 in-memory persistence: single process lifetime only, not durable across restarts
  - v0.2 persistent storage: true durability for resumable agent workflows across restarts/deployments
