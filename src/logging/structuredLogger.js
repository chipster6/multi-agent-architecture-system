"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StructuredLogger = exports.SystemClock = void 0;
/**
 * Default system clock implementation using Date.
 */
class SystemClock {
    /**
     * Returns the current system time as an ISO 8601 string.
     *
     * @returns Current system time in ISO 8601 format
     */
    now() {
        return new Date().toISOString();
    }
}
exports.SystemClock = SystemClock;
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
class StructuredLogger {
    /**
     * Creates a new StructuredLogger instance.
     *
     * @param clock Clock implementation for timestamp generation
     * @param customRedactKeys Optional array of additional sensitive keys to redact
     */
    constructor(clock, customRedactKeys) {
        /**
         * Default denylist of sensitive keys that should be redacted from log output.
         * These keys are matched case-insensitively and recursively through nested objects.
         *
         * @private
         */
        this.defaultRedactKeys = [
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
        this.clock = clock;
        // Store original keys for inheritance
        this.originalRedactKeys = [
            ...this.defaultRedactKeys,
            ...(customRedactKeys || [])
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
    debug(message, context) {
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
    info(message, context) {
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
    warn(message, context) {
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
    error(message, context) {
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
    redact(obj, visited = new WeakSet()) {
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
        try {
            // Handle arrays recursively
            if (Array.isArray(obj)) {
                return obj.map(item => this.redact(item, visited));
            }
            // Handle objects recursively
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                // Check if key should be redacted (case-insensitive)
                if (this.redactKeys.has(key.toLowerCase())) {
                    result[key] = '[REDACTED]';
                }
                else {
                    // Recursively redact nested values
                    result[key] = this.redact(value, visited);
                }
            }
            return result;
        }
        finally {
            // Clean up to prevent memory leaks
            visited.delete(obj);
        }
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
    child(context) {
        // Create new child logger with inherited clock and redact keys
        const childLogger = new StructuredLogger(this.clock, this.originalRedactKeys.slice(this.defaultRedactKeys.length) // Only pass custom keys
        );
        // Store merged context for child logger if context is provided
        if (context) {
            // Create copy-on-write merged context
            const mergedContext = { ...context };
            // Override writeLogEntry to include merged context
            const originalWriteLogEntry = childLogger.writeLogEntry.bind(childLogger);
            childLogger.writeLogEntry = function (level, message, additionalContext) {
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
    sanitize(obj, visited = new WeakSet()) {
        // Handle null, undefined, and primitive non-string types
        if (obj === null || obj === undefined) {
            return obj;
        }
        // Handle string values - escape control characters
        if (typeof obj === 'string') {
            return obj.replace(/[\u0000-\u001F]/g, (char) => {
                switch (char) {
                    case '\n':
                        return '\\n';
                    case '\r':
                        return '\\r';
                    case '\t':
                        return '\\t';
                    default:
                        // Escape other control characters as \uXXXX
                        const charCode = char.charCodeAt(0);
                        return '\\u' + charCode.toString(16).padStart(4, '0');
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
        try {
            // Handle arrays recursively
            if (Array.isArray(obj)) {
                return obj.map(item => this.sanitize(item, visited));
            }
            // Handle objects recursively
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                // Sanitize both key and value
                const sanitizedKey = typeof key === 'string' ? this.sanitize(key, visited) : key;
                result[sanitizedKey] = this.sanitize(value, visited);
            }
            return result;
        }
        finally {
            // Clean up to prevent memory leaks
            visited.delete(obj);
        }
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
    writeLogEntry(level, message, context) {
        // Create log entry with copy-on-write semantics
        const logEntry = {
            timestamp: this.clock.now(),
            level,
            message,
            // Spread context to avoid mutation of input object
            ...(context ? { ...context } : {})
        };
        // Apply redaction first to remove sensitive information
        const redactedLogEntry = this.redact(logEntry);
        // Apply sanitization to escape control characters in all string values
        const sanitizedLogEntry = this.sanitize(redactedLogEntry);
        // Output JSON to stderr only (stdout reserved for MCP protocol)
        const jsonOutput = JSON.stringify(sanitizedLogEntry);
        process.stderr.write(jsonOutput + '\n');
    }
}
exports.StructuredLogger = StructuredLogger;
