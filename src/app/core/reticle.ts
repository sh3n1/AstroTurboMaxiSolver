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
