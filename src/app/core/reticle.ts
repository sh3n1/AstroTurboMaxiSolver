// How the reticle looks over time, with no Angular dependency.

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
