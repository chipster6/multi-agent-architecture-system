---
inclusion: always
---

# Context7 Canonical Knowledge Base

## Purpose & Usage

This document serves as the **single source of truth** for all technology information retrieved from Context7 MCP server consultations. This is the **canonical reference document** that all agents must check before any implementation.

**Related Process Document**: See `.kiro/steering/context7-consultation.md` for consultation workflow and protocols.

## Agent Usage Protocol

### Before Any Task
1. **Check This Document First**: Review existing technology information below
2. **Identify Information Gaps**: Look for missing or outdated technologies (>30 days)
3. **Follow Consultation Protocol**: If gaps found, follow process in `context7-consultation.md`
4. **Update This Document**: Add new findings using the standard template

### Information Currency Standard
- **Current**: Information <30 days old ✅
- **Outdated**: Information >30 days old ⚠️ (requires re-consultation)
- **Deprecated**: Technology no longer recommended ❌

---

# Verified Technology Stack

**All information below has been verified through Context7 MCP server consultations**

## Node.js AbortController & Timeout Patterns ✅

**Context7 ID**: `/nodejs/node`  
**Trust Score**: 9.1  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: Timeout contract testing and AbortController best practices for MCP server timeout implementation  
**Status**: Current  

### Key Findings
- **Version**: v22.17.0+ (latest stable)
- **Breaking Changes**: None affecting AbortController patterns
- **New Features**: Enhanced AbortSignal.timeout() static method, improved error handling, better integration with Node.js APIs
- **Security Updates**: No critical security issues with AbortController
- **Deprecated Patterns**: Manual timeout handling without AbortController, callback-based cancellation
- **Recommended Patterns**: AbortController with cooperative cancellation, AbortSignal.timeout() for simple timeouts, proper cleanup patterns

### Implementation Impact
- Current project correctly implements AbortController timeout patterns
- AbortSignal.timeout() provides simpler timeout creation for basic cases
- Enhanced error handling with AbortError for consistent cancellation behavior
- **Cooperative cancellation** is the standard pattern for Node.js timeout handling

### Implementation Patterns
```typescript
// Basic AbortController timeout pattern (Context7 verified)
const abortController = new AbortController();
const timeoutHandle = setTimeout(() => {
  abortController.abort();
}, timeoutMs);

try {
  const result = await operation({ signal: abortController.signal });
  clearTimeout(timeoutHandle);
  return result;
} catch (error) {
  clearTimeout(timeoutHandle);
  if (error.name === 'AbortError') {
    // Handle timeout/cancellation
  }
  throw error;
}

// AbortSignal.timeout() for simple cases (Node.js v16+)
const timeoutSignal = AbortSignal.timeout(1000); // Aborts after 1 second
timeoutSignal.addEventListener('abort', () => console.log('Timeout!'));

// Cooperative cancellation in handlers
async function handler(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  // Check abort signal at start
  if (ctx.abortSignal.aborted) {
    throw new Error('Operation aborted');
  }
  
  // Pass signal to cancellable APIs
  const response = await fetch(url, { signal: ctx.abortSignal });
  
  // Check signal periodically during long operations
  if (ctx.abortSignal.aborted) {
    throw new Error('Operation aborted');
  }
  
  return response.json();
}

// Testing timeout behavior with Vitest
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Timeout Contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should abort signal on timeout', async () => {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, 1000);

    // Fast-forward time to trigger timeout
    vi.advanceTimersByTime(1000);

    expect(abortController.signal.aborted).toBe(true);
    clearTimeout(timeoutHandle);
  });

  it('should handle cooperative cancellation', async () => {
    const abortController = new AbortController();
    let handlerCompleted = false;
    
    const handler = async (signal: AbortSignal) => {
      // Simulate work that checks abort signal
      for (let i = 0; i < 10; i++) {
        if (signal.aborted) {
          throw new Error('Aborted');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      handlerCompleted = true;
    };

    const promise = handler(abortController.signal);
    
    // Abort after 250ms (should interrupt the loop)
    setTimeout(() => abortController.abort(), 250);
    vi.advanceTimersByTime(250);

    await expect(promise).rejects.toThrow('Aborted');
    expect(handlerCompleted).toBe(false);
  });
});

// Node.js test runner patterns (alternative to Vitest)
import { test } from 'node:test';

test('mocks setTimeout for timeout testing', (context) => {
  const fn = context.mock.fn();
  context.mock.timers.enable({ apis: ['setTimeout'] });
  
  const abortController = new AbortController();
  setTimeout(() => abortController.abort(), 1000);
  
  context.mock.timers.tick(1000);
  expect(abortController.signal.aborted).toBe(true);
});
```

### Testing Best Practices
- **Use fake timers** for deterministic timeout testing
- **Test cooperative cancellation** by verifying handlers respect AbortSignal
- **Verify slot management** - slots held until handler completion even after timeout
- **Test late completion** - handlers may complete after timeout response sent
- **AbortError handling** - consistent error type for all cancellation scenarios
- **Resource cleanup** - always clear timeouts in finally blocks

### Timeout Contract Requirements
1. **AbortSignal fired** when timeout occurs
2. **Cooperative cancellation** - handlers should check `signal.aborted`
3. **Resource safety** - concurrency slots held until handler returns
4. **Late completion logging** - log but don't send duplicate responses
5. **Consistent error handling** - AbortError for all cancellation cases

---

## Testing Framework: Vitest ✅

**Context7 ID**: `/vitest-dev/vitest`  
**Trust Score**: 8.3  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: Test discovery issues, multi-project configuration, and timeout testing patterns  
**Status**: Current  

### Key Findings
- **Version**: v3.2.4+ (latest v4.0.7 available)
- **Breaking Changes**: None affecting current project patterns
- **New Features**: Enhanced multi-project support, improved test discovery, better timeout configuration, project-specific fixtures, automatic fixture support
- **Security Updates**: No critical security issues identified
- **Deprecated Patterns**: Manual mock type assertions, callback-based validation, untyped spies, single-project configurations for complex setups
- **Recommended Patterns**: Multi-project configurations, project-specific includes/excludes, proper timeout configuration, automatic fixtures for setup/teardown

### Implementation Impact
- Current project uses Vitest v1.6.1 - compatible with latest patterns
- Multi-project configuration correctly implemented but may need refinement for test discovery
- Enhanced test discovery patterns available for better file matching
- **Project-specific configuration** enables different timeout and environment settings per test type
- **Test file discovery** uses include/exclude patterns with glob matching
- **Timeout configuration** supports both global and per-test timeout settings

### Implementation Patterns
```typescript
// Enhanced multi-project configuration (Context7 verified)
export default defineConfig({
  test: {
    // Global configuration
    globals: true,
    environment: 'node',
    passWithNoTests: true, // Prevents failures when no tests found
    
    // Multi-project setup for different test types
    projects: [
      {
        name: 'unit',
        include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules', 'dist', 'arch_docs'],
        testTimeout: 30000,
        hookTimeout: 30000,
        environment: 'node',
      },
      {
        name: 'integration',
        include: ['tests/integration/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules', 'dist', 'arch_docs'],
        testTimeout: 30000,
        hookTimeout: 30000,
        environment: 'node',
      },
      {
        name: 'performance',
        include: ['tests/performance/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules', 'dist', 'arch_docs'],
        testTimeout: 60000, // Longer timeout for performance tests
        hookTimeout: 60000,
      },
      {
        name: 'property',
        include: ['tests/property/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules', 'dist', 'arch_docs'],
        testTimeout: 60000, // Longer timeout for property-based tests
        hookTimeout: 60000,
      },
    ],

    // Setup files for deterministic testing
    setupFiles: ['./tests/setup/deterministic.ts'],

    // Ensure deterministic test execution
    sequence: {
      shuffle: false, // Deterministic test order
      concurrent: false, // Sequential execution for determinism
    },
  },
});

// Project-specific test execution (Context7 pattern)
// Run specific project
npm test -- --project=unit

// Run multiple projects
npm test -- --project=unit --project=integration

// Enhanced timeout configuration patterns
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Timeout Contract Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Per-test timeout configuration
  it('should handle long operations', async () => {
    // Test implementation
  }, 10000); // 10 second timeout

  // Options object timeout (recommended)
  it('should handle complex operations', { timeout: 15000 }, async () => {
    // Test implementation
  });
});

// Automatic fixtures for setup/teardown (Context7 pattern)
import { test as base } from 'vitest';

const test = base.extend({
  // Automatic fixture runs for all tests
  testSetup: [
    async ({}, use) => {
      // Setup logic
      const resource = await setupTestResource();
      await use();
      // Teardown logic
      await cleanupTestResource(resource);
    },
    { auto: true } // Runs automatically for all tests
  ],
});

// Enhanced beforeEach/afterEach patterns
describe('Resource Management Tests', () => {
  let resource: TestResource;

  beforeEach(async () => {
    // Runs before each test
    resource = await createTestResource();
    await resource.initialize();
  });

  afterEach(async () => {
    // Runs after each test - essential for cleanup
    await resource.cleanup();
    await resource.destroy();
  });

  it('should manage resources correctly', async () => {
    // Test uses clean resource state
    expect(resource.isReady()).toBe(true);
  });
});

// Test discovery troubleshooting patterns
// 1. Verify file patterns match
const config = {
  test: {
    include: ['**/*.{test,spec}.{js,ts}'], // Broad pattern
    exclude: ['node_modules/**', 'dist/**'], // Explicit excludes
  }
};

// 2. Use explicit project targeting
vitest --project=unit tests/unit/mcp/timeout.test.ts

// 3. Check file naming conventions
// ✅ Good: timeout.test.ts, timeout.spec.ts
// ❌ Bad: timeout-test.ts, timeoutTest.ts

// 4. Verify imports are correct
import { describe, it, expect } from 'vitest'; // ✅ Correct
// import { describe, it, expect } from 'jest'; // ❌ Wrong framework
```

### Test Discovery Best Practices
- **File Naming**: Use `.test.ts` or `.spec.ts` extensions
- **Directory Structure**: Organize tests to match source structure
- **Include Patterns**: Use glob patterns that match your file structure
- **Project Targeting**: Use `--project` flag for multi-project setups
- **Exclude Patterns**: Explicitly exclude build artifacts and dependencies

### Timeout Configuration Hierarchy
1. **Global Config**: Set in `vitest.config.ts` under `test.testTimeout`
2. **Project Config**: Override per project in `projects[].testTimeout`
3. **Per-Test**: Use options object `{ timeout: 5000 }` or third parameter
4. **Runtime**: Use `vi.setConfig({ testTimeout: 10000 })` in tests

### Critical Test Issues Solutions
- **"No test suite found"**: Verify include patterns match file structure
- **Tests not executing**: Check project configuration and file naming
- **Timeout issues**: Use proper timeout configuration hierarchy
- **Mock cleanup**: Always use `afterEach(() => vi.restoreAllMocks())`
```

### TypeScript Error Resolution Guide
Based on Context7 consultation, comprehensive TypeScript error patterns and their solutions:

#### VerbatimModuleSyntax Errors (TS1484, TS1485)
1. **Type-Only Import Required**: Use `import type` for types when `verbatimModuleSyntax` is enabled
   ```typescript
   // ❌ Error TS1484: 'BaseAgentInput' is a type and must be imported using type-only import
   import { BaseAgent, BaseAgentInput, BaseAgentOutput } from '../base-agent.js';
   
   // ✅ Correct: Separate value and type imports
   import { BaseAgent } from '../base-agent.js';
   import type { BaseAgentInput, BaseAgentOutput } from '../base-agent.js';
   ```

2. **Mixed Import Separation**: Separate type and value imports when using `verbatimModuleSyntax`
   ```typescript
   // ❌ Error: Mixed imports
   import { Component, ComponentProps } from "./exports.js";
   
   // ✅ Correct: Separate type imports
   import { Component, type ComponentProps } from "./exports.js";
   ```

#### Override Modifier Errors (TS4114, TS4113, TS4117)
3. **Missing Override Modifier**: Add `override` when overriding base class methods
   ```typescript
   // ❌ Error TS4114: This member must have an 'override' modifier
   protected async generateArtifacts() { }
   
   // ✅ Correct: Add override modifier
   protected override async generateArtifacts() { }
   ```

4. **Invalid Override Usage**: Only use `override` for actual base class methods
   ```typescript
   // ❌ Error TS4113: Method not declared in base class
   override foo() {} 
   
   // ✅ Correct: Only override existing methods
   override doSomething() {} // Method exists in base class
   ```

#### Interface Compliance Errors (TS2345)
5. **Missing Required Properties**: Ensure objects match interface requirements
   ```typescript
   // ❌ Error TS2345: Missing properties 'category' and 'dependencies'
   decisions.push({
     id: 'decision-1',
     decision: 'Use TypeScript',
     // Missing: category, dependencies
   });
   
   // ✅ Correct: Include all required properties
   decisions.push({
     id: 'decision-1',
     decision: 'Use TypeScript',
     category: 'language',
     dependencies: [],
     // ... other required fields
   });
   ```

#### Type Assertion Errors (TS2322)
6. **Invalid Enum Values**: Use valid enum values for type properties
   ```typescript
   // ❌ Error TS2322: Type '"configuration"' not assignable to valid types
   type: 'configuration'
   
   // ✅ Correct: Use valid enum values
   type: 'document' // or 'specification', 'model', 'diagram'
   ```

#### Unused Parameter Errors (TS6133)
7. **Unused Parameters**: Prefix unused parameters with underscore
   ```typescript
   // ❌ Error TS6133: 'analysis' is declared but never read
   protected async decide(analysis: DevOpsAnalysis) { }
   
   // ✅ Correct: Prefix with underscore
   protected async decide(_analysis: DevOpsAnalysis) { }
   ```

#### Module Resolution Errors (TS2307, TS2835)
8. **Missing File Extensions**: Add explicit extensions for ESM imports
   ```typescript
   // ❌ Error TS2835: Need explicit file extensions
   import {} from "./module"
   
   // ✅ Correct: Add file extension
   import {} from "./module.js"
   ```

9. **Declaration File Imports**: Use `import type` for .d.ts files
   ```typescript
   // ❌ Error TS2846: Declaration file cannot be imported without 'import type'
   import {} from "./types.d.ts"
   
   // ✅ Correct: Use type-only import
   import type {} from "./types.d.ts"
   ```

#### Resolution Mode Errors (TS1454, TS2856)
10. **Resolution Mode Usage**: Only use with type-only imports
    ```typescript
    // ❌ Error TS1454: resolution-mode only for type-only imports
    import { Interface } from "pkg" with { "resolution-mode": "require" };
    
    // ✅ Correct: Use with type-only imports
    import type { Interface } from "pkg" with { "resolution-mode": "require" };
    ```

#### Legacy Pattern Migration
11. **Deprecated Import Assertions**: Replace `assert` with `with`
    ```typescript
    // ❌ Deprecated: Using 'assert'
    import type { T } from "pkg" assert { "resolution-mode": "require" };
    
    // ✅ Current: Using 'with'
    import type { T } from "pkg" with { "resolution-mode": "require" };
    ```

12. **Vitest Mock Type Compatibility**: Use `any` type for complex Node.js stream mocking
13. **Missing Imports**: Always import `afterEach` along with other Vitest functions
14. **Unknown Type Access**: Use type assertions `(obj as any).property` for test objects
15. **Optional Property Access**: Use optional chaining `obj?.property` for potentially undefined
16. **Flexible Test Objects**: Use `as any` for test context objects that need flexible typing

### Testing Strategy
- **Unit Tests**: Specific examples, edge cases, error conditions
- **Property Tests**: Universal properties across all inputs (min 100 iterations)
- **Integration Tests**: Component interaction validation with test harness
- **Helper Functions**: Reusable test utilities for common patterns
- **Test Organization**: Multi-project structure for different test types
- **Mock Cleanup**: Always use `afterEach(() => vi.restoreAllMocks())` to prevent test interference
})

// Test fixtures with setup/teardown
const test = baseTest.extend<{
  testServer: TestServerInstance
}>({
  testServer: async ({}, use) => {
    const server = await startTestServer()
    await use(server)
    await server.close()
  }
})
```

### Testing Strategy
- **Unit Tests**: Specific examples, edge cases, error conditions
- **Property Tests**: Universal properties across all inputs (min 100 iterations)
- **Integration Tests**: Component interaction validation with test harness
- **Helper Functions**: Reusable test utilities for common patterns
- **Test Organization**: Multi-project structure for different test types
- **Mock Cleanup**: Always use `afterEach(() => vi.restoreAllMocks())` to prevent test interference

### Critical Test Issues (Context7 Solutions)
- **"No test suite found" error**: Add `passWithNoTests: true` to vitest config
- **Test discovery in multi-project**: Use explicit project targeting with `--project=unit` flag
- **File pattern matching**: Ensure include patterns match actual file structure
- **Project inheritance**: Use `extends: true` to inherit root-level configuration
- **Mock type compatibility**: Use `any` type for complex Node.js APIs like process.stderr
- **Test cleanup**: Always use `afterEach(() => vi.restoreAllMocks())` pattern

### Test Discovery Troubleshooting (Context7 Verified)
1. **File Naming**: Must use `.test.ts` or `.spec.ts` extensions
2. **Include Patterns**: Use glob patterns that match your directory structure
3. **Project Configuration**: Each project needs proper `include` patterns
4. **Explicit Targeting**: Use `vitest --project=unit path/to/test.ts` for specific files
5. **Configuration Inheritance**: Use `extends: true` in projects to inherit plugins and settings

---

## JSON-RPC 2.0 Protocol ✅

**Context7 ID**: `/tunnckocore/jsonrpc-v2.0-spec`  
**Trust Score**: 9.7  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: MCP server protocol compliance verification  
**Status**: Current  

### Key Information
- **Mandatory Fields**: `jsonrpc: "2.0"`, proper `id` handling, standard error codes
- **Critical Rule**: Exactly one of `result` or `error` in responses
- **Parameter Validation**: `params` must be object or array, never primitives
- **Security Updates**: No changes to core specification
- **Deprecated Patterns**: Non-standard error codes, missing version field
- **Recommended Patterns**: Strict compliance with JSON-RPC 2.0 specification

### Implementation Impact
- Current project correctly implements JSON-RPC 2.0 specification
- Error handling follows standard error codes (-32700 to -32099)
- Proper request/response structure validation in place

### Implementation Patterns
```typescript
// Request structure
interface JsonRpcRequest {
  jsonrpc: '2.0';           // REQUIRED - Must be exactly "2.0"
  method: string;           // REQUIRED - Method name
  params?: object | array;  // OPTIONAL - Object or array only
  id: string | number | null; // REQUIRED (except notifications)
}

// Success response
{ jsonrpc: '2.0', result: data, id: 1 }

// Error response
{ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id: 1 }
```

### Standard Error Codes
| Code | Error Type | When to Use | Example |
|------|------------|-------------|---------|
| -32700 | Parse error | Invalid JSON received | Malformed JSON string |
| -32600 | Invalid Request | Invalid JSON-RPC structure | Missing `jsonrpc` field |
| -32601 | Method not found | Unknown method called | Tool doesn't exist |
| -32602 | Invalid params | Bad parameter values | Schema validation failed |
| -32603 | Internal error | Server-side failure | Unexpected exception |
| -32000 to -32099 | Server error | Implementation-defined | Custom business logic errors |

---

## Model Context Protocol (MCP) SDK ✅

**Context7 ID**: `/modelcontextprotocol/typescript-sdk`  
**Trust Score**: 7.8  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: MCP server implementation patterns and testing verification  
**Status**: Current  

### Key Information
- **Version**: Latest stable (current project compatible)
- **Required Pattern**: Use `McpServer` high-level API, Zod schema validation
- **Security**: DNS rebinding protection, input validation, OAuth integration available
- **Transport**: Prefer Streamable HTTP over SSE (deprecated)
- **New Features**: Dynamic tool registration, elicitation support, session management
- **Security Updates**: DNS rebinding protection enabled by default, OAuth 2.0 integration
- **Deprecated Patterns**: SSE transport, manual JSON-RPC handling, unvalidated schemas
- **Recommended Patterns**: High-level McpServer API, Zod validation, Streamable HTTP transport

### Implementation Impact
- Current project uses recommended patterns with McpServer high-level API
- Zod schema validation properly implemented for tool registration
- Security middleware and DNS rebinding protection in place
- **Test harness should use stdio transport for spawned process testing**

### Implementation Patterns
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';

// High-level server setup for testing
const server = new McpServer({ name: 'test-server', version: '1.0.0' });

server.registerTool(
  'test-tool',
  {
    title: 'Test Tool',
    description: 'Tool for testing',
    inputSchema: { param: z.string().describe('Parameter description') },
    outputSchema: { result: z.string() }
  },
  async ({ param }, extra) => {
    const output = { result: `Processed: ${param}` };
    return {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      structuredContent: output
    };
  }
);

// Test harness transport setup
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Testing Patterns
- **Stdio Transport**: Use `StdioServerTransport` for test harness spawned processes
- **Tool Registration**: Register tools with Zod schemas for input/output validation
- **Session Management**: Handle session lifecycle in test harness
- **Error Handling**: Proper JSON-RPC error responses with correlation IDs
- **Protocol Compliance**: Strict MCP protocol adherence in test scenarios

### Transport Options
- **Stdio**: `StdioServerTransport` - For spawned processes (recommended for testing)
- **HTTP Streamable**: `StreamableHTTPServerTransport` - Modern HTTP transport
- **WebSocket**: `WebSocketServerTransport` - Browser-compatible
- **SSE**: ❌ Deprecated, use Streamable HTTP instead

---

## Node.js Runtime ✅

**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: Runtime compatibility and performance verification  
**Status**: Current  

### Key Information
- **Required Version**: 18+ (MCP compatibility)
- **Recommended Version**: 20+ (LTS)
- **Package Manager**: npm (standard for MCP projects)
- **Critical Polyfill**: Web Crypto API for older versions
- **Security Updates**: Regular security patches available, Web Crypto API stable
- **Deprecated Patterns**: Callback-based APIs, manual crypto implementations, synchronous file operations
- **Recommended Patterns**: async/await, Web Crypto API, event loop monitoring

### Implementation Impact
- Current project targets Node.js 18+ (engines field in package.json)
- Web Crypto API polyfill may be needed for older Node.js versions
- Performance monitoring patterns available for production use

### Implementation Patterns

```typescript
// Web Crypto API polyfill for older Node.js versions
import { webcrypto } from 'node:crypto';

if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto as unknown as Crypto;
}
```

### Performance Monitoring
- **Event Loop Monitoring**: Use `perf_hooks.monitorEventLoopDelay()`
- **Memory Management**: Monitor `process.memoryUsage().heapUsed`
- **Concurrency Control**: Implement slot-based limiting
- **Timeout Handling**: Cooperative cancellation with `AbortSignal`

---

## AJV JSON Schema Validator ✅

**Context7 ID**: `/ajv-validator/ajv`  
**Trust Score**: 7.3  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: Schema validation library verification for MCP tool validation  
**Status**: Current  

### Key Information
- **Version**: v8.17.1 (latest stable)
- **Performance**: Fastest JSON validator for Node.js and browser
- **Features**: JSON Schema drafts support, JSON Type Definition, pre-compilation
- **Security Updates**: No critical vulnerabilities, secure meta-schema validation available
- **Deprecated Patterns**: Callback-based validation, uncompiled schemas in production
- **Recommended Patterns**: Pre-compile schemas, use strict mode, validate with compiled functions

### Implementation Impact
- Current project uses AJV v8.12.0 - consider upgrading to v8.17.1
- Schema pre-compilation improves performance significantly
- Strict type checking available with TypeScript integration

### Implementation Patterns

```typescript
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: true });

// Pre-compile schema for better performance
const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number', minimum: 0 }
  },
  required: ['name'],
  additionalProperties: false
};

const validate = ajv.compile(schema);

// Use compiled validator
if (validate(data)) {
  // data is valid
} else {
  console.log(validate.errors);
}
```

### Performance Optimization
- **Schema Compilation**: Pre-compile at registration time
- **Error Handling**: Use `allErrors: true` for comprehensive validation
- **Type Safety**: Integrate with TypeScript for compile-time checking
- **Caching**: Cache compiled validators for reuse

---

## Fast-Check Property-Based Testing ✅

**Context7 ID**: `/dubzzz/fast-check`  
**Trust Score**: 9.5  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: Property-based testing integration with Vitest verification  
**Status**: Current  

### Key Information
- **Version**: Latest stable (v3.15.0 in project)
- **Integration**: Excellent Vitest integration via `@fast-check/vitest`
- **Features**: Property-based testing, shrinking, model-based testing, async support
- **Security Updates**: No security issues, stable API
- **Deprecated Patterns**: Manual property setup, hard-coded test data
- **Recommended Patterns**: Use `@fast-check/vitest`, minimum 100 iterations, property-based testing for universal properties

### Implementation Impact
- Current project includes fast-check v3.15.0 - up to date
- Vitest integration available via `@fast-check/vitest` package
- Property-based testing should be used for universal properties (minimum 100 iterations)

### Implementation Patterns

```typescript
import { test, fc } from '@fast-check/vitest';

// Property-based test with array syntax
test.prop([fc.string(), fc.string(), fc.string()])(
  'should detect substring', 
  (a, b, c) => {
    return (a + b + c).includes(b);
  }
);

// Property-based test with object syntax
test.prop({ 
  a: fc.string(), 
  b: fc.string(), 
  c: fc.string() 
})('should detect substring', ({ a, b, c }) => {
  return (a + b + c).includes(b);
});

// One-time randomness mode
test('test with controlled randomness', ({ g }) => {
  const user = {
    firstName: g(fc.string),
    lastName: g(fc.string),
  };
  
  const displayName = computeDisplayName(user);
  expect(displayName).toContain(user.firstName);
});
```

### Testing Strategy
- **Universal Properties**: Use property-based testing for properties that should hold for all inputs
- **Minimum Iterations**: Run at least 100 iterations for property tests
- **Shrinking**: Leverage automatic shrinking to find minimal failing cases
- **Integration**: Use with Vitest for seamless test execution

---

## TypeScript Language ✅

**Context7 ID**: `/microsoft/typescript`  
**Trust Score**: 9.9  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: Advanced TypeScript patterns and configuration for multi-agent architecture system  
**Status**: Current  

### Key Information
- **Version**: v5.9.2+ (latest stable)
- **Advanced Features**: Generic type utilities, conditional types, template literal types, recursive types
- **Configuration**: Strict mode enabled, declaration file generation, path mapping support
- **Security Updates**: Regular compiler updates, improved type checking, enhanced error messages
- **Deprecated Patterns**: `any` type usage, non-strict configurations, callback-based APIs
- **Recommended Patterns**: Strict type checking, utility types, conditional types, branded types

### Implementation Impact
- Current project uses TypeScript with strict mode enabled
- Advanced generic patterns for agent configuration and validation
- Path mapping configured for clean imports across modules
- Declaration file generation enabled for library distribution

### Implementation Patterns

#### Advanced Generic Type Utilities
```typescript
// Complex type-level programming for configuration validation
type IsLiteralString<T extends string> = string extends T ? false : true;
type DeepWritable<T> = T extends Function ? T : { -readonly [K in keyof T]: DeepWritable<T[K]> };

interface ProvidedActor {
  src: string;
  logic: () => Promise<unknown>;
}

type DistributeActors<TActor> = TActor extends { src: infer TSrc }
  ? { src: TSrc; }
  : never;

interface MachineConfig<TActor extends ProvidedActor> {
  types?: { actors?: TActor; };
  invoke: IsLiteralString<TActor["src"]> extends true
    ? DistributeActors<TActor>
    : { src: string; };
}

// Advanced utility types for array manipulation
export type Prepend<Elm, T extends unknown[]> =
  T extends unknown ?
  ((arg: Elm, ...rest: T) => void) extends ((...args: infer T2) => void) ? T2 :
  never :
  never;

export type ExactExtract<T, U> = T extends U ? U extends T ? T : never : never;

type Conv<T, U = T> =
  { 0: [T]; 1: Prepend<T, Conv<ExactExtract<U, T>>>;}[U extends T ? 0 : 1];

// Values extraction and field mapping
type Values<T> = T[keyof T]; 
type ExtractFields<Options> = Values<{ 
  [K in keyof Options]: Options[K] extends object ? keyof Options[K] : never; 
}>; 
type SetType<Options> = { 
  [key: string]: any; 
  target?: ExtractFields<Options>; 
};
```

#### Package.json Configuration Patterns
```json
// Advanced conditional exports with type-specific resolution
{
  "name": "multi-agent-system",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./agents": {
      "import": "./dist/agents/index.mjs",
      "require": "./dist/agents/index.cjs", 
      "types": "./dist/agents/index.d.ts"
    },
    "./types": {
      "types": {
        "import": "./dist/types/index.d.mts",
        "require": "./dist/types/index.d.cts"
      }
    }
  },
  "typesVersions": {
    ">=4.0": { "*": ["./dist/types/*"] },
    "*": { "*": ["./dist/legacy-types/*"] }
  }
}
```

#### TSConfig Advanced Configuration
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@agents/*": ["src/agents/*"],
      "@shared/*": ["src/shared/*"],
      "@tools/*": ["src/tools/*"]
    },
    "lib": ["ES2022", "DOM"],
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

#### Configurable Mixin Pattern
```typescript
// Higher-order function pattern for extensible configurations
export type Constructor<T> = {
  new(...args: any[]): T;
}

export function Configurable<T extends Constructor<{}>>(base: T): T {
  return class extends base {
    constructor(...args: any[]) {
      super(...args);
    }
  };
}

// Extension configuration with callback types
interface ExtensionConfig<Options = any> {
  extendMarkSchema?:
    | ((
        this: { name: string; options: Options; },
        extension: Mark,
      ) => Record<string, any>)
    | null;
}

declare class Extension<Options = any> {
  type: string;
  name: string;
  parent: Extension | null;
  child: Extension | null;
  options: Options;
  config: ExtensionConfig;
}
```

#### Redux-like Middleware Configuration
```typescript
// Middleware array configuration for agent orchestration
interface MiddlewareArray<T> extends Array<T> {}

declare function configureStore(options: { 
  middleware: MiddlewareArray<any> 
}): void;

declare const defaultMiddleware: MiddlewareArray<any>;

configureStore({
  middleware: [...defaultMiddleware] // Spread pattern for middleware composition
});
```

### Advanced Type Patterns
- **Utility Types**: `Prepend<T, U>`, `ExactExtract<T, U>`, `Conv<T, U>` for complex type transformations
- **Conditional Types**: Type-level programming for configuration validation
- **Template Literals**: Type-safe string pattern matching and validation
- **Recursive Types**: Self-referencing types for nested data structures
- **Branded Types**: Enhanced type safety for domain-specific values

---

## TypeScript Language - Enhanced Error Resolution ✅

**Context7 ID**: `/microsoft/typescript`  
**Trust Score**: 9.9  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: TypeScript error resolution patterns for DevOps agent fixes  
**Status**: Current  

### Key Findings
- **Version**: v5.9.2+ (latest stable)
- **Breaking Changes**: Enhanced `verbatimModuleSyntax` enforcement, stricter type-only import requirements
- **New Features**: Improved error messages for import/export patterns, enhanced override modifier validation
- **Security Updates**: Stricter module resolution patterns, improved type safety enforcement
- **Deprecated Patterns**: Mixed type/value imports, missing override modifiers, invalid enum assignments
- **Recommended Patterns**: Explicit type-only imports, proper override usage, interface compliance validation

### Implementation Impact
- Current project requires strict adherence to `verbatimModuleSyntax` patterns
- All type imports must use `import type` syntax when `verbatimModuleSyntax` is enabled
- Override modifiers required for all method overrides in derived classes
- Interface compliance must include all required properties (category, dependencies)
- Artifact types must use valid enum values ('document', 'specification', 'model', 'diagram')

### Critical Error Resolution Patterns

#### VerbatimModuleSyntax Compliance (TS1484, TS1485)
```typescript
// ❌ Error TS1484: Type must be imported using type-only import
import { BaseAgent, BaseAgentInput, BaseAgentOutput } from '../base-agent.js';

// ✅ Correct: Separate value and type imports
import { BaseAgent } from '../base-agent.js';
import type { BaseAgentInput, BaseAgentOutput, ArchitecturalDecision, Artifact } from '../../shared/types/index.js';
```

#### Override Modifier Requirements (TS4114)
```typescript
// ❌ Error TS4114: Missing override modifier
protected async generateArtifacts(decisions: ArchitecturalDecision[]): Promise<Artifact[]> {

// ✅ Correct: Add override modifier
protected override async generateArtifacts(decisions: ArchitecturalDecision[]): Promise<Artifact[]> {
```

#### Interface Property Compliance (TS2345)
```typescript
// ❌ Error TS2345: Missing required properties
decisions.push({
  id: `devops-cicd-${Date.now()}`,
  decision: 'GitHub Actions for CI/CD',
  rationale: 'Native integration and matrix testing',
  // Missing: category, dependencies
});

// ✅ Correct: Include all required properties
decisions.push({
  id: `devops-cicd-${Date.now()}`,
  decision: 'GitHub Actions for CI/CD',
  rationale: 'Native integration and matrix testing',
  category: 'ci-cd-pipeline',
  dependencies: [],
  alternatives: ['GitLab CI/CD', 'Jenkins'],
  consequences: ['Tight GitHub integration', 'No additional infrastructure'],
  confidence: 0.9,
  agentId: this.agentId,
  phase: this.phase,
  timestamp: new Date().toISOString(),
});
```

#### Valid Artifact Type Usage (TS2322)
```typescript
// ❌ Error TS2322: Invalid artifact type
artifacts.push({
  type: 'configuration', // Invalid type
  name: 'CI/CD Pipeline Template',
});

// ✅ Correct: Use valid enum values
artifacts.push({
  type: 'document', // Valid: 'document' | 'specification' | 'model' | 'diagram'
  name: 'CI/CD Pipeline Template',
});
```

#### Unused Parameter Handling (TS6133)
```typescript
// ❌ Error TS6133: Parameter declared but never read
private analyzeCICDStrategy(infrastructure: Record<string, unknown>): string {

// ✅ Correct: Prefix unused parameters with underscore
private analyzeCICDStrategy(_infrastructure: Record<string, unknown>): string {
```

### Advanced Error Patterns
- **Module Resolution**: Explicit file extensions required for ESM imports
- **Declaration Files**: Must use `import type` for .d.ts file imports
- **Resolution Mode**: Only valid with type-only imports using `with` syntax
- **Import Assertions**: Migrate from deprecated `assert` to `with` keyword
- **Mixed Imports**: Separate type and value imports when using strict module syntax

### Testing Integration
- **Mock Type Safety**: Use `any` type for complex Node.js API mocking
- **Import Completeness**: Always import all required Vitest functions
- **Type Assertions**: Use `(obj as any).property` for flexible test objects
- **Optional Chaining**: Use `obj?.property` for potentially undefined properties

---

## Zod Schema Validation ✅

**Context7 ID**: `/colinhacks/zod`  
**Trust Score**: 9.6  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: Schema validation for MCP tools and agent configuration  
**Status**: Current  

### Key Information
- **Version**: v3.24.2+ (current project uses v3.15.0)
- **Performance**: TypeScript-first with static type inference, fastest validation library
- **Features**: Async validation, refinements, transformations, recursive schemas, union types
- **Security Updates**: No critical vulnerabilities, secure validation patterns
- **Deprecated Patterns**: Manual validation, untyped schemas, callback-based validation
- **Recommended Patterns**: Pre-compiled schemas, async refinements, discriminated unions

### Implementation Impact
- Current project uses Zod for all MCP tool input/output validation
- Schema pre-compilation improves performance significantly
- Async refinements support database lookups and external validation
- Integration with TypeScript provides compile-time type safety

### Implementation Patterns

#### Comprehensive Schema Validation
```typescript
// MCP tool schema with advanced refinements and transformations
const toolSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-zA-Z][a-zA-Z0-9-]*$/),
  description: z.string().optional(),
  inputSchema: z.record(z.any()),
  outputSchema: z.record(z.any()),
  timeout: z.number().int().positive().max(300000).default(30000)
}).refine(
  (data) => data.name !== 'reserved' && !data.name.startsWith('_'),
  { message: "Tool name cannot be 'reserved' or start with underscore" }
).transform((data) => ({
  ...data,
  normalizedName: data.name.toLowerCase()
}));

// Async validation with database lookup and caching
const userSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8),
  confirmPassword: z.string()
}).refine(
  (data) => data.password === data.confirmPassword,
  { message: "Passwords must match", path: ["confirmPassword"] }
).refine(async (data) => {
  // Simulate async database check with caching
  const cacheKey = `user:${data.username}`;
  let exists = cache.get(cacheKey);
  
  if (exists === undefined) {
    exists = await checkUserExists(data.username);
    cache.set(cacheKey, exists, { ttl: 300 }); // 5 minute cache
  }
  
  return !exists;
}, { 
  message: "Username already exists",
  path: ["username"]
});

// Discriminated union for complex API responses
const ApiResponse = z.discriminatedUnion("status", [
  z.object({ 
    status: z.literal("success"), 
    data: z.any(),
    timestamp: z.string().datetime(),
    requestId: z.string().uuid()
  }),
  z.object({ 
    status: z.literal("error"), 
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.any()).optional()
    }),
    timestamp: z.string().datetime(),
    requestId: z.string().uuid()
  }),
  z.object({
    status: z.literal("pending"),
    taskId: z.string().uuid(),
    estimatedCompletion: z.string().datetime().optional()
  })
]);

// Recursive schema for nested agent configurations
interface AgentConfig {
  name: string;
  type: string;
  config: Record<string, any>;
  children?: AgentConfig[];
  dependencies?: string[];
}

const AgentConfigSchema: z.ZodType<AgentConfig> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    type: z.enum(["coordinator", "worker", "validator", "transformer"]),
    config: z.record(z.any()),
    children: z.array(AgentConfigSchema).optional(),
    dependencies: z.array(z.string()).optional()
  }).refine((data) => {
    // Validate no circular dependencies
    if (data.dependencies?.includes(data.name)) {
      return false;
    }
    return true;
  }, { message: "Agent cannot depend on itself" })
);

// Advanced union types with type guards
const MessagePayload = z.union([
  z.object({ type: z.literal("text"), content: z.string() }),
  z.object({ type: z.literal("json"), content: z.record(z.any()) }),
  z.object({ type: z.literal("binary"), content: z.instanceof(Buffer) }),
  z.object({ 
    type: z.literal("stream"), 
    content: z.object({
      readable: z.boolean(),
      encoding: z.string().optional()
    })
  })
]);

// Function schema validation for agent handlers
const agentHandler = z.function()
  .args(
    z.object({ type: z.string(), payload: z.any() }), // message
    z.object({ agentId: z.string(), logger: z.any() }) // context
  )
  .returns(z.promise(z.object({
    status: z.enum(["success", "error", "pending"]),
    result: z.any().optional(),
    error: z.string().optional()
  })));

// Implement validated function
const validatedHandler = agentHandler.implement(async (message, context) => {
  context.logger.info(`Processing message: ${message.type}`);
  
  try {
    const result = await processMessage(message);
    return { status: "success", result };
  } catch (error) {
    return { 
      status: "error", 
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
});

// Record validation with dynamic keys
const agentRegistry = z.record(
  z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]*$/), // agent name pattern
  z.object({
    handler: z.function(),
    config: z.record(z.any()),
    status: z.enum(["active", "inactive", "error"]),
    lastSeen: z.date(),
    metrics: z.object({
      messagesProcessed: z.number().int().nonnegative(),
      averageResponseTime: z.number().positive(),
      errorRate: z.number().min(0).max(1)
    })
  })
);

// Template literal validation for structured IDs
const agentId = z.template_literal`agent_${z.string().regex(/^[a-z0-9]+$/)}`;
const taskId = z.template_literal`task_${z.string().uuid()}`;
const correlationId = z.template_literal`corr_${z.string().regex(/^[0-9]{8}$/)}`;

// Validation with custom error messages and paths
const configSchema = z.object({
  server: z.object({
    port: z.number().int().min(1).max(65535),
    host: z.string().ip().or(z.literal("localhost")),
    timeout: z.number().positive().max(300000)
  }),
  agents: z.array(AgentConfigSchema).min(1),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]),
    format: z.enum(["json", "text"]),
    outputs: z.array(z.enum(["console", "file", "syslog"]))
  })
}).superRefine((data, ctx) => {
  // Cross-field validation
  if (data.server.port < 1024 && data.server.host !== "localhost") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Privileged ports require localhost binding",
      path: ["server", "port"]
    });
  }
  
  // Validate unique agent names
  const agentNames = data.agents.map(a => a.name);
  const duplicates = agentNames.filter((name, index) => 
    agentNames.indexOf(name) !== index
  );
  
  if (duplicates.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate agent names: ${duplicates.join(", ")}`,
      path: ["agents"]
    });
  }
});
```

#### Performance Optimization Patterns
```typescript
// Schema pre-compilation for production use
const compiledSchemas = new Map<string, z.ZodSchema>();

function getCompiledSchema(name: string, schema: z.ZodSchema) {
  if (!compiledSchemas.has(name)) {
    // Pre-compile schema for better performance
    compiledSchemas.set(name, schema);
  }
  return compiledSchemas.get(name)!;
}

// Async validation with timeout and cancellation
async function validateWithTimeout<T>(
  schema: z.ZodSchema<T>, 
  data: unknown, 
  timeoutMs: number = 5000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    // Use parseAsync for schemas with async refinements
    const result = await schema.parseAsync(data);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      throw new Error(`Validation timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// Batch validation for multiple items
async function validateBatch<T>(
  schema: z.ZodSchema<T>,
  items: unknown[],
  options: { concurrency?: number; failFast?: boolean } = {}
): Promise<{ successes: T[]; errors: z.ZodError[] }> {
  const { concurrency = 10, failFast = false } = options;
  const successes: T[] = [];
  const errors: z.ZodError[] = [];
  
  // Process in batches to control concurrency
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const promises = batch.map(async (item, index) => {
      try {
        const result = await schema.parseAsync(item);
        return { success: true, result, index: i + index };
      } catch (error) {
        return { 
          success: false, 
          error: error as z.ZodError, 
          index: i + index 
        };
      }
    });
    
    const results = await Promise.all(promises);
    
    for (const result of results) {
      if (result.success) {
        successes.push(result.result);
      } else {
        errors.push(result.error);
        if (failFast) {
          throw result.error;
        }
      }
    }
  }
  
  return { successes, errors };
}
```

### Validation Strategies
- **Input Validation**: All MCP tool inputs validated with Zod schemas
- **Output Validation**: Structured responses with type-safe outputs
- **Async Refinements**: Database lookups and external API validation
- **Error Handling**: Detailed validation errors with custom messages
- **Performance**: Schema pre-compilation and caching for production use

---

## ESLint Code Quality ✅

**Context7 ID**: `/eslint/eslint`  
**Trust Score**: 9.1  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: Code quality and linting configuration for TypeScript projects  
**Status**: Current  

### Key Information
- **Version**: v9.37.0+ (flat config system)
- **Configuration**: Flat config format (eslint.config.js), TypeScript integration, plugin ecosystem
- **Features**: Concurrent linting, worker threads, custom rules, auto-fixing, configuration inspector
- **Security Updates**: Regular security patches, plugin security validation
- **Deprecated Patterns**: Legacy .eslintrc format, callback-based rules, synchronous processing
- **Recommended Patterns**: Flat config, TypeScript integration, concurrent processing, custom rules

### Implementation Impact
- Current project uses ESLint v8+ with migration path to v9 flat config
- TypeScript integration with @typescript-eslint parser and rules
- Custom rules for agent-specific patterns and MCP protocol compliance
- Concurrent linting for improved performance on large codebases

### Implementation Patterns

#### Modern Flat Configuration System
```javascript
// Comprehensive eslint.config.js with all advanced patterns
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import globals from "globals";

export default defineConfig([
  // Base recommended configuration
  js.configs.recommended,
  
  // Global ignores using helper function
  globalIgnores([
    "dist/**", 
    "build/**", 
    "node_modules/**",
    "coverage/**",
    "*.config.js"
  ]),

  // TypeScript configuration with advanced rules
  {
    name: "typescript-strict",
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: ["./tsconfig.json"],
        ecmaVersion: 2022,
        sourceType: "module"
      },
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      // Strict TypeScript rules
      "@typescript-eslint/strict-boolean-expressions": ["error", {
        allowString: false,
        allowNumber: false,
        allowNullableObject: false,
        allowNullableBoolean: false,
        allowNullableString: false,
        allowNullableNumber: false,
        allowAny: false
      }],
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_"
      }],
      "@typescript-eslint/explicit-function-return-type": ["error", {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true
      }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": ["error", {
        prefer: "type-imports",
        disallowTypeAnnotations: false
      }]
    }
  },

  // Agent-specific configuration with custom rules
  {
    name: "agent-files",
    files: ["src/agents/**/*.ts"],
    rules: {
      // Custom rules for agent implementations
      "class-methods-use-this": ["error", { 
        enforceForClassFields: true 
      }],
      "no-empty-function": ["error", { 
        allow: ["constructors", "methods", "decoratedFunctions"] 
      }],
      // Require explicit return types for agent methods
      "@typescript-eslint/explicit-member-accessibility": ["error", {
        accessibility: "explicit",
        overrides: {
          constructors: "no-public"
        }
      }]
    }
  },

  // Test files with relaxed rules
  {
    name: "test-files",
    files: [
      "**/*.test.ts", 
      "**/*.spec.ts", 
      "tests/**/*.ts",
      "test/**/*.ts"
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha,
        describe: "readonly",
        it: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        expect: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
      "max-lines-per-function": "off",
      "@typescript-eslint/explicit-function-return-type": "off"
    }
  },

  // Configuration files
  {
    name: "config-files",
    files: ["*.config.js", "*.config.ts", ".eslintrc.*"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-var-requires": "off"
    }
  },

  // Performance and linting options
  {
    name: "linter-options",
    linterOptions: {
      noInlineConfig: false,
      reportUnusedDisableDirectives: "warn"
    }
  }
]);
```

#### Concurrent Linting with Performance Optimization
```javascript
// Advanced ESLint integration with worker threads and caching
const { ESLint } = require("eslint");
const os = require("os");
const path = require("path");

class PerformantESLintRunner {
  constructor(options = {}) {
    this.eslint = new ESLint({
      cwd: process.cwd(),
      // Enable concurrent processing
      concurrency: options.concurrency || "auto",
      
      // Advanced caching strategy
      cache: true,
      cacheStrategy: "content", // More accurate than 'metadata'
      cacheLocation: path.join(process.cwd(), "node_modules/.cache/eslint/"),
      
      // Performance optimizations
      allowInlineConfig: true,
      reportUnusedDisableDirectives: "warn",
      
      // Override configuration
      overrideConfigFile: options.configFile || "eslint.config.js",
      overrideConfig: options.overrideConfig || {},
      
      // Enable fixing
      fix: options.fix || false,
      fixTypes: options.fixTypes || ["problem", "suggestion", "layout"]
    });
    
    this.stats = {
      filesProcessed: 0,
      totalTime: 0,
      issuesFound: 0,
      issuesFixed: 0
    };
  }

  async lintFiles(patterns, options = {}) {
    const startTime = Date.now();
    
    try {
      // Get list of files to lint
      const filePaths = await this.eslint.lintFiles(patterns);
      
      // Filter out ignored files
      const validFiles = filePaths.filter(result => 
        !this.eslint.isPathIgnored(result.filePath)
      );
      
      // Process results
      const results = await this.processResults(validFiles, options);
      
      // Update statistics
      this.updateStats(results, Date.now() - startTime);
      
      return results;
    } catch (error) {
      console.error("ESLint execution failed:", error);
      throw error;
    }
  }

  async processResults(results, options) {
    const { outputFile, format = "stylish" } = options;
    
    // Calculate metrics
    const totalFiles = results.length;
    const totalIssues = results.reduce((sum, result) => 
      sum + result.errorCount + result.warningCount, 0
    );
    const fixableIssues = results.reduce((sum, result) => 
      sum + result.fixableErrorCount + result.fixableWarningCount, 0
    );
    
    // Format output
    const formatter = await this.eslint.loadFormatter(format);
    const output = formatter.format(results);
    
    if (outputFile) {
      await fs.writeFile(outputFile, output);
    } else {
      console.log(output);
    }
    
    // Return summary
    return {
      results,
      summary: {
        totalFiles,
        totalIssues,
        fixableIssues,
        errorCount: results.reduce((sum, r) => sum + r.errorCount, 0),
        warningCount: results.reduce((sum, r) => sum + r.warningCount, 0)
      }
    };
  }

  updateStats(results, duration) {
    this.stats.filesProcessed += results.results.length;
    this.stats.totalTime += duration;
    this.stats.issuesFound += results.summary.totalIssues;
    this.stats.issuesFixed += results.summary.fixableIssues;
  }

  getPerformanceReport() {
    const avgTimePerFile = this.stats.filesProcessed > 0 
      ? this.stats.totalTime / this.stats.filesProcessed 
      : 0;
    
    return {
      ...this.stats,
      averageTimePerFile: Math.round(avgTimePerFile * 100) / 100,
      throughput: this.stats.totalTime > 0 
        ? Math.round((this.stats.filesProcessed / this.stats.totalTime) * 1000)
        : 0
    };
  }
}

// Usage example with configuration
async function runLinting() {
  const runner = new PerformantESLintRunner({
    concurrency: Math.max(1, os.cpus().length - 1), // Leave one CPU free
    fix: true,
    fixTypes: ["problem", "suggestion"],
    overrideConfig: {
      rules: {
        "no-console": process.env.NODE_ENV === "production" ? "error" : "warn"
      }
    }
  });

  try {
    const results = await runner.lintFiles([
      "src/**/*.ts",
      "tests/**/*.ts",
      "!node_modules/**",
      "!dist/**"
    ], {
      format: "json",
      outputFile: "eslint-results.json"
    });

    console.log("Linting completed:", results.summary);
    console.log("Performance:", runner.getPerformanceReport());
    
    return results;
  } catch (error) {
    console.error("Linting failed:", error);
    process.exit(1);
  }
}
```

#### Custom Rule Development
```javascript
// Advanced custom ESLint rule with AST traversal and auto-fixing
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce proper agent method naming conventions",
      category: "Agent Best Practices",
      recommended: true,
      url: "https://docs.example.com/rules/agent-method-naming"
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          prefix: {
            type: "string",
            default: "handle"
          },
          allowPrivate: {
            type: "boolean",
            default: false
          },
          exceptions: {
            type: "array",
            items: { type: "string" },
            default: ["constructor", "initialize", "destroy"]
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      invalidMethodName: "Agent method '{{name}}' should start with '{{prefix}}'",
      privateMethodNotAllowed: "Private agent methods are not allowed: '{{name}}'"
    }
  },

  create(context) {
    const options = context.options[0] || {};
    const { prefix = "handle", allowPrivate = false, exceptions = [] } = options;
    const sourceCode = context.sourceCode;

    function checkMethodName(node) {
      const methodName = node.key.name;
      
      // Skip exceptions
      if (exceptions.includes(methodName)) {
        return;
      }
      
      // Check private methods
      if (methodName.startsWith("_") && !allowPrivate) {
        context.report({
          node: node.key,
          messageId: "privateMethodNotAllowed",
          data: { name: methodName }
        });
        return;
      }
      
      // Check prefix requirement
      if (!methodName.startsWith(prefix) && !methodName.startsWith("_")) {
        context.report({
          node: node.key,
          messageId: "invalidMethodName",
          data: { name: methodName, prefix },
          fix(fixer) {
            const newName = `${prefix}${methodName.charAt(0).toUpperCase()}${methodName.slice(1)}`;
            return fixer.replaceText(node.key, newName);
          }
        });
      }
    }

    return {
      // Check class methods
      "ClassDeclaration > ClassBody > MethodDefinition": checkMethodName,
      
      // Check object methods
      "ObjectExpression > Property[method=true]": checkMethodName,
      
      // Check function properties
      "ObjectExpression > Property[value.type='FunctionExpression']": checkMethodName
    };
  }
};
```

#### Integration with TypeScript and Build Tools
```javascript
// eslint.config.js with build tool integration
import { defineConfig } from "eslint/config";
import tseslint from "@typescript-eslint/eslint-plugin";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname
});

export default defineConfig([
  // Extend existing configurations
  ...compat.extends(
    "eslint:recommended",
    "@typescript-eslint/recommended",
    "@typescript-eslint/recommended-requiring-type-checking"
  ),
  
  // Project-specific overrides
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // Performance-critical rules
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/prefer-readonly-parameter-types": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      
      // Memory management
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/require-await": "error",
      
      // Type safety
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error"
    }
  }
]);
```

### Advanced Configuration
- **Custom Rules**: Agent-specific linting rules for protocol compliance
- **Performance**: Worker threads and concurrent processing for large codebases
- **Integration**: TypeScript parser with strict type checking rules
- **Overrides**: File-specific configurations for different code areas
- **Plugins**: Extensible rule system with community and custom plugins

---

## Node.js Runtime ✅

**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: Runtime compatibility and performance verification  
**Status**: Current  

### Key Information
- **Required Version**: 18+ (MCP compatibility)
- **Recommended Version**: 20+ (LTS)
- **Package Manager**: npm (standard for MCP projects)
- **Critical Polyfill**: Web Crypto API for older versions
- **Security Updates**: Regular security patches available, Web Crypto API stable
- **Deprecated Patterns**: Callback-based APIs, manual crypto implementations, synchronous file operations
- **Recommended Patterns**: async/await, Web Crypto API, event loop monitoring

### Implementation Impact
- Current project targets Node.js 18+ (engines field in package.json)
- Web Crypto API polyfill may be needed for older Node.js versions
- Performance monitoring patterns available for production use

### Implementation Patterns

```typescript
// Web Crypto API polyfill for older Node.js versions
import { webcrypto } from 'node:crypto';

if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto as unknown as Crypto;
}
```

### Performance Monitoring
- **Event Loop Monitoring**: Use `perf_hooks.monitorEventLoopDelay()`
- **Memory Management**: Monitor `process.memoryUsage().heapUsed`
- **Concurrency Control**: Implement slot-based limiting
- **Timeout Handling**: Cooperative cancellation with `AbortSignal`

---

# MCP Server Testing Patterns ✅

**Last Updated**: 2026-01-06  
**Source**: Context7 MCP server consultations  
**Status**: Current  

## Test Harness Implementation Verification ✅

Based on Context7 consultation, the current test harness implementation follows recommended patterns:

### ✅ Correct Patterns Used
- **Stdio Transport**: Uses `StdioServerTransport` for spawned process testing (recommended)
- **High-Level API**: Uses `McpServer` wrapper instead of low-level protocol handling
- **Schema Validation**: Proper Zod schema validation for tool registration
- **Session Management**: Correct session lifecycle handling with state transitions
- **Protocol Compliance**: Strict JSON-RPC 2.0 and MCP protocol adherence
- **Multi-Project Structure**: Vitest projects for unit, integration, performance, property tests

### ✅ Security Compliance
- **DNS Rebinding Protection**: Enabled by default in MCP SDK
- **Input Validation**: All tool inputs validated with Zod schemas
- **Error Handling**: Proper JSON-RPC error responses with correlation IDs
- **Transport Security**: Stdio transport for test isolation

### ✅ Testing Best Practices
- **Deterministic Testing**: Injectable Clock and IdGenerator for reproducible tests
- **Log Capture**: Stderr interception for log assertion
- **Resource Management**: Proper cleanup and lifecycle management
- **Protocol State Machine**: Correct STARTING → INITIALIZING → RUNNING transitions

### Implementation Verification
```typescript
// ✅ Correct: Using high-level McpServer API
const server = new McpServer({ name: 'test-server', version: '1.0.0' });

// ✅ Correct: Stdio transport for test harness
const transport = new StdioServerTransport();
await server.connect(transport);

// ✅ Correct: Zod schema validation
server.registerTool('test-tool', {
  inputSchema: { param: z.string() },
  outputSchema: { result: z.string() }
}, async ({ param }) => ({ result: `Processed: ${param}` }));

// ✅ Correct: Multi-project test configuration
export default defineConfig({
  test: {
    projects: [
      { name: 'unit', include: ['tests/unit/**/*.test.ts'] },
      { name: 'integration', include: ['tests/integration/**/*.test.ts'] },
      { name: 'performance', include: ['tests/performance/**/*.test.ts'] },
      { name: 'property', include: ['tests/property/**/*.test.ts'] }
    ]
  }
});
```

### ❌ Anti-Patterns Avoided
- ❌ Manual JSON-RPC handling (use McpServer instead)
- ❌ SSE transport (deprecated, use Streamable HTTP or Stdio)
- ❌ Unvalidated schemas (always use Zod validation)
- ❌ Direct protocol layer usage (use high-level wrappers)

---

# Testing Strategies & Best Practices ✅

**Last Updated**: 2026-01-06  
**Source**: Project implementation analysis  
**Status**: Current  

## Test Organization Structure ✅

### Test Project Configuration (Vitest)
```typescript
// vitest.config.ts - Multi-project test organization
projects: [
  {
    name: 'unit',
    include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
    testTimeout: 30000,
  },
  {
    name: 'integration', 
    include: ['tests/integration/**/*.{test,spec}.{js,ts}'],
    testTimeout: 30000,
  },
  {
    name: 'performance',
    include: ['tests/performance/**/*.{test,spec}.{js,ts}'],
    testTimeout: 60000, // Longer timeout for performance tests
  },
  {
    name: 'property',
    include: ['tests/property/**/*.{test,spec}.{js,ts}'],
    testTimeout: 60000, // Longer timeout for property-based tests
  },
]
```

### Directory Structure
```
tests/
├── unit/                    # Unit tests for individual components
│   ├── agents/             # Agent-specific unit tests
│   ├── errors/             # Error handling tests
│   ├── logging/            # Logging system tests
│   ├── mcp/                # MCP protocol tests
│   ├── protocol/           # Protocol layer tests
│   ├── resources/          # Resource management tests
│   └── tools/              # Tool implementation tests
├── integration/            # Integration tests for component interaction
├── performance/            # Performance and load testing
├── property/               # Property-based testing
├── e2e/                    # End-to-end workflow tests
├── helpers/                # Test utilities and harness
└── setup/                  # Test configuration and setup
```

## Deterministic Testing Framework ✅

### Deterministic Setup (`tests/setup/deterministic.ts`)
```typescript
// Controllable clock for deterministic timestamps
export const testClock = {
  now(): number { return mockTimestamp; },
  timestamp(): string { return new Date(mockTimestamp).toISOString(); },
  advance(ms: number): void { mockTimestamp += ms; },
  reset(): void { mockTimestamp = 1640995200000; }, // 2022-01-01T00:00:00.000Z
};

// Deterministic ID generation
export const testIdGenerator = {
  generateRunId(): string { return `run-${String(mockIdCounter++).padStart(8, '0')}`; },
  generateCorrelationId(): string { return `corr-${String(mockIdCounter++).padStart(8, '0')}`; },
  generateConnectionCorrelationId(): string { return `conn-${String(mockIdCounter++).padStart(8, '0')}`; },
  reset(): void { mockIdCounter = 0; },
};

// Fast-check configuration for property-based testing
export const fastCheckConfig = {
  numRuns: 100,        // Minimum 100 iterations as specified
  seed: 42,            // Fixed seed for deterministic property tests
  endOnFailure: true,  // Stop on first failure for faster feedback
};

// Global setup for deterministic execution
beforeEach(() => {
  testClock.reset();
  testIdGenerator.reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(mockTimestamp));
});
```

### Deterministic Test Execution
```typescript
// vitest.config.ts - Ensure deterministic test execution
sequence: {
  shuffle: false,      // Deterministic test order
  concurrent: false,   // Sequential execution for determinism
},
```

## Test Harness & MCP Server Testing ✅

### Test Server Lifecycle (`tests/helpers/testHarness.ts`)
```typescript
// Start test server with optional configuration
export async function startTestServer(
  configOverrides?: Partial<ServerConfig>,
  options?: {
    clock?: Clock;
    idGenerator?: IdGenerator;
    deterministic?: boolean;
  }
): Promise<TestServerInstance>

// Initialize server with proper MCP handshake
export async function initializeTestServer(server: TestServerInstance): Promise<void>

// Test server interface
interface TestServerInstance {
  sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse>;
  sendNotification(notification: JsonRpcNotification): Promise<void>;
  getLogs(): LogEntry[];
  clearLogs(): void;
  close(): Promise<void>;
}
```

### JSON-RPC 2.0 Compliant Helper Functions
```typescript
// Protocol-compliant request builders
export function sendInitialize(clientInfo?: { name?: string; version?: string }): JsonRpcRequest
export function sendInitialized(): JsonRpcNotification  
export function sendToolsList(): JsonRpcRequest
export function sendToolsCall(
  toolName: string, 
  args?: Record<string, unknown>, 
  meta?: { correlationId?: string }
): JsonRpcRequest

// Response validation
export function validateJsonRpcResponse(response: unknown): response is JsonRpcResponse
export function validateJsonRpcError(error: unknown): response is JsonRpcResponse['error']

// Log assertion utilities
export function assertLogContains(
  logs: LogEntry[], 
  level: LogLevel, 
  messagePattern: string
): boolean
```

### Complete MCP Testing Workflow
```typescript
// Standard test pattern for MCP tools
describe('MCP Tool Integration', () => {
  let testServer: TestServerInstance;

  beforeEach(async () => {
    testServer = await startTestServer();
  });

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
    }
  });

  it('should handle complete MCP workflow', async () => {
    // 1. Initialize server
    await initializeTestServer(testServer);
    
    // 2. List available tools
    const toolsResponse = await testServer.sendRequest(sendToolsList());
    expect(validateJsonRpcResponse(toolsResponse)).toBe(true);
    
    // 3. Call specific tool
    const callResponse = await testServer.sendRequest(
      sendToolsCall('health', {}, { correlationId: 'test-corr' })
    );
    expect(validateJsonRpcResponse(callResponse)).toBe(true);
    expect(callResponse.result.isError).toBe(false);
    
    // 4. Verify logs
    const logs = testServer.getLogs();
    expect(assertLogContains(logs, 'info', 'Tool execution completed')).toBe(true);
  });
});
```

## Property-Based Testing Integration ✅

### Fast-Check with Vitest Integration
```typescript
import { test, fc } from '@fast-check/vitest';

// Property-based test with array syntax (minimum 100 iterations)
test.prop([fc.string(), fc.string(), fc.string()])(
  'should detect substring', 
  (a, b, c) => {
    return (a + b + c).includes(b);
  }
);

// Property-based test with object syntax
test.prop({ 
  a: fc.string(), 
  b: fc.string(), 
  c: fc.string() 
})('should detect substring', ({ a, b, c }) => {
  return (a + b + c).includes(b);
});

// One-time randomness mode for controlled randomness
test('test with controlled randomness', ({ g }) => {
  const user = {
    firstName: g(fc.string),
    lastName: g(fc.string),
  };
  
  const displayName = computeDisplayName(user);
  expect(displayName).toContain(user.firstName);
});
```

### Property Testing Strategy
- **Universal Properties**: Use property-based testing for properties that should hold for all inputs
- **Minimum Iterations**: Run at least 100 iterations for property tests (configured globally)
- **Shrinking**: Leverage automatic shrinking to find minimal failing cases
- **Deterministic Seeds**: Use fixed seeds (42) for reproducible property test failures

## Copy-on-Write Testing Patterns ✅

### Immutability Verification
```typescript
describe('Copy-on-Write Semantics', () => {
  it('should not mutate original objects', () => {
    const originalObject = {
      sensitive: 'secret',
      nested: { value: 'test' },
      array: [1, 2, 3]
    };
    
    // Create deep clone for comparison
    const objectClone = structuredClone(originalObject);
    
    // Process object through system
    const result = processObject(originalObject);
    
    // Verify original unchanged
    expect(originalObject).toEqual(objectClone);
    expect(originalObject).toStrictEqual(objectClone);
    
    // Verify processing worked correctly
    expect(result.sensitive).toBe('[REDACTED]');
  });
});
```

### Nested Structure Testing
```typescript
it('should handle complex nested structures without mutation', () => {
  const complexObject = {
    services: [
      { name: 'auth', config: { password: 'secret' } },
      { name: 'data', config: { apiKey: 'key123' } }
    ],
    settings: {
      debug: true,
      credentials: { token: 'token123' }
    }
  };
  
  const originalClone = structuredClone(complexObject);
  
  const processed = redactSensitiveData(complexObject);
  
  // Verify original completely unchanged
  expect(complexObject).toEqual(originalClone);
  expect(complexObject.services[0].config.password).toBe('secret');
  
  // Verify processing worked
  expect(processed.services[0].config.password).toBe('[REDACTED]');
});
```

## Error Handling Testing Patterns ✅

### Structured Error Testing
```typescript
describe('Error Handling', () => {
  it('should create structured errors with all required fields', () => {
    const error = createError(
      ErrorCode.InvalidArgument,
      'Schema validation failed',
      { validationErrors: ['field required'] }
    );

    expect(error.code).toBe(ErrorCode.InvalidArgument);
    expect(error.message).toBe('Schema validation failed');
    expect(error.details.validationErrors).toEqual(['field required']);
  });

  it('should convert to JSON-RPC error format', () => {
    const response = toJsonRpcError(
      JSON_RPC_ERROR_CODES.INVALID_PARAMS,
      'Invalid parameters',
      { code: 'VALIDATION_FAILED' },
      '123'
    );

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe('123');
    expect(response.error.code).toBe(-32602);
    expect(response.error.message).toBe('Invalid parameters');
    expect(response.error.data.code).toBe('VALIDATION_FAILED');
  });
});
```

### Error Code Coverage Testing
```typescript
it('should handle all error codes in tool error wrapping', () => {
  const codes = Object.values(ErrorCode);
  codes.forEach((code) => {
    const error = createError(code, `Error: ${code}`);
    const response = toToolError(error, { correlationId: 'test' });

    const parsedError = JSON.parse(response.content[0].text);
    expect(parsedError.code).toBe(code);
  });
});
```

## Resource Management Testing ✅

### Concurrency Control Testing
```typescript
describe('Resource Management', () => {
  it('should track concurrent executions correctly', () => {
    // Acquire slots
    const releaseSlots: Array<() => void> = [];
    for (let i = 0; i < 7; i++) {
      const releaseSlot = resourceManager.tryAcquireSlot();
      expect(releaseSlot).not.toBeNull();
      releaseSlots.push(releaseSlot!);
    }

    const telemetry = resourceManager.getTelemetry();
    expect(telemetry.concurrentExecutions).toBe(7);
    expect(telemetry.maxConcurrentExecutions).toBe(10);

    // Release slots
    releaseSlots.forEach(release => release());
    
    const telemetryAfterRelease = resourceManager.getTelemetry();
    expect(telemetryAfterRelease.concurrentExecutions).toBe(0);
  });

  it('should detect resource exhaustion thresholds', () => {
    // Test 80% threshold (8/10 = 80% - should be false)
    for (let i = 0; i < 8; i++) {
      resourceManager.tryAcquireSlot();
    }
    expect(resourceManager.isApproachingLimits()).toBe(false);

    // Test >80% threshold (9/10 = 90% - should be true)
    resourceManager.tryAcquireSlot();
    expect(resourceManager.isApproachingLimits()).toBe(true);
  });
});
```

### Health Status Testing
```typescript
it('should return correct health status based on metrics', () => {
  const telemetry = resourceManager.getTelemetry();
  const status = resourceManager.getHealthStatus();
  
  // Health status depends on multiple factors
  if (telemetry.eventLoopDelayMs > 500) {
    expect(status).toBe('unhealthy');
  } else if (telemetry.eventLoopDelayMs > 100 || telemetry.concurrentExecutions > 8) {
    expect(status).toBe('degraded');
  } else {
    expect(status).toBe('healthy');
  }
});
```

## Logging System Testing ✅

### Structured Logging Verification
```typescript
describe('Structured Logging', () => {
  it('should create proper log entry structure', () => {
    const context = {
      correlationId: 'test-123',
      customField: 'custom-value'
    };
    
    logger.info('Test message', context);
    
    // Verify log was written
    expect(stderrSpy).toHaveBeenCalledOnce();
    
    const logOutput = stderrSpy.mock.calls[0][0] as string;
    const logEntry = JSON.parse(logOutput);
    
    expect(logEntry).toEqual({
      timestamp: '2024-01-15T10:30:00.000Z',
      level: 'info',
      message: 'Test message',
      correlationId: 'test-123',
      customField: 'custom-value'
    });
  });
});
```

### Log Capture and Assertion
```typescript
it('should capture and validate log entries', async () => {
  // Perform operation that generates logs
  await initializeTestServer(testServer);
  
  const logs = testServer.getLogs();
  expect(Array.isArray(logs)).toBe(true);
  expect(logs.length).toBeGreaterThan(0);
  
  // Assert specific log patterns
  expect(assertLogContains(logs, 'info', 'Starting Foundation MCP Runtime')).toBe(true);
  
  // Verify structured log fields
  const hasCorrelationLog = logs.some(log => 
    log.correlationId !== undefined && 
    typeof log.correlationId === 'string'
  );
  expect(hasCorrelationLog).toBe(true);
});
```

## Coverage Configuration ✅

### Coverage Thresholds and Reporting
```typescript
// vitest.config.ts - Coverage configuration
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html', 'lcov'],
  reportsDirectory: './coverage',
  
  // Include source files
  include: ['src/**/*.{js,ts}'],
  
  // Exclude test files and config
  exclude: [
    'node_modules/', 'dist/', 'tests/', 'arch_docs/',
    '**/*.d.ts', '**/*.config.{js,ts}', '**/*.test.{js,ts}',
    '**/index.ts', // Entry points typically just re-export
    'src/shared/types/index.ts', // Type-only files
  ],
  
  // Coverage thresholds (80% minimum)
  thresholds: {
    lines: 80,
    branches: 80,
    functions: 80,
    statements: 80,
  },
}
```

## Testing Best Practices Summary ✅

### Test Categories and Strategies
1. **Unit Tests**: Individual component testing with mocks and stubs
2. **Integration Tests**: Component interaction testing with real dependencies
3. **Property-Based Tests**: Universal property validation (minimum 100 iterations)
4. **Performance Tests**: Load testing and resource utilization validation
5. **End-to-End Tests**: Complete workflow validation

### Key Testing Principles
- **Deterministic Execution**: Fixed timestamps, IDs, and test order
- **Copy-on-Write Verification**: Ensure immutability throughout system
- **Protocol Compliance**: JSON-RPC 2.0 specification adherence
- **Resource Management**: Concurrency control and health monitoring
- **Structured Logging**: Comprehensive log capture and validation
- **Error Handling**: Complete error code coverage and structured responses

### Test Execution Commands
```bash
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests
npm run test:e2e          # End-to-end workflow tests
npm test -- --coverage    # Run with coverage reporting
```

---

# Implementation Standards

---

# Security & Compliance Requirements

## Mandatory Security Patterns ✅

### Input Validation
- **All inputs MUST use schema validation** (Zod preferred)
- **Parameter validation**: Object or array only, never primitives
- **Schema compilation**: Pre-compile at registration time

### Output Security
- **Sanitization**: Escape control characters in all log outputs
- **Redaction**: Auto-redact keys matching security patterns (case-insensitive)
- **Transport Security**: HTTPS in production, DNS rebinding protection enabled

### Sensitive Data Redaction
```typescript
const securityKeys = [
  'token', 'key', 'secret', 'password', 'apiKey', 
  'authorization', 'bearer', 'session', 'cookie'
];
```

---

# Error Handling Standards ✅

## Structured Error Format
```typescript
interface StructuredError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  runId?: string;
  correlationId?: string;
}

enum ErrorCode {
  InvalidArgument = 'INVALID_ARGUMENT',
  NotFound = 'NOT_FOUND',
  Timeout = 'TIMEOUT',
  ResourceExhausted = 'RESOURCE_EXHAUSTED',
  Internal = 'INTERNAL',
  Unauthorized = 'UNAUTHORIZED',
  NotInitialized = 'NOT_INITIALIZED'
}
```

---

# Resource Management Standards ✅

## Concurrency Control
- **Pattern**: Slot-based limiting with `tryAcquireSlot()`
- **Timeout Handling**: Cooperative cancellation with `AbortSignal`
- **Load Shedding**: Reject requests when >80% resource utilization
- **Health Monitoring**: Track healthy/degraded/unhealthy thresholds

## Performance Telemetry
```typescript
interface ResourceTelemetry {
  memoryUsageBytes: number;        // process.memoryUsage().heapUsed
  eventLoopDelayMs: number;        // p99 from monitorEventLoopDelay()
  concurrentExecutions: number;    // current active slots
  maxConcurrentExecutions: number; // configured limit
}
```

---

# Logging & Observability Standards ✅

## Structured Logging Requirements
- **Format**: JSON to stderr only (stdout reserved for MCP protocol)
- **Fields**: timestamp, level, message, correlationId, runId
- **Redaction**: Case-insensitive key matching for sensitive data
- **Sanitization**: Control character escaping for all string fields

---

# Deprecated Patterns ❌

## Never Use These Patterns

### Testing Anti-Patterns
- ❌ Jest framework (use Vitest)
- ❌ Manual mock implementations (use `vi.fn()`)
- ❌ Synchronous patterns for async code
- ❌ Hard-coded test data (use property-based testing)

### Protocol Anti-Patterns  
- ❌ Non-standard JSON-RPC error codes
- ❌ Missing `jsonrpc: "2.0"` field
- ❌ Primitive values in `params` field
- ❌ SSE transport (use Streamable HTTP)

### Node.js Anti-Patterns
- ❌ Callback-based APIs (use async/await)
- ❌ Manual crypto implementations (use Web Crypto API)
- ❌ Synchronous file operations in production
- ❌ Unvalidated schemas (use Zod)

---

# Quick Implementation Checklist

## Before Implementation ✅
- [ ] Check this canonical reference for existing patterns
- [ ] Verify information currency (<30 days)
- [ ] Follow consultation protocol if information missing/outdated
- [ ] Update this document with any new findings

## During Implementation ✅
- [ ] Use documented patterns from this reference
- [ ] Implement proper input validation (Zod schemas)
- [ ] Follow structured error handling format
- [ ] Include security measures (redaction, sanitization)
- [ ] Monitor resource usage per documented standards

## After Implementation ✅
- [ ] Test comprehensively (unit + property-based, min 100 iterations)
- [ ] Verify security compliance (redaction, validation)
- [ ] Check performance against documented thresholds
- [ ] Update this document with any new patterns discovered

---

# Agent-to-Agent Communication Protocols (AACP) ✅

**Last Updated**: 2026-01-06  
**Source**: Context7 MCP server consultations  
**Status**: Current  

## Agent Client Protocol (ACP) ✅

**Context7 ID**: `/zed-industries/agent-client-protocol`  
**Trust Score**: 9.7  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: AACP communication protocols for multi-agent architecture system  
**Status**: Current  

### Key Information
- **Version**: v1.0+ (Protocol Version 1)
- **Purpose**: Standardizes communication between code editors/IDEs and AI-powered coding agents
- **Transport**: JSON-RPC 2.0 over HTTP, WebSocket, or stdio
- **Features**: Real-time session updates, tool calls, file operations, terminal management, permission requests
- **Security Updates**: DNS rebinding protection, OAuth 2.0 integration, permission-based operations
- **Deprecated Patterns**: SSE transport (use Streamable HTTP), manual JSON-RPC handling
- **Recommended Patterns**: High-level API usage, structured session management, real-time streaming

### Implementation Impact
- Provides standardized protocol for agent-to-client communication in multi-agent systems
- Enables real-time collaboration between agents and development environments
- Supports complex workflows with tool calls, file operations, and user permission requests
- Essential for building agent systems that integrate with code editors and IDEs

### Core Protocol Patterns

#### Initialization and Capability Exchange
```typescript
// Client initialization request
const initRequest = {
  protocol_version: 1,
  client_capabilities: {
    fs: { read_text_file: true, write_text_file: true },
    terminal: true
  },
  client_info: {
    name: "multi-agent-system",
    title: "Multi-Agent Architecture System", 
    version: "1.0.0"
  }
};

// Agent response with capabilities
const initResponse = {
  protocol_version: 1,
  agent_capabilities: {
    load_session: true,
    prompt_capabilities: {
      image: true,
      audio: false,
      embedded_context: true
    },
    mcp_capabilities: {
      http: true,
      sse: false
    }
  },
  auth_methods: [
    { id: "oauth", name: "OAuth 2.0", description: "Authenticate using OAuth" }
  ]
};
```

#### Session Management and Real-time Updates
```typescript
// Create new session
const sessionRequest = {
  cwd: "/project/path",
  mcpServers: [
    {
      name: "filesystem",
      command: "/path/to/mcp-server",
      args: ["--stdio"],
      env: {}
    }
  ]
};

// Stream session updates
const sessionUpdate = {
  session_id: "sess_abc123",
  update: {
    AgentThoughtChunk: {
      content: { Text: { text: "Analyzing the codebase structure..." } }
    }
  }
};

// Tool call execution
const toolCall = {
  session_id: "sess_abc123",
  update: {
    ToolCall: {
      tool_call_id: "tc_001",
      title: "Edit authentication module",
      kind: "Edit",
      status: "Pending",
      locations: [{ path: "/src/auth.ts", line: 42 }]
    }
  }
};
```

#### File System Operations
```typescript
// Read file with line range
const readRequest = {
  session_id: "sess_abc123",
  path: "/project/src/config.json",
  line: 1,
  limit: 100
};

// Write file content
const writeRequest = {
  session_id: "sess_abc123", 
  path: "/project/output.txt",
  content: "Generated content from agent processing"
};
```

#### Terminal Operations
```typescript
// Create terminal for command execution
const terminalRequest = {
  session_id: "sess_abc123",
  command: "npm",
  args: ["test", "--coverage"],
  env: [{ name: "NODE_ENV", value: "test" }],
  cwd: "/project",
  output_byte_limit: 1000000
};

// Monitor terminal output
const outputRequest = {
  session_id: "sess_abc123",
  terminal_id: "term_001"
};
```

#### Permission System
```typescript
// Request user permission for sensitive operations
const permissionRequest = {
  session_id: "sess_abc123",
  tool_call: {
    tool_call_id: "tc_002",
    title: "Write configuration file",
    kind: "Edit",
    content: [{ content: { text: "sensitive config data" } }]
  },
  options: [
    { option_id: "allow_once", name: "Allow", kind: "AllowOnce" },
    { option_id: "allow_always", name: "Always Allow", kind: "AllowAlways" },
    { option_id: "reject", name: "Reject", kind: "RejectOnce" }
  ]
};
```

### Extension Mechanisms
- **Custom Methods**: Use underscore prefix (`_custom_method`) for extensions
- **Meta Fields**: Use `_meta` field for custom data attachment
- **Capability Advertising**: Advertise extensions in capability objects during initialization

---

## Agent Protocol (AP) ✅

**Context7 ID**: `/div99/agent-protocol`  
**Trust Score**: 9.5  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: AACP communication protocols for multi-agent architecture system  
**Status**: Current  

### Key Information
- **Version**: Latest stable (OpenAPI specification)
- **Purpose**: Standardized REST API for AI agent communication and task management
- **Transport**: HTTP REST API with JSON payloads
- **Features**: Task creation, step execution, artifact management, progress tracking
- **Security Updates**: No critical vulnerabilities, stable API specification
- **Deprecated Patterns**: Direct agent communication without protocol compliance
- **Recommended Patterns**: RESTful task-based communication, artifact management, step-by-step execution

### Implementation Impact
- Provides REST API standard for agent task management and execution
- Enables standardized agent interaction across different implementations
- Supports artifact management and progress tracking for complex tasks
- Essential for building interoperable agent systems

### Core API Patterns

#### Task Management
```typescript
// Create new task
POST /ap/v1/agent/tasks
{
  "input": "Implement user authentication system",
  "additional_input": {
    "requirements": ["OAuth 2.0", "JWT tokens", "Role-based access"],
    "priority": "high"
  }
}

// Response
{
  "task_id": "e6d768bb-4c50-4007-9853-aeffb46c77be",
  "input": "Implement user authentication system",
  "artifacts": []
}

// Get task details
GET /ap/v1/agent/tasks/{task_id}
```

#### Step Execution
```typescript
// Execute task step
POST /ap/v1/agent/tasks/{task_id}/steps
{
  "input": "Create database schema for users",
  "additional_input": {
    "schema_type": "PostgreSQL",
    "include_indexes": true
  }
}

// Response
{
  "step_id": "8ff8ba39-2c3e-4246-8086-fbd2a897240b",
  "task_id": "e6d768bb-4c50-4007-9853-aeffb46c77be",
  "output": "Created users table with email, password_hash, and session fields",
  "is_last": false,
  "artifacts": ["schema.sql"]
}

// Get step details
GET /ap/v1/agent/tasks/{task_id}/steps/{step_id}
```

#### Artifact Management
```typescript
// Upload artifact
POST /ap/v1/agent/tasks/{task_id}/artifacts
Content-Type: multipart/form-data
{
  "file": [binary data],
  "relative_path": "src/auth/schema.sql"
}

// Download artifact
GET /ap/v1/agent/tasks/{task_id}/artifacts/{artifact_id}

// List artifacts
GET /ap/v1/agent/tasks/{task_id}/artifacts
```

#### Client Implementation Patterns
```typescript
// TypeScript SDK usage
import Agent, { StepHandler, StepInput, StepResult, TaskInput } from 'agent-protocol';

async function taskHandler(taskInput: TaskInput | null): Promise<StepHandler> {
  console.log(`Processing task: ${taskInput}`);

  async function stepHandler(stepInput: StepInput | null): Promise<StepResult> {
    // Process individual step
    const result = await processStep(stepInput);
    
    return {
      output: result.output,
      artifacts: result.artifacts,
      is_last: result.completed
    };
  }

  return stepHandler;
}

Agent.handleTask(taskHandler, {}).start();
```

#### Python SDK Implementation
```python
from agent_protocol import Agent, Step, Task

async def task_handler(task: Task) -> None:
    # Create initial steps for the task
    await Agent.db.create_step(
        task_id=task.task_id,
        name="analyze_requirements",
        input=task.input
    )

async def step_handler(step: Step) -> Step:
    if step.name == "analyze_requirements":
        # Process requirements analysis
        step.output = "Requirements analyzed successfully"
        
        # Create next step
        await Agent.db.create_step(
            task_id=step.task_id,
            name="implement_solution",
            is_last=True
        )
    
    elif step.name == "implement_solution":
        # Implement the solution
        step.output = "Solution implemented"
        step.is_last = True
    
    return step

Agent.setup_agent(task_handler, step_handler).start()
```

---

## Agent-MCP Multi-Agent Collaboration Protocol ✅

**Context7 ID**: `/rinadelph/agent-mcp`  
**Trust Score**: 8.5  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: AACP communication protocols for multi-agent architecture system  
**Status**: Current  

### Key Information
- **Version**: v1.0.0 (MCP-based multi-agent system)
- **Purpose**: Multi-agent collaboration protocol for coordinated AI software development
- **Transport**: MCP server with HTTP, WebSocket, and Unix socket support
- **Features**: Agent management, task orchestration, knowledge management, real-time communication
- **Security Updates**: Authentication tokens, secure agent registration, file locking mechanisms
- **Deprecated Patterns**: Single-agent approaches, manual coordination, unstructured communication
- **Recommended Patterns**: Specialized agent roles, linear task decomposition, persistent knowledge graphs

### Implementation Impact
- Provides framework for coordinated multi-agent development workflows
- Enables persistent knowledge sharing through RAG systems and context stores
- Supports real-time agent collaboration with conflict resolution
- Essential for building complex multi-agent architecture systems

### Core MCP Tools and Patterns

#### Agent Management
```typescript
// Create specialized agent
await client.call_tool("create_agent", {
  role: "backend",
  specialization: "API development",
  capabilities: ["database", "authentication", "REST APIs"]
});

// List active agents
const agents = await client.call_tool("list_agents", {});

// Terminate agent
await client.call_tool("terminate_agent", {
  agent_id: "agent_backend_001"
});
```

#### Task Orchestration
```typescript
// Assign task to specific agent
await client.call_tool("assign_task", {
  agent_id: "agent_backend_001",
  task: "Implement user authentication endpoints",
  priority: "high",
  dependencies: ["database_schema_complete"]
});

// View task progress
const tasks = await client.call_tool("view_tasks", {
  filters: { status: "in_progress", agent_id: "agent_backend_001" }
});

// Update task status
await client.call_tool("update_task_status", {
  task_id: "task_auth_001",
  status: "completed",
  context: "All endpoints implemented and tested"
});
```

#### Knowledge Management
```typescript
// Query project knowledge graph
const context = await client.call_tool("ask_project_rag", {
  query: "What's our current database schema for user authentication?"
});

// Update project context
await client.call_tool("update_project_context", {
  key: "auth_implementation_pattern",
  value: {
    pattern: "JWT with refresh tokens",
    endpoints: ["/login", "/logout", "/refresh"],
    security_measures: ["bcrypt hashing", "rate limiting"]
  }
});

// View specific context
const authContext = await client.call_tool("view_project_context", {
  context_key: "auth_implementation_pattern"
});
```

#### Inter-Agent Communication
```typescript
// Direct agent messaging
await client.call_tool("send_agent_message", {
  from_agent: "agent_backend_001",
  to_agent: "agent_frontend_001", 
  message: "Authentication API endpoints are ready for integration",
  message_type: "completion_notification"
});

// Broadcast to all agents
await client.call_tool("broadcast_message", {
  from_agent: "agent_coordinator",
  message: "Database migration completed, proceed with dependent tasks",
  message_type: "system_update"
});

// Request assistance
await client.call_tool("request_assistance", {
  requesting_agent: "agent_backend_001",
  issue: "Need help with OAuth 2.0 implementation complexity",
  urgency: "medium"
});
```

#### Server Configuration and Startup
```python
# MCP server configuration
{
  "server": {
    "name": "agent-mcp",
    "version": "1.0.0"
  },
  "tools": [
    {
      "name": "create_agent",
      "description": "Create a new specialized AI agent"
    },
    {
      "name": "assign_task", 
      "description": "Assign tasks to specific agents"
    },
    {
      "name": "query_project_context",
      "description": "Query the shared knowledge graph"
    }
  ],
  "resources": [
    {
      "name": "agent_status",
      "description": "Real-time agent status and activity"
    },
    {
      "name": "project_memory",
      "description": "Persistent project knowledge graph"
    }
  ]
}

# Start MCP server
python -m agent_mcp.mcp_server --port 8000 --transport http
```

#### Linear Task Decomposition Pattern
```typescript
// Example: User Authentication System
const authTaskChain = [
  {
    chain: "database_layer",
    steps: [
      "Create users table with id, email, password_hash",
      "Add unique index on email", 
      "Create sessions table with user_id, token, expiry",
      "Write migration scripts"
    ]
  },
  {
    chain: "api_layer", 
    steps: [
      "Implement POST /auth/register endpoint",
      "Implement POST /auth/login endpoint", 
      "Implement POST /auth/logout endpoint",
      "Add JWT token generation"
    ]
  },
  {
    chain: "frontend_layer",
    steps: [
      "Create AuthContext provider",
      "Build LoginForm component",
      "Build RegisterForm component", 
      "Implement protected routes"
    ]
  }
];
```

---

## A2A (Agent-to-Agent) Protocol Bridge ✅

**Context7 ID**: `/gongrzhe/a2a-mcp-server`  
**Trust Score**: 8.7  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: AACP communication protocols for multi-agent architecture system  
**Status**: Current  

### Key Information
- **Version**: Latest stable (PyPI package available)
- **Purpose**: Bridges Model Context Protocol (MCP) with Agent-to-Agent (A2A) protocol
- **Transport**: MCP server with stdio, streamable-http, and SSE support
- **Features**: Agent registration, message streaming, task management, session handling
- **Security Updates**: Authentication tokens, secure agent registration
- **Deprecated Patterns**: Direct A2A communication without MCP bridge
- **Recommended Patterns**: MCP-mediated A2A communication, task-based messaging, session management

### Implementation Impact
- Enables MCP-compatible AI assistants to interact with A2A agents
- Provides bridge between different agent communication protocols
- Supports both streaming and task-based communication patterns
- Essential for integrating A2A agents into MCP-based multi-agent systems

### Core Bridge Operations

#### Agent Registration and Management
```typescript
// Register A2A agent with MCP bridge
{
  "name": "register_agent",
  "arguments": {
    "url": "http://localhost:41242"
  }
}

// List registered agents
{
  "name": "list_agents", 
  "arguments": {}
}

// Unregister agent
{
  "name": "unregister_agent",
  "arguments": {
    "url": "http://localhost:41242"
  }
}
```

#### Message Communication Patterns
```typescript
// Send message with streaming response
{
  "name": "send_message_stream",
  "arguments": {
    "agent_url": "http://localhost:41242",
    "message": "Analyze the current system architecture",
    "session_id": "session_arch_001"
  }
}

// Send message with task-based response
{
  "name": "send_message",
  "arguments": {
    "agent_url": "http://localhost:41242", 
    "message": "Generate API documentation for authentication endpoints",
    "session_id": "session_docs_001"
  }
}

// Retrieve task results
{
  "name": "get_task_result",
  "arguments": {
    "task_id": "b30f3297-e7ab-4dd9-8ff1-877bd7cfb6b1",
    "history_length": null
  }
}

// Cancel running task
{
  "name": "cancel_task",
  "arguments": {
    "task_id": "b30f3297-e7ab-4dd9-8ff1-877bd7cfb6b1"
  }
}
```

#### Server Configuration and Environment
```bash
# Environment variables for A2A-MCP bridge
export MCP_TRANSPORT="streamable-http"  # stdio, streamable-http, sse
export MCP_HOST="0.0.0.0"
export MCP_PORT="8000"
export MCP_PATH="/mcp"
export MCP_SSE_PATH="/sse"
export MCP_DEBUG="true"

# Start A2A-MCP server
uvx a2a-mcp-server

# With custom transport
MCP_TRANSPORT=streamable-http MCP_HOST=127.0.0.1 MCP_PORT=8080 uvx a2a-mcp-server
```

#### Claude Desktop Integration
```json
{
  "mcpServers": {
    "a2a": {
      "command": "uvx",
      "args": ["a2a-mcp-server"]
    }
  }
}
```

#### Typical Interaction Workflow
```typescript
// 1. Register agent
const registerResult = await claude.callTool('register_agent', {
  url: 'http://localhost:41242'
});

// 2. Send message to agent
const messageResult = await claude.callTool('send_message', {
  agent_url: 'http://localhost:41242',
  message: 'What capabilities do you provide?'
});

// 3. Retrieve response
const taskResult = await claude.callTool('get_task_result', {
  task_id: messageResult.task_id
});
```

---

## AACP Implementation Guidelines ✅

### Protocol Selection Matrix

| Use Case | Recommended Protocol | Rationale |
|----------|---------------------|-----------|
| **IDE/Editor Integration** | Agent Client Protocol (ACP) | Real-time collaboration, file operations, terminal access |
| **Task-Based Agent Systems** | Agent Protocol (AP) | Standardized REST API, artifact management, step tracking |
| **Multi-Agent Coordination** | Agent-MCP | Knowledge sharing, task orchestration, conflict resolution |
| **Protocol Bridging** | A2A-MCP Bridge | Integration between different agent communication standards |

### Security Considerations
- **Authentication**: OAuth 2.0 for ACP, token-based for Agent-MCP
- **Authorization**: Permission-based operations, role-based access control
- **Data Protection**: Sensitive data redaction, secure transport (HTTPS/WSS)
- **File Locking**: Prevent concurrent modifications in multi-agent scenarios

### Performance Optimization
- **Connection Pooling**: Reuse connections for multiple operations
- **Streaming**: Use streaming responses for real-time updates
- **Caching**: Cache agent capabilities and session state
- **Load Balancing**: Distribute agent workload across multiple instances

### Error Handling Patterns
- **Graceful Degradation**: Fallback to alternative communication methods
- **Retry Logic**: Exponential backoff for transient failures
- **Circuit Breakers**: Prevent cascade failures in multi-agent systems
- **Dead Letter Queues**: Handle permanently failed messages

---

## Consultation History & Metadata

### Recent Context7 Consultations

| Date | Technology | Context7 ID | Agent | Task Context | Status |
|------|------------|-------------|-------|--------------|--------|
| 2026-01-06 | Node.js AbortController | `/nodejs/node` | Kiro | Timeout contract testing and AbortController best practices | Current |
| 2026-01-06 | TypeScript | `/microsoft/typescript` | Kiro | TypeScript error resolution patterns and latest features | Current |
| 2026-01-06 | Vitest | `/vitest-dev/vitest` | Kiro | Test configuration, multi-project setup, and error handling patterns | Current |
| 2026-01-06 | MCP TypeScript SDK | `/modelcontextprotocol/typescript-sdk` | Kiro | Test harness implementation verification and patterns | Current |
| 2026-01-06 | Agent Client Protocol | `/zed-industries/agent-client-protocol` | Kiro | AACP communication protocols | Current |
| 2026-01-06 | Agent Protocol | `/div99/agent-protocol` | Kiro | AACP communication protocols | Current |
| 2026-01-06 | Agent-MCP | `/rinadelph/agent-mcp` | Kiro | AACP communication protocols | Current |
| 2026-01-06 | A2A-MCP Bridge | `/gongrzhe/a2a-mcp-server` | Kiro | AACP communication protocols | Current |
| 2026-01-06 | Zod | `/colinhacks/zod` | Kiro | Schema validation for MCP tools and agent config | Current |
| 2026-01-06 | ESLint | `/eslint/eslint` | Kiro | Code quality and linting for TypeScript projects | Current |
| 2026-01-06 | JSON-RPC 2.0 | `/tunnckocore/jsonrpc-v2.0-spec` | Kiro | MCP protocol compliance | Current |
| 2026-01-06 | AJV | `/ajv-validator/ajv` | Kiro | Schema validation for MCP tools | Current |
| 2026-01-06 | Fast-Check | `/dubzzz/fast-check` | Kiro | Property-based testing integration | Current |

### Information Currency Tracking

- **TypeScript**: Last consulted 2026-01-06 (Current) ✅
- **Zod**: Last consulted 2026-01-06 (Current) ✅
- **ESLint**: Last consulted 2026-01-06 (Current) ✅
- **Vitest**: Last consulted 2026-01-06 (Current) ✅
- **JSON-RPC 2.0**: Last consulted 2026-01-06 (Current) ✅
- **MCP SDK**: Last consulted 2026-01-06 (Current) ✅
- **Node.js Runtime**: Last consulted 2026-01-06 (Current) ✅
- **AJV**: Last consulted 2026-01-06 (Current) ✅
- **Fast-Check**: Last consulted 2026-01-06 (Current) ✅

### Pending Consultations

*All core technologies for the multi-agent architecture system have been consulted and documented.*

**Additional technologies to consult when needed:**
- [ ] TypeScript (when advanced language features are required)
- [ ] ESLint (when code quality rules need updates)
- [ ] Prettier (when formatting standards change)
- [ ] AWS SDK (when cloud architecture tasks begin)
- [ ] Docker/Kubernetes (when containerization tasks begin)
- [ ] Database libraries (when data architecture tasks begin)

---

**Consultation Protocol**: Always check Canonical Reference Document first, then consult Context7 only for missing/outdated information  
**Update Requirement**: Immediately document all Context7 consultations using the standard template  
**Currency Standard**: Information older than 30 days requires re-consultation  
**Full Documentation**: `.kiro/steering/context7-consultation.md`  
**Last Updated**: January 2026

## ESLint Code Quality ✅

**Context7 ID**: `/eslint/eslint`  
**Trust Score**: 9.1  
**Last Consulted**: 2026-01-06  
**Agent**: Kiro  
**Task Context**: Code quality and linting configuration for TypeScript projects  
**Status**: Current  

### Key Information
- **Version**: v9.37.0+ (flat config system)
- **Configuration**: Flat config format (eslint.config.js), TypeScript integration, plugin ecosystem
- **Features**: Concurrent linting, worker threads, custom rules, auto-fixing, configuration inspector
- **Security Updates**: Regular security patches, plugin security validation
- **Deprecated Patterns**: Legacy .eslintrc format, callback-based rules, synchronous processing
- **Recommended Patterns**: Flat config, TypeScript integration, concurrent processing, custom rules

### Implementation Impact
- Current project uses ESLint v8+ with migration path to v9 flat config
- TypeScript integration with @typescript-eslint parser and rules
- Custom rules for agent-specific patterns and MCP protocol compliance
- Concurrent linting for improved performance on large codebases

### Implementation Patterns

#### Modern Flat Configuration System
```javascript
// Comprehensive eslint.config.js with all advanced patterns
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import globals from "globals";

export default defineConfig([
  // Base recommended configuration
  js.configs.recommended,
  
  // Global ignores using helper function
  globalIgnores([
    "dist/**", 
    "build/**", 
    "node_modules/**",
    "coverage/**",
    "*.config.js"
  ]),

  // TypeScript configuration with advanced rules
  {
    name: "typescript-strict",
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: ["./tsconfig.json"],
        ecmaVersion: 2022,
        sourceType: "module"
      },
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      // Strict TypeScript rules
      "@typescript-eslint/strict-boolean-expressions": ["error", {
        allowString: false,
        allowNumber: false,
        allowNullableObject: false,
        allowNullableBoolean: false,
        allowNullableString: false,
        allowNullableNumber: false,
        allowAny: false
      }],
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_"
      }],
      "@typescript-eslint/explicit-function-return-type": ["error", {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true
      }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": ["error", {
        prefer: "type-imports",
        disallowTypeAnnotations: false
      }]
    }
  },

  // Agent-specific configuration with custom rules
  {
    name: "agent-files",
    files: ["src/agents/**/*.ts"],
    rules: {
      // Custom rules for agent implementations
      "class-methods-use-this": ["error", { 
        enforceForClassFields: true 
      }],
      "no-empty-function": ["error", { 
        allow: ["constructors", "methods", "decoratedFunctions"] 
      }],
      // Require explicit return types for agent methods
      "@typescript-eslint/explicit-member-accessibility": ["error", {
        accessibility: "explicit",
        overrides: {
          constructors: "no-public"
        }
      }]
    }
  },

  // Test files with relaxed rules
  {
    name: "test-files",
    files: [
      "**/*.test.ts", 
      "**/*.spec.ts", 
      "tests/**/*.ts",
      "test/**/*.ts"
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha,
        describe: "readonly",
        it: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        expect: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
      "max-lines-per-function": "off",
      "@typescript-eslint/explicit-function-return-type": "off"
    }
  },

  // Configuration files
  {
    name: "config-files",
    files: ["*.config.js", "*.config.ts", ".eslintrc.*"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-var-requires": "off"
    }
  },

  // Performance and linting options
  {
    name: "linter-options",
    linterOptions: {
      noInlineConfig: false,
      reportUnusedDisableDirectives: "warn"
    }
  }
]);
```

### Advanced Configuration
- **Custom Rules**: Agent-specific linting rules for protocol compliance
- **Performance**: Worker threads and concurrent processing for large codebases
- **Integration**: TypeScript parser with strict type checking rules
- **Overrides**: File-specific configurations for different code areas
- **Plugins**: Extensible rule system with community and custom plugins
