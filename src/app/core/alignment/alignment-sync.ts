// Syncing on a target, with no Angular dependency.
//
// Alignment measures, once, how the camera sits on the telescope. That angle is a little
// different in other parts of the sky: the phone's holder and the tube bend slightly as
// the telescope moves, and the alignment star was never centred perfectly. A sync measures
// it again wherever the user has a target centred in the eyepiece, as on GoTo mounts.
//
// Each sync is kept where it was made. Where the telescope points, the app uses the
// alignment and the syncs together, the nearest counting most, so a sync near the target
// decides there, and one on the other side of the sky hardly matters.

import type { Alignment } from '../app-state.service';
import type { Horizontal, Vector3 } from '../astronomy/astronomy';
import { normalize, separationDeg } from '../astronomy/astronomy';

import { cameraOffset, telescopePointing } from './alignment';

/** The angle between camera and telescope, measured with a target centred in the eyepiece. */
export interface AlignmentSync {
  /** Where the telescope pointed: the target's position then. */
  telescope: Horizontal;
  /** The telescope's direction in the camera's axes, as for the alignment. */
  offset: Vector3;
  /** When, as an ISO date. */
  at: string;
}

/** Syncs are for one night: the holder may sit differently next time. */
export const SYNC_LIFETIME_MS = 12 * 3_600_000;
/** A sync this far from what the app expected may be on the wrong star, so it is confirmed first. */
export const SYNC_CONFIRM_DEG = 1;
/** Within this, a new sync replaces older ones: they measured the same part of the sky. */
const REPLACE_WITHIN_DEG = 1;
/** The most kept. More than a night's worth of targets, and quick to weigh at every reading. */
const MAX_SYNCS = 30;
/**
 * How near counts as near, in degrees. Points within it weigh about the same, and beyond
 * it a point's weight falls with the square of its distance.
 */
const NEAR_DEG = 3;
/** An alignment saved before its position was kept counts as this far from everywhere. */
const UNKNOWN_DISTANCE_DEG = 30;

/** The syncs still within their night. */
export function freshSyncs(alignment: Alignment, now: Date): AlignmentSync[] {
  return (alignment.syncs ?? []).filter((sync) => now.getTime() - Date.parse(sync.at) < SYNC_LIFETIME_MS);
}

/**
 * The angle between camera and telescope to use where the camera now points: the
 * alignment's and the syncs', each weighed by how near it was measured.
 */
export function offsetFor(alignment: Alignment, camera: Horizontal, now: Date): Vector3 {
  const syncs = freshSyncs(alignment, now);
  if (syncs.length === 0) return alignment.offset;
  // Near enough to weigh the points by: the angle between them is under a degree or two.
  const roughly = telescopePointing(camera, alignment.offset);
  const points = [{ telescope: alignment.position, offset: alignment.offset }, ...syncs];
  const sum: [number, number, number] = [0, 0, 0];
  for (const { telescope, offset } of points) {
    const distance = telescope ? separationDeg(roughly, telescope) : UNKNOWN_DISTANCE_DEG;
    const weight = 1 / (distance * distance + NEAR_DEG * NEAR_DEG);
    for (let i = 0; i < 3; i++) sum[i] += weight * offset[i];
  }
  return normalize(sum);
}

/** How far the app's idea of where the telescope points was from the centred target, in degrees. */
export function syncErrorDeg(alignment: Alignment, camera: Horizontal, target: Horizontal, now: Date): number {
  return separationDeg(telescopePointing(camera, offsetFor(alignment, camera, now)), target);
}

/**
 * The alignment with a new sync: the camera's direction from a fresh plate solve, with the
 * target centred in the eyepiece. Older syncs in the same part of the sky, and stale ones,
 * are dropped.
 */
export function addSync(alignment: Alignment, camera: Horizontal, target: Horizontal, now: Date): Alignment {
  const kept = freshSyncs(alignment, now).filter((sync) => separationDeg(sync.telescope, target) > REPLACE_WITHIN_DEG);
  const sync: AlignmentSync = { telescope: target, offset: cameraOffset(camera, target), at: now.toISOString() };
  return { ...alignment, syncs: [...kept, sync].slice(-MAX_SYNCS) };
}
