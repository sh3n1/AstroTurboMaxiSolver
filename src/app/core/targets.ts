// What the user can aim at. Fixed objects load from assets/data/targets.json, which
// scripts/build-catalog.mjs generates. Planets and the Moon move, so they are
// calculated instead. Catalogue positions are J2000.

export type TargetKind =
  'Galaxy' | 'Nebula' | 'Open cluster' | 'Globular cluster' | 'Star' | 'Planet' | 'Moon' | 'Other';

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
  /** Set for planets and the Moon, whose positions must be recalculated over time. */
  body?: string;
}

/** Planets and the Moon, in the names astronomy-engine uses. The Sun is left out for safety. */
export const SOLAR_SYSTEM_BODIES = ['Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
