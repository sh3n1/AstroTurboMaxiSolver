// An object's catalogue numbers, such as "M31 · NGC 224" or "C20 · NGC 7000", in the
// order observers know them best: Messier, then Caldwell, then NGC, then IC.

import type { Target } from './targets';

/** Catalogue designations found among a target's other names. */
const DESIGNATION = /\b(?:M\d+|C\d+|NGC \d+[A-Z]?|IC \d+[A-Z]?)\b/g;

/** Where each catalogue goes in the list. Anything else, such as a star's name, goes last. */
const CATALOGUE_ORDER = [/^M\d/, /^C\d/, /^NGC /, /^IC /];
const rank = (designation: string): number => {
  const index = CATALOGUE_ORDER.findIndex((pattern) => pattern.test(designation));
  return index < 0 ? CATALOGUE_ORDER.length : index;
};

/** Worked out once per target, since the sky map asks on every frame. */
const cache = new WeakMap<Target, readonly string[]>();

/**
 * Every catalogue designation of a target, best known first. The target's own id is
 * always included, so a star or planet simply gives its name.
 */
export function designations(target: Target): readonly string[] {
  let list = cache.get(target);
  if (!list) {
    // Caldwell numbers are already among the other names, joined in from caldwell.json.
    const found = new Set([target.id, ...((target.aliases ?? '').match(DESIGNATION) ?? [])]);
    // Sorting is stable, so two of the same catalogue keep their order.
    list = [...found].sort((a, b) => rank(a) - rank(b));
    cache.set(target, list);
  }
  return list;
}

/** The designations as one line, such as "M31 · NGC 224". */
export function designationText(target: Target): string {
  return designations(target).join(' · ');
}
