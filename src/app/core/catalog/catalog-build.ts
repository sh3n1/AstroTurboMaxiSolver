// Puts the catalogue files together into the app's list of fixed targets. Plain functions,
// so they run in a Web Worker, where reading and joining several megabytes can't hold up
// the map, and on the page itself where there is no worker.

import type { DoubleRow } from '../astronomy/double-stars';

import { constellationTargets } from './constellations';
import type { ConstellationRow } from './constellations';
import { joinHygStars } from './hyg-stars';
import type { HygData } from './hyg-stars';
import type { Target } from './targets';

/** The catalogue files as read. Any may be missing: each failed on its own, and the rest still work. */
export interface CatalogFiles {
  /** Messier, the named stars and other bright objects: small, and all the map needs at first. */
  targets?: Target[];
  constellations?: ConstellationRow[];
  /** NGC and IC objects, from OpenNGC. */
  openngc?: Target[];
  doubles?: DoubleRow[];
  /** The stars' catalogue names, from the HYG Database. */
  hyg?: HygData;
}

/** Where each file is, under assets/data/. */
export const CATALOG_PATHS: Record<keyof CatalogFiles, string> = {
  targets: 'targets.json',
  constellations: 'constellations.json',
  openngc: 'aggregate/openngc/openngc.json',
  doubles: 'doubles.json',
  hyg: 'aggregate/hyg/hyg.json',
};

/**
 * Adds the double stars. Those whose main star is a named star, such as Albireo, are added
 * to that star, so it stays one target. The others become targets of their own.
 */
export function joinDoubles(catalog: readonly Target[], rows: readonly DoubleRow[]): Target[] {
  const toStar = new Map(rows.filter((row) => row.starId).map((row) => [row.starId, row]));
  const own = rows.filter((row): row is DoubleRow & Target => !row.starId);
  return [
    ...catalog.map((target) => {
      const row = toStar.get(target.id);
      if (!row || target.kind !== 'Star') return target;
      const aliases = [target.aliases, row.aliases].filter(Boolean).join(' ');
      return { ...target, aliases, double: row.double };
    }),
    ...own,
  ];
}

/**
 * The fixed targets from whichever files there are. Double stars go onto the named stars,
 * and the HYG star names onto both, so those two come last and in that order.
 */
export function buildCatalog(files: CatalogFiles): Target[] {
  let catalog: Target[] = [
    ...(files.targets ?? []),
    ...(files.constellations ? constellationTargets(files.constellations) : []),
    ...(files.openngc ?? []),
  ];
  if (files.doubles) catalog = joinDoubles(catalog, files.doubles);
  if (files.hyg) catalog = joinHygStars(catalog, files.hyg.stars);
  return catalog;
}

/**
 * Reads the named files from a folder, each on its own, so one failing leaves the others
 * usable: planets and the Moon work with none of them.
 */
export async function readCatalogFiles(
  folderUrl: string,
  names: readonly (keyof CatalogFiles)[],
): Promise<CatalogFiles> {
  const files: Record<string, unknown> = {};
  await Promise.all(
    names.map(async (name) => {
      try {
        files[name] = await (await fetch(folderUrl + CATALOG_PATHS[name])).json();
      } catch {
        // Left out: see above.
      }
    }),
  );
  return files as CatalogFiles;
}
