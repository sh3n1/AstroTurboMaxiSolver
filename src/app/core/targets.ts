// What the user can aim at. Fixed objects load from assets/data/targets.json, which
// scripts/build-catalog.mjs generates. Planets and the Moon move, so they are
// calculated instead. Catalogue positions are J2000.

export type TargetKind =
  | 'Galaxy'
  | 'Nebula'
  | 'Open cluster'
  | 'Globular cluster'
  | 'Star'
  | 'Constellation'
  | 'Planet'
  | 'Dwarf planet'
  | 'Asteroid'
  | 'Moon'
  | 'Other';

export interface Target {
  id: string;
  name: string;
  /** Other designations, which search also looks at. */
  aliases?: string;
  kind: TargetKind;
  raDeg: number;
  decDeg: number;
  mag: number;
  /** Apparent size along the longest side, where known. */
  sizeArcmin?: number;
  /** Apparent size along the shortest side, for oval objects such as most galaxies. */
  minorArcmin?: number;
  /**
   * The detailed object type, in OpenNGC's codes, where the kind doesn't say it all:
   * "PN" for a planetary nebula, "GPair" for a galaxy pair. See target-details.ts.
   */
  type?: string;
  /** A galaxy's shape in Hubble's scheme, such as "SBb" for a barred spiral. */
  hubble?: string;
  /** A star's B-V colour index: negative for blue-white stars, above 1.4 for red ones. */
  bv?: number;
  /** Set for the Moon, planets, dwarf planets and asteroids, which move among the stars. */
  body?: string;
  /** Set for the Moon and Venus, which show phases that matter at the eyepiece. */
  phase?: TargetPhase;
}

export interface TargetPhase {
  /** How much of the disc is sunlit, from 0 (new) to 1 (full). */
  litFraction: number;
  /** Whether the lit side is on the right, seen from where the observer stands. */
  litOnRight: boolean;
}

/** The bodies whose phase the app shows. */
export const PHASED_BODIES = ['Moon', 'Venus'];

/** Planets and the Moon, in the names astronomy-engine uses. The Sun is left out for safety. */
export const SOLAR_SYSTEM_BODIES = [
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
];
