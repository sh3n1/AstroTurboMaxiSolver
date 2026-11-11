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

/**
 * The lists the app makes itself. They can't be edited or deleted. A description only
 * where the name needs one. Each belongs to a section: the Bookmarks tab's collections,
 * which change with the sky and the telescope, the Catalogues page, or a catalogue split
 * into its own page of lists, such as the RASC Finest NGC by season.
 */
export const FIXED_LISTS = [
  { id: 'now', name: 'Best right now', icon: 'moon-outline', description: '', section: 'collections' },
  { id: 'reticle', name: 'In the reticle', icon: 'locate-outline', description: '', section: 'collections' },
  { id: 'messier', name: 'Messier', icon: 'sparkles-outline', description: 'M1 to M110', section: 'catalogues' },
  { id: 'caldwell', name: 'Caldwell', icon: 'sparkles-outline', description: 'C1 to C109', section: 'catalogues' },
  {
    id: 'herschel400',
    name: 'Herschel 400',
    icon: 'sparkles-outline',
    description: 'Ancient City Astronomy Club',
    section: 'catalogues',
  },
  {
    id: 'herschel2',
    name: 'Herschel II',
    icon: 'sparkles-outline',
    description: 'Rose City Astronomers',
    section: 'catalogues',
  },
  {
    id: 'sac110',
    name: 'SAC 110 Best NGC',
    icon: 'sparkles-outline',
    description: 'Saguaro Astronomy Club',
    section: 'catalogues',
  },
  {
    id: 'explore-universe',
    name: 'Explore the Universe',
    icon: 'sparkles-outline',
    description: 'Royal Astronomical Society of Canada',
    section: 'catalogues',
  },
  { id: 'urban', name: 'Urban', icon: 'sparkles-outline', description: 'Astronomical League', section: 'catalogues' },
  {
    id: 'assa100',
    name: 'ASSA Top-100',
    icon: 'sparkles-outline',
    description: 'Astronomical Society of Southern Africa',
    section: 'catalogues',
  },
  // The RASC Finest NGC and the Deep-Sky Gems, by season.
  { id: 'rasc-autumn', name: 'Autumn sky', icon: 'leaf-outline', description: '', section: 'rasc' },
  { id: 'rasc-winter', name: 'Winter sky', icon: 'snow-outline', description: '', section: 'rasc' },
  { id: 'rasc-spring', name: 'Spring sky', icon: 'flower-outline', description: '', section: 'rasc' },
  { id: 'rasc-summer', name: 'Summer sky', icon: 'sunny-outline', description: '', section: 'rasc' },
  { id: 'gems-autumn', name: 'Autumn sky', icon: 'leaf-outline', description: '', section: 'gems' },
  { id: 'gems-winter', name: 'Winter sky', icon: 'snow-outline', description: '', section: 'gems' },
  { id: 'gems-spring', name: 'Spring sky', icon: 'flower-outline', description: '', section: 'gems' },
  { id: 'gems-summer', name: 'Summer sky', icon: 'sunny-outline', description: '', section: 'gems' },
  // The Hubble Night Sky Challenge, by month.
  { id: 'hubble-january', name: 'January', icon: 'calendar-outline', description: '', section: 'hubble' },
  { id: 'hubble-february', name: 'February', icon: 'calendar-outline', description: '', section: 'hubble' },
  { id: 'hubble-march', name: 'March', icon: 'calendar-outline', description: '', section: 'hubble' },
  { id: 'hubble-april', name: 'April', icon: 'calendar-outline', description: '', section: 'hubble' },
  { id: 'hubble-may', name: 'May', icon: 'calendar-outline', description: '', section: 'hubble' },
  { id: 'hubble-june', name: 'June', icon: 'calendar-outline', description: '', section: 'hubble' },
  { id: 'hubble-july', name: 'July', icon: 'calendar-outline', description: '', section: 'hubble' },
  { id: 'hubble-august', name: 'August', icon: 'calendar-outline', description: '', section: 'hubble' },
  { id: 'hubble-september', name: 'September', icon: 'calendar-outline', description: '', section: 'hubble' },
  { id: 'hubble-october', name: 'October', icon: 'calendar-outline', description: '', section: 'hubble' },
  { id: 'hubble-november', name: 'November', icon: 'calendar-outline', description: '', section: 'hubble' },
  { id: 'hubble-december', name: 'December', icon: 'calendar-outline', description: '', section: 'hubble' },
] as const;
export type FixedListSection = (typeof FIXED_LISTS)[number]['section'];

/**
 * Catalogues split into several lists, each with its own page under the Catalogues page,
 * at /tabs/lists/catalogues/<id>. `section` is the section of FIXED_LISTS that page shows.
 */
export const CATALOGUE_GROUPS = [
  {
    id: 'rasc',
    name: 'RASC Finest NGC',
    description: 'Royal Astronomical Society of Canada',
    icon: 'sparkles-outline',
    section: 'rasc',
  },
  {
    id: 'gems',
    name: 'RASC Deep-Sky Gems',
    description: 'David H. Levy',
    icon: 'sparkles-outline',
    section: 'gems',
  },
  {
    // The objects for the user's hemisphere, from their latitude.
    id: 'hubble',
    name: 'Hubble Night Sky Challenge',
    description: 'NASA',
    icon: 'calendar-outline',
    section: 'hubble',
  },
] as const;

/** One of the app's own lists as a row shows it: the list, with its icon and description. */
export interface FixedListEntry<T extends { id: string }> {
  list: T;
  icon: string;
  description: string;
}

/** The app's own lists in one section, in order, each with its icon and description. */
export function fixedListEntries<T extends { id: string }>(
  lists: readonly T[],
  section: FixedListSection,
): FixedListEntry<T>[] {
  return FIXED_LISTS.filter((fixed) => fixed.section === section).flatMap((fixed) => {
    const list = lists.find((candidate) => candidate.id === fixed.id);
    return list ? [{ list, icon: fixed.icon, description: fixed.description }] : [];
  });
}
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
 * A target as a list row. A catalogue can list one object under two numbers, such as NGC
 * 2371 and NGC 2372, so it gets a row for each, and the second row says which number it
 * is listed as. Both rows are the same target, so aiming and bookmarks work on either.
 */
export type ListedTarget = Target & { listedAs?: string };

/** Every target by each of its designations, such as "M76" and "NGC 650" for the same one. */
export type DesignationIndex = ReadonlyMap<string, Target>;

/**
 * Indexes targets by their designations, so lists can look them up. The first target with
 * a designation keeps it. Built once and shared by all the catalogue lists.
 */
export function designationIndex(targets: readonly Target[]): DesignationIndex {
  const index = new Map<string, Target>();
  for (const target of targets) {
    for (const designation of designations(target)) {
      if (!index.has(designation)) index.set(designation, target);
    }
  }
  return index;
}

/** The targets with these NGC numbers, in the order given: see designatedTargets. */
export function ngcTargets(targets: readonly Target[], numbers: readonly number[]): ListedTarget[] {
  return designatedTargets(
    targets,
    numbers.map((n) => `NGC ${n}`),
  );
}

/** The targets with these designations, in the order given: see listRows. */
export function designatedTargets(targets: readonly Target[], wanted: readonly string[]): ListedTarget[] {
  return listRows(designationIndex(targets), wanted);
}

/**
 * A list's rows: the targets with these designations, such as "NGC 7009", "IC 289" or
 * "Mel 20", in the order given. Each is found by its designations, so NGC 650 is M76. A
 * target listed under a second designation gets a second row, listed as that one.
 * Designations the data doesn't have are skipped.
 */
export function listRows(byDesignation: DesignationIndex, wanted: readonly string[]): ListedTarget[] {
  const shown = new Set<Target>();
  return wanted.flatMap((designation) => {
    const target = byDesignation.get(designation);
    if (!target) return [];
    if (shown.has(target)) return [{ ...target, listedAs: designation }];
    shown.add(target);
    return [target];
  });
}

/** The designations for a row, the number it's listed as first: "NGC 2372 · NGC 2371". */
export function rowDesignations(target: ListedTarget): string {
  const all = designations(target);
  return target.listedAs ? [target.listedAs, ...all.filter((d) => d !== target.listedAs)].join(' · ') : all.join(' · ');
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
