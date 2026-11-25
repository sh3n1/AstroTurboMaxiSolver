import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitWhile } from './wait-while';

describe('waitWhile', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves at once when nothing is under way', async () => {
    const busy = vi.fn(() => false);
    await waitWhile(busy, 1000);
    expect(busy).toHaveBeenCalledTimes(1);
  });

  it('waits until the work ends', async () => {
    let busy = true;
    let done = false;
    void waitWhile(() => busy, 10_000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(500);
    expect(done).toBe(false);
    busy = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toBe(true);
  });

  it('gives up after the limit, even if still busy', async () => {
    let done = false;
    void waitWhile(() => true, 1000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(900);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toBe(true);
  });
});
