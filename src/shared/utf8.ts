/**
 * UTF-8 utility functions for accurate byte length calculation.
 *
 * This module provides utilities for working with UTF-8 encoded strings,
 * particularly for calculating the actual byte length of strings when
 * encoded as UTF-8, which is essential for payload size validation.
 */

/**
 * Calculate the UTF-8 byte length of a string.
 *
 * This function accurately calculates the number of bytes required to
 * represent a string when encoded as UTF-8. This is different from
 * string.length which returns the number of characters, not bytes.
 *
 * Multi-byte characters like emojis and non-ASCII characters will have
 * a byte length greater than their character length.
 *
 * @param str - The string to measure
 * @returns The number of bytes required to encode the string as UTF-8
 *
 * @example
 * ```typescript
 * getUtf8ByteLength('Hello')        // Returns: 5
 * getUtf8ByteLength('🚀')           // Returns: 4 (emoji is 4 bytes)
 * getUtf8ByteLength('你好')          // Returns: 6 (each Chinese char is 3 bytes)
 * getUtf8ByteLength('½ + ¼ = ¾')    // Returns: 12 (special chars are multi-byte)
 * ```
 */
export function getUtf8ByteLength(str: string): number {
  return Buffer.byteLength(str, 'utf8');
}
