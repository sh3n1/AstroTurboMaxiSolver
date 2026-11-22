// The puck's Meade LX200 repeater (docs/puck.md, "LX200"): planetarium apps such as
// Stellarium and SkySafari ask the puck where the telescope points, and send it a GoTo.
// The puck only answers them; the astronomy stays here. Plain functions, so they can be
// tested without a link.

import { equatorialVector, fromEquinoxOfDate, toEquinoxOfDate } from '../astronomy/astronomy';
import type { Target } from '../catalog/targets';

/** How often the pointing goes to the puck while its repeater is on: planetariums poll about once a second. */
export const POINTING_INTERVAL_MS = 1000;

/** A GoTo picks the nearest object within this distance: a planetarium usually goes to one. */
export const GOTO_NEAREST_DEG = 2;

/**
 * `{ t: 'pointing' }`: where the telescope points, on the equator and equinox of the date,
 * as LX200 telescopes report it.
 */
export interface PuckPointingMessage {
  t: 'pointing';
  raDeg: number;
  decDeg: number;
}

const round = (value: number): number => Math.round(value * 10000) / 10000;

/** The pointing message, from the telescope's J2000 position. */
export function pointingMessage(j2000: { raDeg: number; decDeg: number }, date: Date): PuckPointingMessage {
  const now = toEquinoxOfDate(j2000.raDeg, j2000.decDeg, date);
  return { t: 'pointing', raDeg: round(now.raDeg), decDeg: round(now.decDeg) };
}

/**
 * The object a planetarium's GoTo means: the nearest target to its position (of the date)
 * within GOTO_NEAREST_DEG, or null. Constellations are left out: their place is only where
 * their name is written.
 */
export function gotoTarget(targets: readonly Target[], raDeg: number, decDeg: number, date: Date): Target | null {
  const j2000 = fromEquinoxOfDate(raDeg, decDeg, date);
  const [x, y, z] = equatorialVector(j2000.raDeg, j2000.decDeg);
  const minCos = Math.cos((GOTO_NEAREST_DEG * Math.PI) / 180);
  let best: Target | null = null;
  let bestCos = minCos;
  for (const target of targets) {
    if (target.kind === 'Constellation') continue;
    const [tx, ty, tz] = equatorialVector(target.raDeg, target.decDeg);
    const cos = x * tx + y * ty + z * tz;
    if (cos > bestCos) {
      best = target;
      bestCos = cos;
    }
  }
  return best;
}
