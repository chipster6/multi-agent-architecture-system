import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Timeout Contract Working', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should abort signal on timeout', () => {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, 1000);

    vi.advanceTimersByTime(1000);

    expect(abortController.signal.aborted).toBe(true);
    clearTimeout(timeoutHandle);
  });
});