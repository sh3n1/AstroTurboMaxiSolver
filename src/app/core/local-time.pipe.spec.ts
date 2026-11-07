import { describe, expect, it } from 'vitest';

import { LocalTimePipe } from './local-time.pipe';

describe('local time', () => {
  const pipe = new LocalTimePipe();
  const date = new Date(2026, 10, 7, 21, 5, 9);

  it("shows times the way the phone's own settings do", () => {
    const expected = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
    expect(pipe.transform(date)).toBe(expected);
    expect(pipe.transform(date, 'time-seconds')).toContain('05');
    expect(pipe.transform(date, 'date-time')).toContain('7');
  });

  it('accepts saved dates as text, and shows nothing for a missing or bad one', () => {
    expect(pipe.transform(date.toISOString())).toBe(pipe.transform(date));
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform('not a date')).toBe('');
  });
});
