import { describe, expect, it } from 'vitest';

import type { LogConditions, LogEntry } from './observing-log';
import {
  exportLogCsv,
  exportLogJson,
  groupByNight,
  logTotals,
  mergeEntries,
  newEntry,
  nightKey,
  ordinal,
  parseLogJson,
  seenStates,
  timesSeen,
} from './observing-log';

const CONDITIONS: LogConditions = {
  latitudeDeg: 39.47,
  longitudeDeg: -0.376,
  altDeg: 52.4,
  bortle: 8,
  moonLitPercent: 12.3,
  moonAltDeg: -20,
  equipment: {
    telescopeType: 'newtonian',
    telescopeFocalMm: 650,
    telescopeApertureMm: 130,
    eyepieceFocalMm: 25,
    eyepieceFieldDeg: 52,
  },
};

/** An entry at a local time, for the tests. */
function entry(targetId: string, time: Date, rating: LogEntry['rating'] = 3, extra: Partial<LogEntry> = {}): LogEntry {
  return { ...newEntry({ id: targetId, name: `Name of ${targetId}` }, time, CONDITIONS), rating, ...extra };
}

describe('nightKey', () => {
  it('counts the small hours as the evening before', () => {
    expect(nightKey(new Date(2026, 10, 12, 22, 30))).toBe('2026-11-12');
    expect(nightKey(new Date(2026, 10, 13, 2, 15))).toBe('2026-11-12');
  });

  it('starts a new night at noon', () => {
    expect(nightKey(new Date(2026, 10, 13, 11, 59))).toBe('2026-11-12');
    expect(nightKey(new Date(2026, 10, 13, 12, 0))).toBe('2026-11-13');
  });

  it('crosses a month and a year', () => {
    expect(nightKey(new Date(2027, 0, 1, 3, 0))).toBe('2026-12-31');
  });
});

describe('groupByNight', () => {
  it('groups by night, newest night and newest entry first', () => {
    const a = entry('M 31', new Date(2026, 10, 12, 21, 0));
    const b = entry('M 42', new Date(2026, 10, 13, 1, 30));
    const c = entry('M 45', new Date(2026, 10, 14, 20, 0));
    const nights = groupByNight([a, b, c]);
    expect(nights.map((n) => n.key)).toEqual(['2026-11-14', '2026-11-12']);
    expect(nights[1].entries.map((e) => e.targetId)).toEqual(['M 42', 'M 31']);
    expect(nights[1].date.getDate()).toBe(12);
  });
});

describe('seenStates and timesSeen', () => {
  it('marks a target seen once any try saw it, and tried while every try failed', () => {
    const entries = [
      entry('M 31', new Date(2026, 10, 12, 21, 0), 0),
      entry('M 31', new Date(2026, 10, 14, 21, 0), 2),
      entry('M 33', new Date(2026, 10, 12, 21, 0), 0),
    ];
    const states = seenStates(entries);
    expect(states.get('M 31')).toBe('seen');
    expect(states.get('M 33')).toBe('tried');
    expect(states.get('M 42')).toBeUndefined();
    expect(timesSeen(entries, 'M 31')).toBe(1);
    expect(timesSeen(entries, 'M 33')).toBe(0);
  });
});

describe('ordinal', () => {
  it('uses the right English endings', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
      '111th',
    ]);
  });
});

describe('logTotals', () => {
  it('counts nights, objects seen and entries', () => {
    const entries = [
      entry('M 31', new Date(2026, 10, 12, 21, 0)),
      entry('M 31', new Date(2026, 10, 13, 2, 0)),
      entry('M 33', new Date(2026, 10, 14, 21, 0), 0),
    ];
    expect(logTotals(entries)).toEqual({ nights: 2, objects: 1, entries: 3 });
  });
});

describe('files', () => {
  it('reads back its own JSON backup', () => {
    const entries = [entry('M 31', new Date(2026, 10, 12, 21, 0), 4, { tags: ['Detail'], note: 'Dust lane' })];
    expect(parseLogJson(exportLogJson(entries))).toEqual(entries);
  });

  it('refuses other files with a message for the user', () => {
    expect(() => parseLogJson('not json')).toThrow("This isn't an AstroFinder log file");
    expect(() => parseLogJson('{"format":"astrofinder-lists","lists":[]}')).toThrow(
      "This isn't an AstroFinder log file",
    );
    expect(() => parseLogJson('{"format":"astrofinder-log","entries":[{"id":1}]}')).toThrow('damaged');
  });

  it('skips entries it already has when importing', () => {
    const a = entry('M 31', new Date(2026, 10, 12, 21, 0));
    const b = entry('M 33', new Date(2026, 10, 12, 21, 5));
    expect(mergeEntries([a], [a, b]).map((e) => e.targetId)).toEqual(['M 31', 'M 33']);
  });

  it('writes a CSV row per entry, oldest first, quoting where needed', () => {
    const late = entry('M 42', new Date(2026, 10, 13, 1, 5), 4, { note: 'Trapezium, "E" star too' });
    const early = entry('M 31', new Date(2026, 10, 12, 21, 0), 0, { tags: ['Averted vision', 'Try a darker sky'] });
    const lines = exportLogCsv([late, early]).trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^Night,Time,Target,Name,Rating/);
    expect(lines[1]).toBe(
      '2026-11-12,21:00,M 31,Name of M 31,Not seen,Averted vision; Try a darker sky,,52,8,12,-20,130/650 · 25 mm,39.470,-0.376',
    );
    expect(lines[2]).toContain('2026-11-12,01:05,M 42,Name of M 42,Great,,"Trapezium, ""E"" star too"');
  });
});
