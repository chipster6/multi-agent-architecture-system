/**
 * Clock utilities for the MCP server.
 * Provides time-related functionality with support for deterministic testing
 * through dependency injection.
 */

/**
 * Interface for time-related operations.
 * Allows injection of different clock implementations for testing.
 */
export interface Clock {
  /**
   * Get the current time as a Date object.
   * @returns Current Date
   */
  now(): Date;

  /**
   * Get the current time as an ISO 8601 timestamp string.
   * @returns ISO 8601 timestamp (e.g., "2024-01-15T10:30:00.000Z")
   */
  timestamp(): string;
}

/**
 * Production clock implementation using system time.
 * Uses the actual system clock for real-time operations.
 */
export class SystemClock implements Clock {
  /**
   * Get the current system time.
   * @returns Current Date
   */
  now(): Date {
    return new Date();
  }

  /**
   * Get the current system time as ISO 8601 timestamp.
   * @returns ISO 8601 timestamp string
   */
  timestamp(): string {
    return new Date().toISOString();
  }
}

/**
 * Fixed clock implementation for testing.
 * Always returns the same fixed time for deterministic tests.
 */
export class FixedClock implements Clock {
  constructor(private readonly fixedTime: Date) {}

  /**
   * Get the fixed time.
   * @returns Fixed Date
   */
  now(): Date {
    return new Date(this.fixedTime);
  }

  /**
   * Get the fixed time as ISO 8601 timestamp.
   * @returns ISO 8601 timestamp string
   */
  timestamp(): string {
    return this.fixedTime.toISOString();
  }

  /**
   * Update the fixed time.
   * @param newTime - New fixed time
   */
  setTime(newTime: Date): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    (this.fixedTime as Date) = newTime;
  }
}

/**
 * Controllable clock implementation for testing.
 * Allows manual advancement of time for testing time-dependent behavior.
 */
export class ControllableClock implements Clock {
  private currentTime: Date;

  constructor(initialTime: Date = new Date()) {
    this.currentTime = new Date(initialTime);
  }

  /**
   * Get the current controlled time.
   * @returns Current Date
   */
  now(): Date {
    return new Date(this.currentTime);
  }

  /**
   * Get the current controlled time as ISO 8601 timestamp.
   * @returns ISO 8601 timestamp string
   */
  timestamp(): string {
    return this.currentTime.toISOString();
  }

  /**
   * Advance the clock by the specified number of milliseconds.
   * @param milliseconds - Number of milliseconds to advance
   */
  advance(milliseconds: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + milliseconds);
  }

  /**
   * Set the clock to a specific time.
   * @param time - New time to set
   */
  setTime(time: Date): void {
    this.currentTime = new Date(time);
  }

  /**
   * Reset the clock to the initial time.
   * @param initialTime - Optional new initial time (defaults to current system time)
   */
  reset(initialTime?: Date): void {
    this.currentTime = new Date(initialTime ?? new Date());
  }
}

/**
 * Create a production clock instance.
 * @returns SystemClock instance
 */
export function createClock(): Clock {
  return new SystemClock();
}

/**
 * Create a fixed clock for testing.
 * @param fixedTime - Fixed time to use (defaults to epoch)
 * @returns FixedClock instance
 */
export function createFixedClock(fixedTime?: Date): FixedClock {
  return new FixedClock(fixedTime ?? new Date('2024-01-15T10:30:00.000Z'));
}

/**
 * Create a controllable clock for testing.
 * @param initialTime - Initial time (defaults to current system time)
 * @returns ControllableClock instance
 */
export function createControllableClock(initialTime?: Date): ControllableClock {
  return new ControllableClock(initialTime);
}