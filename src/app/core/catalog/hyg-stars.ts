// Joins the HYG Database's star names (assets/data/aggregate/hyg/hyg.json, CC BY-SA 4.0, from
// scripts/build-hyg.mjs) to the app's stars, so stars can be found by the names observers
// and other apps use: "ζ Psc", "61 Cyg", "HR 7001", "HD 110914", "R Lep". Plain functions,
// so they can be tested without the app.

import type { Target } from './targets';

/** A row of hyg.json: names best known first, joined by "|", proper name, position, magnitude, colour. */
export type HygRow = [names: string, proper: string, raDeg: number, decDeg: number, mag: number, bv: number | null];

/** The contents of hyg.json. */
export interface HygData {
  stars: HygRow[];
}

/** A HYG star this close to a double star's main star is that star. */
const SAME_STAR_DEG = 1 / 60;
const RAD = Math.PI / 180;

/** Angular distance between two positions, in degrees, good enough at arcminute scale. */
function separationDeg(a: { raDeg: number; decDeg: number }, b: { raDeg: number; decDeg: number }): number {
  const dRa = ((((a.raDeg - b.raDeg) % 360) + 540) % 360) - 180;
  return Math.hypot(dRa * Math.cos(((a.decDeg + b.decDeg) / 2) * RAD), a.decDeg - b.decDeg);
}

/** Other names joined as other catalogues' names are: separated by commas, which search splits on. */
function withAliases(aliases: string | undefined, added: readonly string[]): string {
  const present = new Set((aliases ?? '').split(/[,;]/).map((a) => a.trim()));
  const fresh = added.filter((name) => name && !present.has(name) && !(aliases ?? '').includes(name));
  return [aliases, ...fresh].filter(Boolean).join(', ');
}

/**
 * The app's targets with HYG's stars joined in. A HYG star that is one of the app's named
 * stars, by its Hipparcos number, or a double star's main star, by its position, adds its
 * names to it, so it stays one target. Every other HYG star becomes a target of its own,
 * named by its best-known name, such as "ζ Psc", or its proper name where it has one.
 */
export function joinHygStars(catalog: readonly Target[], rows: readonly HygRow[]): Target[] {
  const byHip = new Map<string, number>();
  const doubleCells = new Map<string, number[]>();
  const cell = (raDeg: number, decDeg: number): string => `${Math.floor(raDeg)},${Math.floor(decDeg)}`;
  catalog.forEach((target, index) => {
    if (target.kind === 'Star') {
      // Any space, since the named stars' numbers are written with a thin one (U+2009).
      for (const [, hip] of (target.aliases ?? '').matchAll(/\bHIP\s(\d+)/g)) byHip.set(`HIP ${hip}`, index);
    } else if (target.kind === 'Double star') {
      const key = cell(target.raDeg, target.decDeg);
      doubleCells.set(key, [...(doubleCells.get(key) ?? []), index]);
    }
  });

  /** The double star whose main star sits where this star is, looking in the cells around it. */
  const doubleAt = (raDeg: number, decDeg: number): number | undefined => {
    for (const dRa of [-1, 0, 1]) {
      for (const dDec of [-1, 0, 1]) {
        const found = (doubleCells.get(cell(raDeg + dRa, decDeg + dDec)) ?? []).find(
          (index) => separationDeg(catalog[index], { raDeg, decDeg }) <= SAME_STAR_DEG,
        );
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };

  const joined = [...catalog];
  // Every id, and every name a star from HYG has, so no two stars are named alike.
  const used = new Set(catalog.map((target) => target.id));
  const added: Target[] = [];
  for (const [nameText, proper, raDeg, decDeg, mag, bv] of rows) {
    const names = nameText.split('|');
    const hip = names.find((name) => name.startsWith('HIP '));
    const match = (hip !== undefined ? byHip.get(hip) : undefined) ?? doubleAt(raDeg, decDeg);
    if (match !== undefined) {
      names.forEach((name) => used.add(name));
      const target = joined[match];
      joined[match] = {
        ...target,
        // A double star known only by its catalogue number gets the star's own name.
        name: target.name === 'Double star' ? names[0] : target.name,
        aliases: withAliases(target.aliases, [...names, proper]),
      };
      continue;
    }
    // Its own target, named by the first of its names no other star has, such as the
    // fainter star of a pair, which shares the brighter one's Bayer and Flamsteed names.
    const id = names.find((name) => !used.has(name));
    if (!id) continue;
    names.forEach((name) => used.add(name));
    added.push({
      id,
      name: proper || 'Star',
      aliases: withAliases(
        '',
        names.filter((name) => name !== id),
      ),
      kind: 'Star',
      raDeg,
      decDeg,
      mag,
      ...(bv === null ? {} : { bv }),
      ...(proper ? {} : { unnamed: true as const }),
    });
  }
  return [...joined, ...added];
}
