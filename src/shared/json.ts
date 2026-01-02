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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return JSON.stringify(value) ?? null;
  } catch (_error) {
    // JSON.stringify can throw for various reasons:
    // - Circular references (TypeError: Converting circular structure to JSON)
    // - BigInt values (TypeError: Do not know how to serialize a BigInt)
    // - Other non-serializable values
    return null;
  }
}
