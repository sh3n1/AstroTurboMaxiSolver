// How the reticle looks over time, and what lies inside it, with no Angular dependency.

import type { Vector3 } from '../astronomy/astronomy';

/** The reticle's rings, as diameters in degrees: 0.5°, 2° and 4°. */
export const RETICLE_RINGS_DEG = [0.5, 2, 4] as const;

/** How far from the centre the outer ring reaches. */
export const RETICLE_RADIUS_DEG = RETICLE_RINGS_DEG.at(-1)! / 2;

/** Something in the sky, with its direction as a unit vector, worked out once in advance. */
export interface SkyItem<T> {
  item: T;
  vector: Vector3;
}

/**
 * The items inside the reticle's outer ring, nearest the centre first. Directions are
 * compared as unit vectors: the dot product of two is the cosine of the angle between
 * them, so this is one multiply-add per object, fast enough to run as the phone moves.
 */
export function insideReticle<T>(items: readonly SkyItem<T>[], centre: Vector3): T[] {
  const minCosine = Math.cos((RETICLE_RADIUS_DEG * Math.PI) / 180);
  const [x, y, z] = centre;
  // A plain loop that keeps only the few inside, since this runs over every target.
  const inside: { item: T; cosine: number }[] = [];
  for (const { item, vector } of items) {
    const cosine = vector[0] * x + vector[1] * y + vector[2] * z;
    if (cosine >= minCosine) inside.push({ item, cosine });
  }
  // A larger cosine is a smaller angle, so this puts the nearest first.
  return inside.sort((a, b) => b.cosine - a.cosine).map(({ item }) => item);
}

/** One full fade out and back, about the pace of a slow heartbeat. */
const PULSE_PERIOD_MS = 1200;
/** The rings never fade away completely, because the user still needs to see them. */
const PULSE_MIN_OPACITY = 0.25;

/** The reticle's opacity while plate solving, which fades smoothly in and out. */
export function pulseOpacity(timeMs: number): number {
  const wave = 0.5 + 0.5 * Math.cos((2 * Math.PI * timeMs) / PULSE_PERIOD_MS);
  return PULSE_MIN_OPACITY + (1 - PULSE_MIN_OPACITY) * wave;
}

const MIN_CHEVRON_SPACING_PX = 3;
const MAX_CHEVRON_SPACING_PX = 18;
const CHEVRON_SPACING_PX_PER_DEG = 0.5;

/** The gap between guidance chevrons: wide when far from the target, tight when close. */
export function chevronSpacingPx(distanceDeg: number): number {
  return Math.min(
    MAX_CHEVRON_SPACING_PX,
    Math.max(MIN_CHEVRON_SPACING_PX, MIN_CHEVRON_SPACING_PX + distanceDeg * CHEVRON_SPACING_PX_PER_DEG),
  );
}

/**
 * The screen direction to a target, in degrees clockwise from straight up. It takes the
 * target's position along the view's right and up axes, the image flip (an eyepiece turns
 * or mirrors the image), and the map's roll with the phone.
 */
export function guideAngleDeg(viewX: number, viewY: number, flipX: 1 | -1, flipY: 1 | -1, rollDeg: number): number {
  const roll = (rollDeg * Math.PI) / 180;
  const [x, y] = [viewX * flipX, viewY * flipY];
  const turnedX = x * Math.cos(roll) - y * Math.sin(roll);
  const turnedY = x * Math.sin(roll) + y * Math.cos(roll);
  const degrees = (Math.atan2(turnedX, turnedY) * 180) / Math.PI;
  return (degrees + 360) % 360;
}
