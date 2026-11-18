// Smooth movement on the screen phone of a two-phone link. The finder sends where it points
// about 20 times a second, unevenly spaced by the Wi-Fi, while the screen draws 60 times a
// second. Jumping to each position as it arrives looks stepped, so the screen glides
// towards the newest one on every frame instead.

import type { Horizontal } from '../astronomy/astronomy';
import { azimuthChangeDeg, horizontalVector, normalize, vectorToHorizontal } from '../astronomy/astronomy';

/** The part of a finder's pose that moves on the map, and so is glided. */
export interface GlidePose {
  pointing: Horizontal;
  camera: Horizontal | null;
}

/**
 * How quickly the screen catches up, in ms: after this time about two thirds of the way is
 * covered. Short enough not to feel late, long enough to hide the gaps between messages.
 */
const GLIDE_MS = 60;

/** Closer than this, in degrees, the glide is finished and the frames stop. */
const SETTLED_DEG = 0.001;

/** The share of the remaining way to cover in a frame that took this long. */
export const glideFraction = (elapsedMs: number): number => 1 - Math.exp(-Math.max(0, elapsedMs) / GLIDE_MS);

/**
 * A direction part of the way from one to another, along the sky, so it takes the short way
 * round in azimuth and behaves near the zenith, where azimuth means little.
 */
export function glideHorizontal(from: Horizontal, to: Horizontal, fraction: number): Horizontal {
  const a = horizontalVector(from);
  const b = horizontalVector(to);
  const mixed = [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * fraction) as unknown as readonly [number, number, number];
  // Opposite directions mix to nothing, with no way between them: just go there.
  if (Math.hypot(...mixed) < 1e-6) return to;
  return vectorToHorizontal(normalize(mixed));
}

/** The largest change still to make, in degrees, to tell when the glide is done. */
function remainingDeg(from: GlidePose, to: GlidePose): number {
  return (
    Math.abs(from.pointing.altDeg - to.pointing.altDeg) +
    Math.abs(azimuthChangeDeg(from.pointing.azDeg, to.pointing.azDeg))
  );
}

/** One frame's step from the shown pose towards the newest one. */
export function stepPose(shown: GlidePose, target: GlidePose, fraction: number): GlidePose {
  return {
    pointing: glideHorizontal(shown.pointing, target.pointing, fraction),
    // The camera's direction comes and goes with plate solving, so it only glides while both have one.
    camera: shown.camera && target.camera ? glideHorizontal(shown.camera, target.camera, fraction) : target.camera,
  };
}

/**
 * Glides a shown pose towards the newest one, one step per drawn frame, and hands each step
 * to `show`. Frames only run while there is still some way to go, to spare the battery.
 */
export class PoseGlide {
  private shown: GlidePose | null = null;
  private target: GlidePose | null = null;
  private frame = 0;
  private lastFrameAt = 0;

  constructor(private readonly show: (pose: GlidePose) => void) {}

  /** A new pose from the finder. The first one is shown at once: there is nothing to glide from. */
  to(pose: GlidePose): void {
    this.target = pose;
    if (!this.shown) {
      this.shown = pose;
      this.show(pose);
      return;
    }
    if (!this.frame) {
      this.lastFrameAt = performance.now();
      this.frame = requestAnimationFrame((now) => this.step(now));
    }
  }

  /** Forgets everything, so the next pose is shown at once. */
  stop(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.shown = null;
    this.target = null;
  }

  private step(now: number): void {
    this.frame = 0;
    if (!this.shown || !this.target) return;
    const done = remainingDeg(this.shown, this.target) < SETTLED_DEG;
    this.shown = done ? this.target : stepPose(this.shown, this.target, glideFraction(now - this.lastFrameAt));
    this.lastFrameAt = now;
    this.show(this.shown);
    if (!done) this.frame = requestAnimationFrame((time) => this.step(time));
  }
}
