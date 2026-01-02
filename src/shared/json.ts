/**
 * Safe JSON stringification utility
 *
 * Provides a safe wrapper around JSON.stringify that returns null
 * instead of throwing errors for non-serializable values.
 */

/**
 * Safely stringify a value to JSON, returning null if not serializable
 *
 * This function attempts to serialize a value using JSON.stringify and
 * returns null if the value cannot be serialized (e.g., circular references,
 * BigInt values, functions, undefined, symbols, etc.).
 *
 * @param value - The value to stringify
 * @returns The JSON string representation, or null if not serializable
 *
 * @example
 * ```typescript
 * safeStringify({ name: "test" }); // '{"name":"test"}'
 * safeStringify(undefined); // null
 * safeStringify(BigInt(123)); // null
 *
 * const circular = { a: 1 };
 * circular.self = circular;
 * safeStringify(circular); // null
 * ```
 */
export function safeStringify(value: unknown): string | null {
  try {
    const result = JSON.stringify(value);
    // JSON.stringify returns undefined for certain values like undefined, functions, symbols
    // We should return null for these cases as they are not serializable to JSON strings
    return result === undefined ? null : result;
  } catch (error) {
    // JSON.stringify can throw for various reasons:
    // - Circular references (TypeError: Converting circular structure to JSON)
    // - BigInt values (TypeError: Do not know how to serialize a BigInt)
    // - Other non-serializable values
    return null;
  }
}
