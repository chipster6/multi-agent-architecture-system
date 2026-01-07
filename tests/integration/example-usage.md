# Test Harness Usage Example

This document shows how to use the test harness exports in integration tests.

## Basic Usage

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startTestServer,
  initializeTestServer,
  sendToolsCall,
  assertLogContains,
  type TestServerInstance
} from '../helpers/index.js';

describe('Example Integration Test', () => {
  let testServer: TestServerInstance;

  beforeEach(async () => {
    // Start test server with optional configuration
    testServer = await startTestServer({
      tools: {
        defaultTimeoutMs: 15000,
        maxPayloadBytes: 512000,
      }
    });
  });

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
    }
  });

  it('should handle complete MCP workflow', async () => {
    // Initialize server (handles initialize + initialized sequence)
    await initializeTestServer(testServer);
    
    // Call a tool
    const response = await testServer.sendRequest(
      sendToolsCall('health', {})
    );
    
    expect(response.result).toBeDefined();
    expect(response.result.isError).toBe(false);
    
    // Assert logs contain expected content
    const logs = testServer.getLogs();
    expect(assertLogContains(logs, 'info', 'Tool execution completed')).toBe(true);
  });
});
```

## Available Exports

### Core Interfaces
- `JsonRpcRequest` - JSON-RPC request structure
- `JsonRpcResponse` - JSON-RPC response structure  
- `JsonRpcNotification` - JSON-RPC notification structure
- `CapturedLogEntry` - Log entry captured from stderr
- `TestServerInstance` - Test server interface

### Main Functions
- `startTestServer(config?, options?)` - Start test server with optional config
- `initializeTestServer(server, clientInfo?)` - Complete initialization workflow

### JSON-RPC Helpers
- `sendInitialize(clientInfo?)` - Create initialize request
- `sendInitialized()` - Create initialized notification
- `sendToolsList()` - Create tools/list request
- `sendToolsCall(name, args?, meta?)` - Create tools/call request

### Validation Functions
- `validateJsonRpcResponse(response)` - Validate response structure
- `validateJsonRpcError(error)` - Validate error structure

### Log Utilities
- `assertLogContains(logs, level, pattern, contextAssertions?)` - Assert log content
- `waitForLog(server, level, pattern, timeout?)` - Wait for specific log entry

## Deterministic Testing

```typescript
import { ControllableClock, DeterministicIdGenerator } from '../../src/shared/index.js';

const clock = new ControllableClock(new Date('2024-01-15T10:30:00.000Z'));
const idGenerator = new DeterministicIdGenerator();

const testServer = await startTestServer(undefined, {
  clock,
  idGenerator,
  deterministic: true
});
```

## Configuration Overrides

```typescript
const testServer = await startTestServer({
  server: {
    name: 'test-server',
    version: '1.0.0-test'
  },
  tools: {
    defaultTimeoutMs: 10000,
    maxPayloadBytes: 256000,
    adminRegistrationEnabled: true
  },
  resources: {
    maxConcurrentExecutions: 5
  },
  logging: {
    level: 'debug'
  }
});
```