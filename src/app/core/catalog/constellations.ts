// The 88 constellations as targets, so they can be searched for and aimed at like any
// object. They come from the same file the sky map draws their lines from.

import type { Target } from './targets';

/** One constellation, as scripts/build-constellations.mjs writes it. */
export interface ConstellationRow {
  /** The IAU three-letter abbreviation, such as "Ori". */
  id: string;
  name: string;
  /** Where the map writes its name, roughly its middle, as [RA, Dec] in degrees. */
  label: [number, number];
  lines: [number, number][][];
}

/** Constellations have no brightness of their own, so they sort after every object. */
export const NO_MAGNITUDE = 99;

/**
 * A target for each constellation, aimed at the middle of its figure. A constellation
 * drawn in two parts, such as Serpens, becomes one target.
 */
export function constellationTargets(rows: readonly ConstellationRow[]): Target[] {
  const byId = new Map<string, Target>();
  for (const { id, name, label } of rows) {
    if (byId.has(id)) continue;
    byId.set(id, {
      // Named by its full name, which is how observers search for it, with the
      // abbreviation that star atlases use as another name.
      id: name.replace(/ (Caput|Cauda)$/, ''),
      name: 'Constellation',
      aliases: id,
      kind: 'Constellation',
      raDeg: label[0],
      decDeg: label[1],
      mag: NO_MAGNITUDE,
    });
  }
  return [...byId.values()];
}
