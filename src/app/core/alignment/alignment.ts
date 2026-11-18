// Telescope alignment maths, with no Angular dependency.
//
// The phone's camera and the telescope point in different directions, because of
// how the phone is mounted. Alignment measures that difference once:
//
//   1. The user centres a known star in the telescope's eyepiece.
//   2. A plate solve says where the camera is pointing at that moment.
//   3. The star's position, seen from the camera's axes, is the offset.
//
// After that, the telescope's direction follows from any later plate solve, for
// as long as the phone stays fixed in its mount. One star is enough, because a
// plate solve gives the camera's full orientation.

import type { Horizontal, Vector3 } from '../astronomy/astronomy';
import {
  fromViewCoordinates,
  horizontalVector,
  toViewCoordinates,
  vectorToHorizontal,
  viewBasis,
} from '../astronomy/astronomy';

const MIN_ALTITUDE_DEG = 25; // Lower stars are dimmed by the atmosphere and hidden by buildings
const MAX_ALTITUDE_DEG = 80; // Many mounts are awkward to aim almost straight up
/** Bright enough to recognise even from a city. Callers pass a limit for the user's sky. */
const DEFAULT_MAX_MAGNITUDE = 2.5;
const EXTINCTION_MAG_PER_AIRMASS = 0.3;

/** Anything with a name, a brightness and a current position can be a candidate. */
export interface AlignmentCandidate<T> {
  star: T;
  position: Horizontal;
  mag: number;
}

/** How bright a star looks through the atmosphere. Lower numbers are brighter. */
export function apparentMagnitude(mag: number, altDeg: number): number {
  return mag + EXTINCTION_MAG_PER_AIRMASS / Math.sin((altDeg * Math.PI) / 180);
}

/** Picks the stars easiest to see right now and to aim a telescope at, best first. */
export function suggestAlignmentStars<T>(
  candidates: AlignmentCandidate<T>[],
  count = 4,
  maxMagnitude = DEFAULT_MAX_MAGNITUDE,
): AlignmentCandidate<T>[] {
  return candidates
    .filter(
      ({ position, mag }) =>
        position.altDeg >= MIN_ALTITUDE_DEG && position.altDeg <= MAX_ALTITUDE_DEG && mag <= maxMagnitude,
    )
    .sort((a, b) => apparentMagnitude(a.mag, a.position.altDeg) - apparentMagnitude(b.mag, b.position.altDeg))
    .slice(0, count);
}

/** The offset: the telescope's direction, in the camera's own axes. */
export function cameraOffset(camera: Horizontal, telescope: Horizontal): Vector3 {
  return toViewCoordinates(viewBasis(camera), horizontalVector(telescope));
}

/** Uses a saved offset to work out where the telescope points from the camera's pointing. */
export function telescopePointing(camera: Horizontal, offset: Vector3): Horizontal {
  return vectorToHorizontal(fromViewCoordinates(viewBasis(camera), offset));
}

/** The angle between the camera and the telescope. The offset's z axis is the camera's. */
export function offsetAngleDeg(offset: Vector3): number {
  return (Math.atan2(Math.hypot(offset[0], offset[1]), offset[2]) * 180) / Math.PI;
}
