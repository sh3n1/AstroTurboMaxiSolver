// What moves on the puck's map (docs/puck.md, `objects`): the Moon, the planets and the
// bright asteroids, which a fixed catalogue can't hold, sent once a minute as the app's own
// list moves them. Plain functions, so they can be tested without a link.

import { designations } from '../catalog/designations';
import type { Target } from '../catalog/targets';

import { kindCode, showBelowFieldDeg } from './puck-catalog';

/** One moving object, as the puck reads it. */
export interface PuckObject {
  id: string;
  /** What the map writes beside it, such as "Jupiter". */
  label: string;
  /** The kind's number, as in the catalogue (puck-catalog.ts). */
  kind: number;
  /** Where the app's map draws it, in the catalogue's frame (topocentric for the Moon). */
  raDeg: number;
  decDeg: number;
  mag: number | null;
  sizeArcmin: number | null;
  showBelowFieldDeg: number;
  /** The Moon's and Venus's lit fraction, 0 to 1. */
  phase?: number;
}

export interface PuckObjectsMessage {
  t: 'objects';
  /** Where the Sun is, in the same frame, so the puck turns lit sides towards it. */
  sun: { raDeg: number; decDeg: number };
  items: PuckObject[];
}

/** Rounded to what the puck's screen can show, so the message stays small. */
const round = (value: number, digits: number): number => Number(value.toFixed(digits));

/** The `objects` message for the app's targets now: only those that move. */
export function objectsMessage(targets: readonly Target[], sun: { raDeg: number; decDeg: number }): PuckObjectsMessage {
  const items = targets
    .filter((target) => target.body)
    .map((target): PuckObject => {
      const item: PuckObject = {
        id: target.id,
        label: designations(target)[0],
        kind: kindCode(target.kind),
        raDeg: round(target.raDeg, 4),
        decDeg: round(target.decDeg, 4),
        mag: Number.isFinite(target.mag) ? round(target.mag, 1) : null,
        sizeArcmin: target.sizeArcmin ?? null,
        showBelowFieldDeg: showBelowFieldDeg(target),
      };
      if (target.phase) item.phase = round(target.phase.litFraction, 3);
      return item;
    });
  return { t: 'objects', sun: { raDeg: round(sun.raDeg, 4), decDeg: round(sun.decDeg, 4) }, items };
}
