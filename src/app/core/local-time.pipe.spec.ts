import { describe, expect, it } from 'vitest';

import { LocalTimePipe } from './local-time.pipe';

describe('local time', () => {
  const pipe = new LocalTimePipe();
  const date = new Date(2026, 10, 7, 21, 5, 9);

  it("shows times in the app's language, with the phone's region where it speaks it", () => {
    // The tests run in English: see test-setup.ts. A phone in Britain would give en-GB here.
    const expected = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date);
    expect(pipe.transform(date)).toBe(expected);
    expect(pipe.transform(date, 'time-seconds')).toContain('05');
    expect(pipe.transform(date, 'date-time')).toContain('7');
  });

  it('adds a two-digit year to dates in another year, and only to dates', () => {
    const thisYear = new Date();
    thisYear.setMonth(0, 15);
    const nextYear = new Date(thisYear.getFullYear() + 1, 0, 15, 21, 5);
    const twoDigits = String(nextYear.getFullYear()).slice(2);
    expect(pipe.transform(thisYear, 'date')).not.toContain(String(thisYear.getFullYear()).slice(2));
    for (const format of ['date', 'day', 'date-time'] as const) {
      expect(pipe.transform(nextYear, format)).toContain(twoDigits);
      expect(pipe.transform(nextYear, format)).not.toContain(String(nextYear.getFullYear()));
    }
    expect(pipe.transform(nextYear, 'time')).not.toContain(twoDigits);
  });

  it('accepts saved dates as text, and shows nothing for a missing or bad one', () => {
    expect(pipe.transform(date.toISOString())).toBe(pipe.transform(date));
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform('not a date')).toBe('');
  });
});
