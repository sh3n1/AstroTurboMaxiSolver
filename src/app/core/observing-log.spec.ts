import { describe, expect, it } from 'vitest';

import type { LogConditions, LogEntry } from './observing-log';
import { appearanceChoices, carriedDetails, cleanDetails, countLabel, exportLogCsv, exportLogJson, groupByNight, logTotals, mergeEntries, newEntry, nightKey, ordinal, parseLogJson, seenCounts, seenStates, timesSeen } from './observing-log';

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

  it('counts the sightings of every target in one pass, leaving failed tries out', () => {
    const entries = [
      entry('M 31', new Date(2026, 10, 12, 21, 0)),
      entry('M 31', new Date(2026, 10, 13, 21, 0), 0),
      entry('M 31', new Date(2026, 10, 14, 21, 0), 4),
      entry('M 33', new Date(2026, 10, 12, 21, 0), 0),
      entry('M 42', new Date(2026, 10, 12, 22, 0), 1),
    ];
    const counts = seenCounts(entries);
    expect(counts.get('M 31')).toBe(2);
    expect(counts.get('M 42')).toBe(1);
    // Tried but never seen, or never logged: no count at all.
    expect(counts.has('M 33')).toBe(false);
    expect(counts.has('M 57')).toBe(false);
    // The same answer as asking target by target.
    for (const id of ['M 31', 'M 33', 'M 42']) expect(counts.get(id) ?? 0).toBe(timesSeen(entries, id));
  });

  it('writes a count no wider than two digits for a small badge', () => {
    expect(countLabel(2)).toBe('2');
    expect(countLabel(99)).toBe('99');
    // Three digits or more: a placeholder, so the badge stays at most two characters wide.
    expect(countLabel(100)).toBe('+');
    expect(countLabel(1234)).toBe('+');
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
    expect(() => parseLogJson('not json')).toThrow("This isn't an AstroTurboMaxiSolver log file");
    expect(() => parseLogJson('{"format":"astroturbomaxisolver-lists","lists":[]}')).toThrow(
      "This isn't an AstroTurboMaxiSolver log file",
    );
    expect(() => parseLogJson('{"format":"astroturbomaxisolver-log","entries":[{"id":1}]}')).toThrow('damaged');
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
      // The details' columns are empty when none were given.
      '2026-11-12,21:00,M 31,Name of M 31,Not seen,Averted vision; Try a darker sky,,52,8,12,-20,130/650 · 25 mm,39.470,-0.376,,,,,,',
    );
    expect(lines[2]).toContain('2026-11-12,01:05,M 42,Name of M 42,Great,,"Trapezium, ""E"" star too"');
  });

  it('writes the details in their own CSV columns', () => {
    const seen = entry('Albireo', new Date(2026, 10, 12, 22, 0), 4, {
      details: {
        seeing: 2,
        faintestStar: 4.5,
        sqm: 18.2,
        appearance: ['equalBrightness'],
        colourMain: 'orange',
        colourCompanion: 'blue',
      },
    });
    const row = exportLogCsv([seen]).trim().split(String.fromCharCode(13, 10))[1];
    expect(row.endsWith(',2,4.5,18.2,Equal brightness,,orange and blue')).toBe(true);
  });
});

describe('details', () => {
  it("carries the night's seeing and sky readings to its next entry, not the object's details", () => {
    const earlier = entry('M 31', new Date(2026, 10, 12, 21, 0), 3, {
      details: { seeing: 2, sqm: 18.4, appearance: ['mottled'], sizeArcmin: 90 },
    });
    expect(carriedDetails([earlier], new Date(2026, 10, 13, 1, 0))).toEqual({ seeing: 2, sqm: 18.4 });
    // The next night starts afresh.
    expect(carriedDetails([earlier], new Date(2026, 10, 13, 21, 0))).toBeUndefined();
  });

  it('drops empty details, and gives nothing when none are left', () => {
    expect(cleanDetails({ seeing: 3, sqm: undefined, appearance: [] })).toEqual({ seeing: 3 });
    expect(cleanDetails({ appearance: [] })).toBeUndefined();
  });

  it('offers the appearance choices that fit the kind of object', () => {
    expect(appearanceChoices('deepSky')).toEqual(['stellar', 'extended', 'resolved', 'mottled']);
    expect(appearanceChoices('openCluster')).toContain('partlyUnresolved');
    expect(appearanceChoices('double')).toEqual(['equalBrightness', 'niceSurrounding']);
    expect(appearanceChoices('other')).toEqual([]);
  });
});
