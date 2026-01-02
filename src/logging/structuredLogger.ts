/**
 * Structured logging implementation for the Multi-Agent Architecture Design System.
 * 
 * This module provides structured logging capabilities that support:
 * - JSON output for MCP protocol compatibility (stderr only)
 * - Correlation tracking across agent interactions
 * - Performance monitoring with duration tracking
 * - Error context preservation
 * - Extensible fields for agent-specific metadata
 * - Deterministic testing via Clock injection
 * 
 * Based on latest TypeScript 5.9+ patterns and structured logging best practices.
 */

/**
 * Clock interface for timestamp generation.
 * Enables deterministic testing by allowing clock injection.
 */
export interface Clock {
  /**
   * Returns the current time as an ISO 8601 string.
   * 
   * @returns ISO 8601 timestamp string
   * @example '2024-01-15T10:30:00.000Z'
   */
  now(): string;
}

/**
 * Default system clock implementation using Date.
 */
export class SystemClock implements Clock {
  /**
   * Returns the current system time as an ISO 8601 string.
   * 
   * @returns Current system time in ISO 8601 format
   */
  now(): string {
    return new Date().toISOString();
  }
}

/**
 * Log entry interface supporting structured logging with JSON output.
 * 
 * Required fields provide core logging functionality while optional fields
 * support advanced features like correlation tracking, performance monitoring,
 * and error context. The interface uses an index signature to allow
 * extensible fields for agent-specific metadata.
 * 
 * @example
 * ```typescript
 * const logEntry: LogEntry = {
 *   timestamp: '2024-01-15T10:30:00.000Z',
 *   level: 'info',
 *   message: 'Agent coordination started',
 *   correlationId: 'req-123',
 *   runId: 'run-456',
 *   durationMs: 150,
 *   agentId: 'requirements-analyzer',
 *   phase: 'strategic-design'
 * };
 * ```
 */
export interface LogEntry {
  /**
   * ISO 8601 timestamp when the log entry was created.
   * Generated via injected Clock interface for deterministic testing.
   * 
   * @example '2024-01-15T10:30:00.000Z'
   */
  timestamp: string;

  /**
   * Log severity level following standard logging conventions.
   * Used for filtering and routing log messages.
   */
  level: 'debug' | 'info' | 'warn' | 'error';

  /**
   * Human-readable log message describing the event.
   * Should be descriptive but concise for operational clarity.
   */
  message: string;

  /**
   * Optional correlation ID for tracking related operations across
   * agent interactions and tool invocations. Enables distributed tracing
   * in multi-agent workflows.
   * 
   * @example 'req-abc123' for request-scoped correlation
   */
  correlationId?: string;

  /**
   * Optional run ID for tracking individual tool or agent invocations.
   * Provides fine-grained traceability within correlated operations.
   * 
   * @example 'run-def456' for specific tool execution
   */
  runId?: string;

  /**
   * Optional duration in milliseconds for performance monitoring.
   * Used to track operation timing and identify performance bottlenecks
   * in agent coordination and tool execution.
   */
  durationMs?: number;

  /**
   * Optional error object for capturing exception context.
   * Preserves error details while maintaining JSON serializability.
   * Should be sanitized to remove sensitive information.
   */
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };

  /**
   * Extensible fields for agent-specific metadata and context.
   * Allows agents to include domain-specific information while
   * maintaining type safety for core logging fields.
   * 
   * Common extensions:
   * - agentId: string - Identifying the source agent
   * - phase: string - Architecture design phase
   * - toolName: string - Name of executed tool
   * - resourceUsage: object - Performance metrics
   * - securityContext: object - Security-related metadata
   * 
   * All extension values must be JSON-serializable.
   */
  [key: string]: unknown;
}

/**
 * Context object for additional logging metadata.
 * Provides type-safe way to pass optional context to logging methods.
 */
export interface LogContext {
  /**
   * Optional correlation ID for tracking related operations.
   */
  correlationId?: string;

  /**
   * Optional run ID for tracking individual operations.
   */
  runId?: string;

  /**
   * Optional duration in milliseconds for performance monitoring.
   */
  durationMs?: number;

  /**
   * Optional error object for error logging.
   */
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };

  /**
   * Additional extensible fields for agent-specific metadata.
   * All values must be JSON-serializable.
   */
  [key: string]: unknown;
}

/**
 * Structured logger implementation with JSON output to stderr.
 * 
 * Provides four logging levels (debug, info, warn, error) with structured
 * JSON output. Uses injected Clock for deterministic timestamp generation
 * and ensures copy-on-write semantics to prevent mutation of input data.
 * 
 * All log output goes to stderr to preserve stdout for MCP protocol communication.
 * 
 * @example
 * ```typescript
 * const logger = new StructuredLogger(new SystemClock());
 * 
 * logger.info('Server started', { 
 *   correlationId: 'req-123',
 *   port: 3000 
 * });
 * 
 * logger.error('Database connection failed', {
 *   error: {
 *     name: 'ConnectionError',
 *     message: 'Connection timeout',
 *     code: 'ETIMEDOUT'
 *   }
 * });
 * ```
 */
export class StructuredLogger {
  private readonly clock: Clock;
  
  /**
   * Default denylist of sensitive keys that should be redacted from log output.
   * These keys are matched case-insensitively and recursively through nested objects.
   * 
   * @private
   */
  private readonly defaultRedactKeys: string[] = [
    'token',
    'key', 
    'secret',
    'password',
    'apikey',
    'api_key',
    'authorization',
    'bearer',
    'session',
    'cookie'
  ];
  
  /**
   * Configurable denylist of sensitive keys for redaction.
   * Defaults to common sensitive field names but can be customized.
   * 
   * @private
   */
  private readonly redactKeys: Set<string>;
  
  /**
   * Original redact keys with their original casing for inheritance.
   * 
   * @private
   */
  private readonly originalRedactKeys: string[];

  /**
   * Creates a new StructuredLogger instance.
   * 
   * @param clock Clock implementation for timestamp generation
   * @param customRedactKeys Optional array of additional sensitive keys to redact
   */
  constructor(clock: Clock, customRedactKeys?: string[]) {
    this.clock = clock;
    
    // Store original keys for inheritance
    this.originalRedactKeys = [
      ...this.defaultRedactKeys,
      ...(customRedactKeys ?? [])
    ];
    
    // Create case-insensitive set of redact keys
    this.redactKeys = new Set(this.originalRedactKeys.map(key => key.toLowerCase()));
  }

  /**
   * Logs a debug message with optional context.
   * Debug messages are typically used for detailed diagnostic information
   * that is only of interest when diagnosing problems.
   * 
   * @param message Human-readable log message
   * @param context Optional context object with additional metadata
   * 
   * @example
   * ```typescript
   * logger.debug('Processing agent request', {
   *   agentId: 'requirements-analyzer',
   *   correlationId: 'req-123'
   * });
   * ```
   */
  debug(message: string, context?: LogContext): void {
    this.writeLogEntry('debug', message, context);
  }

  /**
   * Logs an info message with optional context.
   * Info messages are used for general information about system operation
   * and significant events that are part of normal processing.
   * 
   * @param message Human-readable log message
   * @param context Optional context object with additional metadata
   * 
   * @example
   * ```typescript
   * logger.info('Agent coordination completed', {
   *   correlationId: 'req-123',
   *   durationMs: 1500,
   *   agentCount: 5
   * });
   * ```
   */
  info(message: string, context?: LogContext): void {
    this.writeLogEntry('info', message, context);
  }

  /**
   * Logs a warning message with optional context.
   * Warning messages indicate potentially harmful situations or
   * recoverable errors that don't prevent system operation.
   * 
   * @param message Human-readable log message
   * @param context Optional context object with additional metadata
   * 
   * @example
   * ```typescript
   * logger.warn('Agent response time exceeded threshold', {
   *   agentId: 'security-analyzer',
   *   durationMs: 5000,
   *   threshold: 3000
   * });
   * ```
   */
  warn(message: string, context?: LogContext): void {
    this.writeLogEntry('warn', message, context);
  }

  /**
   * Logs an error message with optional context.
   * Error messages indicate serious problems that prevent normal
   * system operation and require attention.
   * 
   * @param message Human-readable log message
   * @param context Optional context object with additional metadata
   * 
   * @example
   * ```typescript
   * logger.error('Agent execution failed', {
   *   agentId: 'data-architect',
   *   correlationId: 'req-123',
   *   error: {
   *     name: 'ValidationError',
   *     message: 'Invalid schema provided',
   *     code: 'SCHEMA_INVALID'
   *   }
   * });
   * ```
   */
  error(message: string, context?: LogContext): void {
    this.writeLogEntry('error', message, context);
  }

  /**
   * Redacts sensitive information from an object using configurable denylist keys.
   * 
   * Performs case-insensitive matching against the configured redact keys and
   * recursively processes nested objects and arrays. Uses copy-on-write semantics
   * to ensure the original object is never mutated. Handles circular references
   * by tracking visited objects.
   * 
   * @param obj Object to redact sensitive information from
   * @param visited Set of visited objects to handle circular references
   * @returns New object with sensitive values replaced with "[REDACTED]"
   * 
   * @example
   * ```typescript
   * const logger = new StructuredLogger(new SystemClock());
   * 
   * const sensitiveData = {
   *   username: 'john.doe',
   *   password: 'secret123',
   *   config: {
   *     apiKey: 'abc-123-def',
   *     timeout: 5000
   *   },
   *   tokens: ['token1', 'token2']
   * };
   * 
   * const redacted = logger.redact(sensitiveData);
   * // Result: {
   * //   username: 'john.doe',
   * //   password: '[REDACTED]',
   * //   config: {
   * //     apiKey: '[REDACTED]',
   * //     timeout: 5000
   * //   },
   * //   tokens: '[REDACTED]'
   * // }
   * ```
   */
  redact(obj: unknown, visited: WeakSet<object> = new WeakSet()): unknown {
    // Handle null, undefined, and primitive types
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj !== 'object') {
      return obj;
    }
    
    // Handle circular references
    if (visited.has(obj)) {
      return '[CIRCULAR]';
    }
    
    // Mark object as visited
    visited.add(obj);
    
    // Handle arrays recursively
    if (Array.isArray(obj)) {
      return obj.map(item => this.redact(item, visited));
    }
    
    // Handle objects recursively
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Check if key should be redacted (case-insensitive)
      if (this.redactKeys.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else {
        // Recursively redact nested values
        result[key] = this.redact(value, visited);
      }
    }
    
    return result;
  }

  /**
   * Creates a child logger with inherited context and clock.
   * 
   * Child loggers inherit the parent's clock instance and merge parent context
   * with new context using copy-on-write semantics. The parent logger remains
   * unmodified, ensuring immutability. Child loggers support all logging methods
   * (debug/info/warn/error) and can create their own child loggers.
   * 
   * @param context Optional context object to merge with parent context
   * @returns New StructuredLogger instance with inherited clock and merged context
   * 
   * @example
   * ```typescript
   * const parentLogger = new StructuredLogger(new SystemClock());
   * 
   * const childLogger = parentLogger.child({
   *   correlationId: 'req-123',
   *   agentId: 'requirements-analyzer'
   * });
   * 
   * childLogger.info('Processing request', { phase: 'strategic-design' });
   * // Output includes both parent and child context
   * ```
   */
  child(context?: LogContext): StructuredLogger {
    // Create new child logger with inherited clock and redact keys
    const childLogger = new StructuredLogger(
      this.clock, 
      this.originalRedactKeys.slice(this.defaultRedactKeys.length) // Only pass custom keys
    );
    
    // Store merged context for child logger if context is provided
    if (context) {
      // Create copy-on-write merged context
      const mergedContext = { ...context };
      
      // Override writeLogEntry to include merged context
      const originalWriteLogEntry = childLogger.writeLogEntry.bind(childLogger);
      childLogger.writeLogEntry = function(
        level: LogEntry['level'],
        message: string,
        additionalContext?: LogContext
      ): void {
        // Merge parent context, child context, and additional context
        // Later contexts override earlier ones (right-to-left precedence)
        const finalContext = {
          ...mergedContext,
          ...(additionalContext ? { ...additionalContext } : {})
        };
        
        originalWriteLogEntry(level, message, finalContext);
      };
    }
    
    return childLogger;
  }

  /**
   * Sanitizes control characters in all string leaf values within an object.
   * 
   * Recursively processes objects and arrays to escape control characters in all
   * string values. Uses copy-on-write semantics to ensure the original object
   * is never mutated. Handles circular references by tracking visited objects.
   * Control characters are escaped as follows:
   * - \n (newline) → \\n
   * - \r (carriage return) → \\r  
   * - \t (tab) → \\t
   * - \u0000-\u001F (control characters) → \\uXXXX format
   * 
   * @param obj Object to sanitize string values in
   * @param visited Set of visited objects to handle circular references
   * @returns New object with sanitized string values
   * 
   * @example
   * ```typescript
   * const logger = new StructuredLogger(new SystemClock());
   * 
   * const unsafeData = {
   *   message: 'Line 1\nLine 2\tTabbed',
   *   metadata: {
   *     control: 'Bell\u0007Sound',
   *     array: ['Item\r1', 'Item\u00022']
   *   }
   * };
   * 
   * const sanitized = logger.sanitize(unsafeData);
   * // Result: {
   * //   message: 'Line 1\\nLine 2\\tTabbed',
   * //   metadata: {
   * //     control: 'Bell\\u0007Sound',
   * //     array: ['Item\\r1', 'Item\\u00022']
   * //   }
   * // }
   * ```
   */
  sanitize(obj: unknown, visited: WeakSet<object> = new WeakSet()): unknown {
    // Handle null, undefined, and primitive non-string types
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    // Handle string values - escape control characters
    if (typeof obj === 'string') {
      // eslint-disable-next-line no-control-regex
      return obj.replace(/[\u0000-\u001F]/g, (char) => {
        switch (char) {
          case '\n':
            return '\\n';
          case '\r':
            return '\\r';
          case '\t':
            return '\\t';
          default: {
            // Escape other control characters as \uXXXX
            const charCode = char.charCodeAt(0);
            return '\\u' + charCode.toString(16).padStart(4, '0');
          }
        }
      });
    }
    
    // Handle non-object types (numbers, booleans, etc.)
    if (typeof obj !== 'object') {
      return obj;
    }
    
    // Handle circular references
    if (visited.has(obj)) {
      return '[CIRCULAR]';
    }
    
    // Mark object as visited
    visited.add(obj);
    
    // Handle arrays recursively
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitize(item, visited));
    }
    
    // Handle objects recursively
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize both key and value
      const sanitizedKey = typeof key === 'string' ? this.sanitize(key, visited) as string : key;
      result[sanitizedKey] = this.sanitize(value, visited);
    }
    
    return result;
  }

  /**
   * Creates and writes a log entry to stderr as JSON.
   * 
   * Implements copy-on-write semantics by creating a new log entry object
   * without mutating the input context. All log output goes to stderr to
   * preserve stdout for MCP protocol communication. Applies both redaction
   * to remove sensitive information and sanitization to escape control 
   * characters in all string values before output.
   * 
   * @private
   * @param level Log severity level
   * @param message Human-readable log message
   * @param context Optional context object with additional metadata
   */
  private writeLogEntry(
    level: LogEntry['level'],
    message: string,
    context?: LogContext
  ): void {
    // Create log entry with copy-on-write semantics
    const logEntry: LogEntry = {
      timestamp: this.clock.now(),
      level,
      message,
      // Spread context to avoid mutation of input object
      ...(context ? { ...context } : {})
    };

    // Apply redaction first to remove sensitive information
    const redactedLogEntry = this.redact(logEntry) as LogEntry;

    // Apply sanitization to escape control characters in all string values
    const sanitizedLogEntry = this.sanitize(redactedLogEntry) as LogEntry;

    // Output JSON to stderr only (stdout reserved for MCP protocol)
    const jsonOutput = JSON.stringify(sanitizedLogEntry);
    process.stderr.write(jsonOutput + '\n');
  }
}