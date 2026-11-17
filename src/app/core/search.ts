// Turns names and designations into a form where small differences in typing don't
// matter, so "NGC 224", "ngc224" and "ngc  224" all find the same object.

import type { Target } from './targets';

/**
 * Lower case, single spaces, and no space between letters and the number after them.
 * Search applies this to both what the user types and the target's names, so the
 * two always compare alike: "NGC 224" becomes "ngc224", as does "ngc224".
 */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/([a-z])\s(?=\d)/g, '$1')
    .trim();
}

/** Everything search looks at for a target, normalised once, since there are thousands. */
const searchTexts = new WeakMap<Target, string>();
export function targetSearchText(target: Target): string {
  let text = searchTexts.get(target);
  if (text === undefined) {
    text = normalizeSearch(`${target.id} ${target.name} ${target.kind} ${target.aliases ?? ''}`);
    searchTexts.set(target, text);
  }
  return text;
}

/** Whether the text is exactly one of the target's designations, such as "M31" for M31. */
export function isExactDesignation(target: Target, term: string): boolean {
  // Other names may be separated by commas, as the star names from HYG are.
  return ` ${normalizeSearch(`${target.id} ${target.aliases ?? ''}`.replace(/,/g, ' '))} `.includes(` ${term} `);
}
