// The observing log: which targets the user has seen, when, how well and with what.
// Pure data and helpers, with no Angular dependency, so it can be unit tested.

import { equipmentLabel } from './equipment';
import type { Equipment, KitSelection } from './equipment';
import { newUuid } from './sync-record';

/**
 * How well the target was seen, from 0 (looked for it but not seen) to 4 (great).
 * A logged entry starts at 3, "Good", since most targets found are seen well enough.
 */
export type Rating = 0 | 1 | 2 | 3 | 4;

/** The rating words, in order, as the note sheet shows them. */
export const RATINGS: readonly { value: Rating; label: string }[] = [
  { value: 0, label: 'Not seen' },
  { value: 1, label: 'Glimpse' },
  { value: 2, label: 'Faint' },
  { value: 3, label: 'Good' },
  { value: 4, label: 'Great' },
];

/** The rating a new entry gets. */
export const DEFAULT_RATING: Rating = 3;

/** Quick tags for the note, so most notes need no typing at the telescope. */
export const LOG_TAGS = [
  'Bright core',
  'Detail',
  'Companions',
  'Averted vision',
  'Colour',
  'Filter helped',
  'Try a darker sky',
] as const;

/** What the sky and the telescope were like when the entry was logged. Filled in by the app. */
export interface LogConditions {
  latitudeDeg: number;
  longitudeDeg: number;
  /** The target's height above the horizon. */
  altDeg: number;
  /** The Bortle class set in Settings. */
  bortle: number;
  /** How much of the Moon was lit, in percent, and how high it was. */
  moonLitPercent: number;
  moonAltDeg: number;
  /** The equipment's numbers, kept as they were, even if the kit changes later. */
  equipment: Equipment;
  /**
   * Which kit items they were, to find observations by telescope or eyepiece. Missing on
   * entries logged before it was recorded.
   */
  kitIds?: KitSelection;
}

/** One sighting, or a failed try, of one target. */
export interface LogEntry {
  /** Unique, so an entry can be changed or deleted. */
  id: string;
  targetId: string;
  /** The target's name when logged, so the log reads well even if the catalogue changes. */
  targetName: string;
  /** When it was logged, as an ISO date. */
  time: string;
  rating: Rating;
  tags: string[];
  note: string;
  conditions: LogConditions;
}

/** A night's entries, newest first, as the log page shows them. */
export interface LogNight {
  /** The night's date, as "2026-11-12": the evening it started. */
  key: string;
  /** Noon on that evening's date, local time, for showing the date. */
  date: Date;
  entries: LogEntry[];
}

/** A target's progress in a catalogue: seen, tried but not seen yet, or neither. */
export type SeenState = 'seen' | 'tried' | null;

const FILE_FORMAT = 'astrofinder-log';
const FILE_VERSION = 1;
/** Observing nights run from noon to noon, so a sighting at 2:00 counts for the evening before. */
const NIGHT_START_HOUR = 12;

/** A new entry's id, unique across devices, so logs from two phones can be merged. */
export function newEntryId(): string {
  return newUuid();
}

/** A new entry for a target, rated "Good", with no tags or note yet. */
export function newEntry(target: { id: string; name: string }, time: Date, conditions: LogConditions): LogEntry {
  return {
    id: newEntryId(),
    targetId: target.id,
    targetName: target.name,
    time: time.toISOString(),
    rating: DEFAULT_RATING,
    tags: [],
    note: '',
    conditions,
  };
}

/** Whether an entry counts as seen. A rating of 0 records a try that didn't find it. */
export const wasSeen = (entry: LogEntry): boolean => entry.rating > 0;

/** The night a time belongs to, as "2026-11-12", in local time: the date of its evening. */
export function nightKey(time: Date): string {
  const evening = new Date(time);
  if (evening.getHours() < NIGHT_START_HOUR) evening.setDate(evening.getDate() - 1);
  const month = String(evening.getMonth() + 1).padStart(2, '0');
  const day = String(evening.getDate()).padStart(2, '0');
  return `${evening.getFullYear()}-${month}-${day}`;
}

/** The entries grouped by night, the newest night first, and newest first within it. */
export function groupByNight(entries: readonly LogEntry[]): LogNight[] {
  const nights = new Map<string, LogEntry[]>();
  for (const entry of [...entries].sort((a, b) => b.time.localeCompare(a.time))) {
    const key = nightKey(new Date(entry.time));
    nights.set(key, [...(nights.get(key) ?? []), entry]);
  }
  return [...nights].map(([key, nightEntries]) => {
    const [year, month, day] = key.split('-').map(Number);
    return { key, date: new Date(year, month - 1, day, NIGHT_START_HOUR), entries: nightEntries };
  });
}

/** Each target's state in the log: seen if any entry saw it, tried if every try failed. */
export function seenStates(entries: readonly LogEntry[]): ReadonlyMap<string, Exclude<SeenState, null>> {
  const states = new Map<string, Exclude<SeenState, null>>();
  for (const entry of entries) {
    if (wasSeen(entry)) states.set(entry.targetId, 'seen');
    else if (!states.has(entry.targetId)) states.set(entry.targetId, 'tried');
  }
  return states;
}

/** How many times a target has been seen, counting failed tries out. */
export function timesSeen(entries: readonly LogEntry[], targetId: string): number {
  return entries.filter((e) => e.targetId === targetId && wasSeen(e)).length;
}

/**
 * How many times each target has been seen, failed tries left out, in one pass over the
 * log. A list asks for every row at once, which one scan per row would make slow.
 */
export function seenCounts(entries: readonly LogEntry[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (wasSeen(entry)) counts.set(entry.targetId, (counts.get(entry.targetId) ?? 0) + 1);
  }
  return counts;
}

/** The most a count badge spells out: two digits, so the badge is never wider than that. */
const MAX_COUNT_SHOWN = 99;
/** What the badge shows past that: "many". Screen readers still hear the real number. */
const MANY = '+';

/** A count as its small badge shows it: "2", "37", or "+" for three digits or more. */
export function countLabel(count: number): string {
  return count > MAX_COUNT_SHOWN ? MANY : String(count);
}

/** "1st", "2nd", "3rd", "11th", "22nd": for "Seen 23:41 · 3rd time". */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

/** Totals for the top of the log page. */
export function logTotals(entries: readonly LogEntry[]): { nights: number; objects: number; entries: number } {
  return {
    nights: new Set(entries.map((e) => nightKey(new Date(e.time)))).size,
    objects: new Set(entries.filter(wasSeen).map((e) => e.targetId)).size,
    entries: entries.length,
  };
}

/** Whether an entry matches a search, by target, note or tag. The term is already normalised. */
export function entryMatches(entry: LogEntry, term: string, targetText: string): boolean {
  const text = `${targetText} ${entry.targetName} ${entry.note} ${entry.tags.join(' ')}`.toLowerCase();
  return text.includes(term);
}

// ---- Files ----

/** The whole log as JSON, a backup that importing reads back. */
export function exportLogJson(entries: readonly LogEntry[]): string {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, entries }, null, 2);
}

/** One CSV field, quoted when it has a comma, quote or line break. */
function csvField(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The log as a spreadsheet, oldest first, one row per entry. Times are in local time. */
export function exportLogCsv(entries: readonly LogEntry[]): string {
  const header = [
    'Night',
    'Time',
    'Target',
    'Name',
    'Rating',
    'Tags',
    'Note',
    'Altitude',
    'Bortle',
    'Moon lit %',
    'Moon altitude',
    'Equipment',
    'Latitude',
    'Longitude',
  ];
  const rows = [...entries]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((e) => {
      const time = new Date(e.time);
      const c = e.conditions;
      return [
        nightKey(time),
        `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`,
        e.targetId,
        e.targetName,
        RATINGS[e.rating].label,
        e.tags.join('; '),
        e.note,
        Math.round(c.altDeg),
        c.bortle,
        Math.round(c.moonLitPercent),
        Math.round(c.moonAltDeg),
        equipmentLabel(c.equipment),
        c.latitudeDeg.toFixed(3),
        c.longitudeDeg.toFixed(3),
      ];
    });
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Whether a value read from a file looks like a log entry, so a bad file never half-imports. */
function isEntry(value: unknown): value is LogEntry {
  const e = value as Partial<LogEntry> | null;
  return (
    typeof e?.id === 'string' &&
    typeof e.targetId === 'string' &&
    typeof e.targetName === 'string' &&
    typeof e.time === 'string' &&
    !Number.isNaN(Date.parse(e.time)) &&
    typeof e.rating === 'number' &&
    e.rating >= 0 &&
    e.rating <= 4 &&
    Array.isArray(e.tags) &&
    typeof e.note === 'string' &&
    typeof e.conditions === 'object' &&
    e.conditions !== null
  );
}

/** Reads a log backup. Throws an error with a message for the user when the file is wrong. */
export function parseLogJson(text: string): LogEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This isn't an AstroFinder log file");
  }
  const file = data as { format?: unknown; entries?: unknown };
  if (file?.format !== FILE_FORMAT || !Array.isArray(file.entries)) {
    throw new Error("This isn't an AstroFinder log file");
  }
  if (!file.entries.every(isEntry)) throw new Error('The log file is damaged');
  return file.entries;
}

/** Adds imported entries to the log, skipping any it already has, so importing twice is safe. */
export function mergeEntries(current: readonly LogEntry[], imported: readonly LogEntry[]): LogEntry[] {
  const ids = new Set(current.map((e) => e.id));
  return [...current, ...imported.filter((e) => !ids.has(e.id))];
}

/** A file name for the log, with today's date: "astrofinder-log-2026-11-12.csv". */
export function logFileName(extension: 'csv' | 'json', today = new Date()): string {
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `astrofinder-log-${today.getFullYear()}-${month}-${day}.${extension}`;
}
