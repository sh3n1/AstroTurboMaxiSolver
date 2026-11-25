import { describe, expect, it } from 'vitest';

import type { SolveAttempt } from './solve-log';
import { LOG_LENGTH, SolveLog } from './solve-log';

const attempt = (message: string): SolveAttempt => ({
  trigger: 'auto',
  startedAt: Date.now() - 1500,
  iso: 3200,
  frames: 1,
  outcome: 'failed',
  message,
});

describe('SolveLog', () => {
  it('puts the newest attempt first, with an id that counts up', () => {
    const log = new SolveLog();
    log.add(attempt('first'));
    log.add(attempt('second'));
    const [newest, older] = log.entries();
    expect(newest.message).toBe('second');
    expect(newest.id).toBeGreaterThan(older.id);
  });

  it('times an attempt from its start, and fills in what it left out', () => {
    const log = new SolveLog();
    log.add(attempt('timed'));
    const entry = log.entries()[0];
    expect(entry.durationMs).toBeGreaterThanOrEqual(1500);
    expect(entry.starCount).toBe(0);
    expect(entry.matched).toBe(0);
    expect(entry.sensorErrorDeg).toBeNull();
  });

  it('keeps only the latest attempts', () => {
    const log = new SolveLog();
    for (let i = 0; i < LOG_LENGTH + 5; i++) log.add(attempt(String(i)));
    expect(log.entries()).toHaveLength(LOG_LENGTH);
    expect(log.entries()[0].message).toBe(String(LOG_LENGTH + 4));
  });

  it("numbers the finder phone's attempts with this phone's own", () => {
    const log = new SolveLog();
    log.add(attempt('here'));
    const { id: _id, ...remote } = log.entries()[0];
    log.push({ ...remote, message: 'on the finder' });
    expect(log.entries()[0].message).toBe('on the finder');
    expect(log.entries()[0].id).toBe(2);
  });
});
