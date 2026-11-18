import { describe, expect, it } from 'vitest';

import openNgcFile from '../../../assets/data/aggregate/openngc/openngc.json';
import caldwellFile from '../../../assets/data/caldwell.json';
import doublesFile from '../../../assets/data/doubles.json';
import targetsFile from '../../../assets/data/targets.json';
import type { CaldwellData } from '../catalog/caldwell';
import { joinCaldwell } from '../catalog/caldwell';
import { EXTRA_TARGETS } from '../catalog/extra-targets';
import type { Target } from '../catalog/targets';

import { AL_URBAN } from './programs/al-urban';
import { ASSA_TOP_100 } from './programs/assa-top-100';
import { HERSCHEL_400, HERSCHEL_II } from './programs/herschel';
import { HUBBLE_NIGHT_SKY_CHALLENGE } from './programs/hubble-night-sky-challenge';
import { RASC_DEEP_SKY_GEMS } from './programs/rasc-deep-sky-gems';
import { RASC_EXPLORE_THE_UNIVERSE } from './programs/rasc-explore-universe';
import { RASC_FINEST_NGC } from './programs/rasc-finest-ngc';
import { SAC_110 } from './programs/sac-110';
import { designationIndex, listRows } from './target-lists';

// The catalogue the app builds, near enough: the files, Caldwell joined in, and the app's
// own objects. Double stars whose main star is a named star are part of that star instead.
const caldwell = caldwellFile as CaldwellData;
const doubles = (doublesFile as (Target & { starId?: string })[]).filter((row) => !row.starId);
const catalogue = [
  ...joinCaldwell([...(targetsFile as Target[]), ...(openNgcFile as Target[])], caldwell),
  ...caldwell.extraTargets,
  ...doubles,
  ...EXTRA_TARGETS,
];
const index = designationIndex(catalogue);
const ngc = (numbers: readonly number[]): string[] => numbers.map((n) => `NGC ${n}`);

/** Every built-in observing list, by name, as the designations it names. */
const LISTS: Record<string, readonly string[]> = {
  'Herschel 400': ngc(HERSCHEL_400),
  'Herschel II': ngc(HERSCHEL_II),
  'SAC 110': ngc(SAC_110),
  'Explore the Universe': RASC_EXPLORE_THE_UNIVERSE,
  Urban: AL_URBAN,
  'ASSA Top-100': ASSA_TOP_100,
  ...Object.fromEntries(Object.entries(RASC_FINEST_NGC).map(([season, ids]) => [`Finest NGC ${season}`, ids])),
  ...Object.fromEntries(Object.entries(RASC_DEEP_SKY_GEMS).map(([season, ids]) => [`Deep-Sky Gems ${season}`, ids])),
  ...Object.fromEntries(
    Object.entries(HUBBLE_NIGHT_SKY_CHALLENGE).flatMap(([month, { north, south }]) => [
      [`Hubble ${month} north`, north],
      [`Hubble ${month} south`, south],
    ]),
  ),
};

describe('built-in observing lists', () => {
  it('find every object they name in the app’s data', () => {
    const missing = Object.entries(LISTS).flatMap(([name, ids]) =>
      ids.filter((id) => !index.has(id)).map((id) => `${name}: ${id}`),
    );
    expect(missing).toEqual([]);
  });

  it('name each object once, apart from two numbers for one object', () => {
    for (const [name, ids] of Object.entries(LISTS)) expect(new Set(ids).size, name).toBe(ids.length);
  });

  it('have the counts the programmes publish', () => {
    expect(ASSA_TOP_100).toHaveLength(100);
    expect(AL_URBAN).toHaveLength(87);
    // 24 deep-sky objects, the Double Cluster as two rows, and 20 double stars.
    expect(RASC_EXPLORE_THE_UNIVERSE).toHaveLength(45);
    // 154 numbered objects, 7 more where one number covers several.
    expect(Object.values(RASC_DEEP_SKY_GEMS).flat()).toHaveLength(161);
    expect(listRows(index, ASSA_TOP_100)).toHaveLength(100);
  });

  it('keep the app’s own objects apart from the catalogue files', () => {
    const fileIds = new Set([...(targetsFile as Target[]), ...(openNgcFile as Target[])].map((t) => t.id));
    expect(EXTRA_TARGETS.filter((t) => fileIds.has(t.id)).map((t) => t.id)).toEqual([]);
    expect(new Set(EXTRA_TARGETS.map((t) => t.id)).size).toBe(EXTRA_TARGETS.length);
  });
});
