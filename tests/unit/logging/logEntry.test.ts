/**
 * Unit tests for LogEntry interface validation.
 * 
 * Tests ensure the interface supports all required fields,
 * optional fields, and extensible properties while maintaining
 * JSON serializability for MCP protocol compatibility.
 */

import { describe, it, expect } from 'vitest';
import type { LogEntry } from '../../../src/logging/structuredLogger.js';

describe('LogEntry Interface', () => {
  it('should support required fields', () => {
    const logEntry: LogEntry = {
      timestamp: '2024-01-15T10:30:00.000Z',
      level: 'info',
      message: 'Test log message'
    };

    expect(logEntry.timestamp).toBe('2024-01-15T10:30:00.000Z');
    expect(logEntry.level).toBe('info');
    expect(logEntry.message).toBe('Test log message');
  });

  it('should support optional fields', () => {
    const logEntry: LogEntry = {
      timestamp: '2024-01-15T10:30:00.000Z',
      level: 'error',
      message: 'Operation failed',
      correlationId: 'req-123',
      runId: 'run-456',
      durationMs: 150,
      error: {
        name: 'ValidationError',
        message: 'Invalid input',
        stack: 'Error: Invalid input\n    at validate...',
        code: 'INVALID_ARGUMENT'
      }
    };

    expect(logEntry.correlationId).toBe('req-123');
    expect(logEntry.runId).toBe('run-456');
    expect(logEntry.durationMs).toBe(150);
    expect(logEntry.error?.name).toBe('ValidationError');
    expect(logEntry.error?.code).toBe('INVALID_ARGUMENT');
  });

  it('should support extensible fields', () => {
    const logEntry: LogEntry = {
      timestamp: '2024-01-15T10:30:00.000Z',
      level: 'debug',
      message: 'Agent processing started',
      agentId: 'requirements-analyzer',
      phase: 'strategic-design',
      toolName: 'analyze-requirements',
      resourceUsage: {
        memoryMB: 128,
        cpuPercent: 15
      }
    };

    expect(logEntry.agentId).toBe('requirements-analyzer');
    expect(logEntry.phase).toBe('strategic-design');
    expect(logEntry.toolName).toBe('analyze-requirements');
    expect(logEntry.resourceUsage).toEqual({
      memoryMB: 128,
      cpuPercent: 15
    });
  });

  it('should be JSON serializable', () => {
    const logEntry: LogEntry = {
      timestamp: '2024-01-15T10:30:00.000Z',
      level: 'warn',
      message: 'Performance threshold exceeded',
      correlationId: 'req-789',
      durationMs: 5000,
      agentId: 'performance-monitor',
      thresholdMs: 3000
    };

    const serialized = JSON.stringify(logEntry);
    const deserialized = JSON.parse(serialized) as LogEntry;

    expect(deserialized.timestamp).toBe(logEntry.timestamp);
    expect(deserialized.level).toBe(logEntry.level);
    expect(deserialized.message).toBe(logEntry.message);
    expect(deserialized.correlationId).toBe(logEntry.correlationId);
    expect(deserialized.durationMs).toBe(logEntry.durationMs);
    expect(deserialized.agentId).toBe(logEntry.agentId);
    expect(deserialized.thresholdMs).toBe(logEntry.thresholdMs);
  });

  it('should support all log levels', () => {
    const levels: Array<LogEntry['level']> = ['debug', 'info', 'warn', 'error'];
    
    levels.forEach(level => {
      const logEntry: LogEntry = {
        timestamp: '2024-01-15T10:30:00.000Z',
        level,
        message: `Test ${level} message`
      };
      
      expect(logEntry.level).toBe(level);
    });
  });

  it('should handle undefined optional fields gracefully', () => {
    const logEntry: LogEntry = {
      timestamp: '2024-01-15T10:30:00.000Z',
      level: 'info',
      message: 'Simple log entry',
      correlationId: undefined,
      runId: undefined,
      durationMs: undefined,
      error: undefined
    };

    expect(logEntry.correlationId).toBeUndefined();
    expect(logEntry.runId).toBeUndefined();
    expect(logEntry.durationMs).toBeUndefined();
    expect(logEntry.error).toBeUndefined();
  });
});