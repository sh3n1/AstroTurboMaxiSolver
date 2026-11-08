// Bookmark lists: the user's own lists of targets, and how they are saved, exported
// and imported. Plain functions, so they can be tested without the app around them.

import { designations } from './designations';
import type { Target } from './targets';

/** A list the user can edit. Targets are kept by id, such as "M31" or "NGC 7000". */
export interface TargetList {
  id: string;
  name: string;
  targetIds: string[];
}

/** The list every bookmark goes to unless the user picks another. It can't be deleted. */
export const UNCATEGORIZED_ID = 'uncategorized';

/** The lists the app makes itself. They can't be edited or deleted. */
export const FIXED_LISTS = [
  {
    id: 'now',
    name: 'Best right now',
    icon: 'moon-outline',
    description: 'Well up in the sky now, from here, brightest first',
  },
  {
    id: 'reticle',
    name: 'In the reticle',
    icon: 'locate-outline',
    description: 'Inside the aiming rings now, nearest first',
  },
  { id: 'messier', name: 'Messier catalogue', icon: 'sparkles-outline', description: 'M1 to M110' },
  { id: 'caldwell', name: 'Caldwell catalogue', icon: 'sparkles-outline', description: 'C1 to C109' },
] as const;
export type FixedListId = (typeof FIXED_LISTS)[number]['id'];

/** Marks an exported file as ours, so importing something else fails clearly. */
const EXPORT_FORMAT = 'astrofinder-lists';
const EXPORT_VERSION = 1;

/** The lists a new user starts with, taking over the bookmarks of the old session plan. */
export function startingLists(oldPlanIds: readonly string[] = []): TargetList[] {
  return [{ id: UNCATEGORIZED_ID, name: 'Uncategorized', targetIds: [...oldPlanIds] }];
}

/** A new, unique id for a list. */
export function newListId(): string {
  return `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** The name, or the name with a number after it if a list already has it: "Galaxies (2)". */
export function uniqueName(name: string, existing: readonly string[]): string {
  const base = name.trim() || 'New list';
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`.toLowerCase())) n++;
  return `${base} (${n})`;
}

/** Lists as text to save in a file or share: their names and target ids. */
export function exportLists(lists: readonly Pick<TargetList, 'name' | 'targetIds'>[]): string {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      lists: lists.map(({ name, targetIds }) => ({ name, targets: targetIds })),
    },
    null,
    2,
  );
}

/**
 * Reads lists from an exported file. Throws an error with a message for the user when
 * the text isn't an AstroFinder list, so a wrong file never half-imports.
 */
export function parseImport(text: string): { name: string; targetIds: string[] }[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This isn't an AstroFinder list file");
  }
  const file = data as { format?: unknown; lists?: unknown };
  if (file?.format !== EXPORT_FORMAT || !Array.isArray(file.lists)) {
    throw new Error("This isn't an AstroFinder list file");
  }
  return file.lists.map((entry: { name?: unknown; targets?: unknown }) => {
    if (typeof entry?.name !== 'string' || !Array.isArray(entry.targets)) {
      throw new Error('The list file is damaged');
    }
    // Keep only text ids, each once, in the order given.
    const targetIds = [...new Set(entry.targets.filter((id): id is string => typeof id === 'string'))];
    return { name: entry.name.trim() || 'Imported list', targetIds };
  });
}

/** A file name for a list, such as "astrofinder-galaxies-for-spring.json". */
export function exportFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `astrofinder-${slug || 'list'}.json`;
}

/**
 * The targets in a catalogue, in catalogue order: M1, M2 … M110, or C1 … C109. Each is
 * found by its designations, so NGC 7000 is in the Caldwell list as C20.
 */
export function catalogueTargets(targets: readonly Target[], prefix: 'M' | 'C'): Target[] {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const numbered: { target: Target; number: number }[] = [];
  for (const target of targets) {
    for (const designation of designations(target)) {
      const match = pattern.exec(designation);
      if (match) {
        numbered.push({ target, number: Number(match[1]) });
        break;
      }
    }
  }
  return numbered.sort((a, b) => a.number - b.number).map(({ target }) => target);
}
