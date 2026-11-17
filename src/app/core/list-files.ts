// Observing lists from other apps: SkySafari's .skylist files, and CSV or plain text from
// planners and spreadsheets. They name objects in many ways ("M 31", "NGC0224", "Messier
// 31", "Andromeda Galaxy"), so each row gives its candidates and the app picks the first
// it knows. Plain functions, so they can be tested without the app.

import { designations } from './designations';
import { normalizeSearch } from './search';
import type { Target } from './targets';

/** A list read from a file: its name and its targets, and what couldn't be matched. */
export interface ImportedList {
  name: string;
  targetIds: string[];
  /** Each object the app doesn't know, as the file named it, for telling the user. */
  missing: string[];
}

/**
 * SkySafari writes Greek letters in its files with the old Symbol font's Latin keys, after a
 * dollar sign: "$h Cas" is η Cas, "$z1 Cnc" is ζ1 Cnc. The app names stars with the Greek
 * letters themselves.
 */
const SYMBOL_FONT_GREEK: Record<string, string> = {
  a: 'α',
  b: 'β',
  g: 'γ',
  d: 'δ',
  e: 'ε',
  z: 'ζ',
  h: 'η',
  q: 'θ',
  i: 'ι',
  k: 'κ',
  l: 'λ',
  m: 'μ',
  n: 'ν',
  x: 'ξ',
  o: 'ο',
  p: 'π',
  r: 'ρ',
  s: 'σ',
  t: 'τ',
  u: 'υ',
  f: 'φ',
  c: 'χ',
  y: 'ψ',
  w: 'ω',
};

/** A SkySafari name with its Greek letter written out: "$y1 Psc" becomes "ψ1 Psc". */
export function skySafariName(text: string): string {
  return text.replace(/^\$([a-z])(?=\d|\s)/, (code, key: string) => SYMBOL_FONT_GREEK[key] ?? code);
}

/** Whether a text is a SkySafari observing list. */
export function isSkylist(text: string): boolean {
  return /^\s*SkyObject\s*=\s*BeginObject/m.test(text);
}

/**
 * The objects of a SkySafari .skylist file, each as its names to try, best first: its
 * catalogue numbers, then its common name. The format isn't published; this follows the
 * files SkySafari writes, where each object is a block from "SkyObject=BeginObject" to
 * "EndObject=SkyObject".
 */
export function parseSkylist(text: string): string[][] {
  const objects: string[][] = [];
  let current: { numbers: string[]; common: string[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^SkyObject\s*=\s*BeginObject/.test(line)) {
      current = { numbers: [], common: [] };
    } else if (/^EndObject\s*=\s*SkyObject/.test(line)) {
      if (current) objects.push([...current.numbers, ...current.common]);
      current = null;
    } else if (current) {
      const [key, ...rest] = line.split('=');
      const value = rest.join('=').trim();
      if (!value) continue;
      if (key.trim() === 'CatalogNumber') current.numbers.push(skySafariName(value));
      else if (key.trim() === 'CommonName') current.common.push(value);
    }
  }
  return objects;
}

/**
 * The rows of a CSV file, or of plain text with one object per line, each as its cells.
 * Commas, semicolons and tabs all separate cells, whichever the first line uses most;
 * quoted cells may hold them. Any cell may name the object: matching tries them in order,
 * so a header row or a column of magnitudes is simply never matched.
 */
export function parseDelimited(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];
  const counts = [',', ';', '\t'].map((d) => [d, lines[0].split(d).length] as const);
  const [delimiter] = counts.reduce((best, next) => (next[1] > best[1] ? next : best));
  return lines.map((line) => splitCells(line, delimiter).filter((cell) => cell !== ''));
}

/** One line's cells, honouring double quotes, as spreadsheets write them. */
function splitCells(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/**
 * A name as other apps write it, made comparable: "Messier 31", "M 031" and "M31" all
 * become "m31", and "NGC0224" becomes "ngc224".
 */
export function designationKey(text: string): string {
  return normalizeSearch(text)
    .replace(/^messier ?/, 'm')
    .replace(/^caldwell ?/, 'c')
    .replace(/^([a-z]+)0+(\d)/, '$1$2');
}

/**
 * The catalogue numbers among a target's other names, which are written one after another,
 * such as "STF 60 Σ 60 WDS 00491+5749" or "HIP 3821": each catalogue's letters with the
 * number that follows them.
 */
const CATALOGUE_NUMBER = /\b[A-Z][A-Za-z]*\s?\d[\dA-Za-z+.-]*/g;

/**
 * Finds targets by any of their names: catalogue designations, the name the app shows, and
 * their other names, whole and as each catalogue number in them. The first target with a
 * name keeps it.
 */
export function targetFinder(targets: readonly Target[]): (text: string) => Target | null {
  const byKey = new Map<string, Target>();
  const add = (name: string, target: Target): void => {
    const key = designationKey(name);
    if (key && !byKey.has(key)) byKey.set(key, target);
  };
  for (const target of targets) {
    for (const designation of designations(target)) add(designation, target);
    add(target.name, target);
    for (const alias of (target.aliases ?? '').split(/[,;]/)) add(alias, target);
    for (const number of (target.aliases ?? '').match(CATALOGUE_NUMBER) ?? []) add(number, target);
  }
  return (text) => byKey.get(designationKey(text)) ?? null;
}

/**
 * Matches each row to a target by the first of its names the app knows. Each target is
 * listed once, in the file's order. A row that matches nothing is reported by its first
 * name, unless it looks like a header.
 */
export function matchRows(
  rows: readonly string[][],
  find: (text: string) => Target | null,
): Omit<ImportedList, 'name'> {
  const targetIds: string[] = [];
  const missing: string[] = [];
  rows.forEach((row, index) => {
    const target = row.map(find).find((found) => found !== null);
    if (target) {
      if (!targetIds.includes(target.id)) targetIds.push(target.id);
    } else if (row.length > 0 && !(index === 0 && looksLikeHeader(row))) {
      missing.push(row[0]);
    }
  });
  return { targetIds, missing };
}

/** A first row such as "Name,RA,Dec,Mag": words only, no digits. */
function looksLikeHeader(row: readonly string[]): boolean {
  return row.every((cell) => !/\d/.test(cell));
}

/** A list's name from its file's name: "Spring galaxies.skylist" becomes "Spring galaxies". */
export function listNameFromFile(fileName: string): string {
  const name = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .trim();
  return name || 'Imported list';
}

/**
 * Reads a .skylist, CSV or plain text list. Throws a message for the user when nothing in
 * it could be matched, so an unrelated file doesn't make an empty list.
 */
export function readListFile(text: string, fileName: string, targets: readonly Target[]): ImportedList {
  const rows = isSkylist(text) ? parseSkylist(text) : parseDelimited(text);
  const { targetIds, missing } = matchRows(rows, targetFinder(targets));
  if (targetIds.length === 0) throw new Error('No objects in this file were recognised');
  return { name: listNameFromFile(fileName), targetIds, missing };
}
