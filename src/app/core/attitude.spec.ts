import {
  StillnessDetector,
  attitudeFromOrientation,
  blendAttitude,
  attitudeFromAxes,
  attitudeFromImageAxes,
  combineAttitudes,
  integrateGyroscope,
  inverseAttitude,
  phoneUpDirection,
  rearCameraDirection,
} from './attitude';
import { cameraPointing, rearCameraVector } from './device-orientation';

const upright = attitudeFromOrientation(0, 90, 0); // Looking north at the horizon

/** Turns an attitude using many small gyroscope steps, as real readings arrive. */
function spin(rates: [number, number, number], seconds: number): ReturnType<typeof attitudeFromOrientation> {
  let q = upright;
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) q = integrateGyroscope(q, rates, seconds / steps);
  return q;
}

describe('attitude', () => {
  it('agrees with the direct formula for any orientation', () => {
    for (const [a, b, g] of [
      [0, 0, 0],
      [0, 90, 0],
      [90, 90, 0],
      [123, 45, -67],
      [300, -20, 80],
    ]) {
      const direct = rearCameraVector(a, b, g);
      rearCameraDirection(attitudeFromOrientation(a, b, g)).forEach((value, i) =>
        expect(value).toBeCloseTo(direct[i], 9),
      );
    }
  });

  it('finds the top of the phone', () => {
    const up = phoneUpDirection(upright);
    expect(up[0]).toBeCloseTo(0, 9);
    expect(up[1]).toBeCloseTo(0, 9);
    expect(up[2]).toBeCloseTo(1, 9);
  });

  it('reports the phone rolling anticlockwise as the top moving west', () => {
    const up = phoneUpDirection(spin([0, 0, 90], 1));
    expect(up[0]).toBeCloseTo(-1, 6);
    expect(up[2]).toBeCloseTo(0, 6);
  });

  describe('attitude from a plate solve', () => {
    /** The phone's own axes in local coordinates, read from an attitude. */
    function axesOf(q: ReturnType<typeof attitudeFromOrientation>) {
      const [w, x, y, z] = q;
      return {
        x: [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)] as const,
        y: phoneUpDirection(q),
        z: [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)] as const,
      };
    }

    it('rebuilds any attitude from its axes', () => {
      for (const [a, b, g] of [
        [0, 0, 0],
        [0, 90, 0],
        [200, 60, -30],
        [10, 170, 80],
        [300, -45, 179],
      ]) {
        const q = attitudeFromOrientation(a, b, g);
        const { x, y, z } = axesOf(q);
        const rebuilt = attitudeFromAxes(x, y, z);
        // A quaternion and its negative are the same attitude.
        const sign = Math.sign(rebuilt[0] * q[0] + rebuilt[1] * q[1] + rebuilt[2] * q[2] + rebuilt[3] * q[3]);
        rebuilt.forEach((value, i) => expect(sign * value).toBeCloseTo(q[i], 9));
      }
    });

    it('turns image axes into the phone attitude, so the camera looks where the image does', () => {
      const q = attitudeFromOrientation(40, 110, 15);
      const { x, y, z } = axesOf(q);
      // The image's axes, as a plate solve reports them for this phone attitude.
      const imageY = [-y[0], -y[1], -y[2]] as const;
      const imageZ = [-z[0], -z[1], -z[2]] as const;
      const fromSolve = attitudeFromImageAxes(x, imageY, imageZ);
      rearCameraDirection(fromSolve).forEach((value, i) => expect(value).toBeCloseTo(imageZ[i], 9));
    });

    it('learns a fixed compass error, so later readings come out right', () => {
      const truth = attitudeFromOrientation(100, 95, 0);
      const compassSaid = attitudeFromOrientation(112, 95, 0); // 12° out
      const correction = combineAttitudes(truth, inverseAttitude(compassSaid));
      // Later, the phone turns, and the compass is still 12° out.
      const laterTruth = attitudeFromOrientation(150, 95, 0);
      const laterCompass = attitudeFromOrientation(162, 95, 0);
      const corrected = combineAttitudes(correction, laterCompass);
      rearCameraDirection(corrected).forEach((value, i) =>
        expect(value).toBeCloseTo(rearCameraDirection(laterTruth)[i], 6),
      );
    });
  });

  describe('gyroscope', () => {
    it('turns left about the top of the phone, from north towards west', () => {
      // A positive rate about y is anticlockwise seen from the top of the phone.
      const pointing = cameraPointing(rearCameraDirection(spin([0, 90, 0], 1)));
      expect(pointing.altDeg).toBeCloseTo(0, 6);
      expect(pointing.azDeg).toBeCloseTo(270, 6);
    });

    it('matches the orientation reading for the same physical turn', () => {
      const viaGyroscope = rearCameraDirection(spin([0, 90, 0], 1));
      const viaOrientation = rearCameraDirection(attitudeFromOrientation(90, 90, 0));
      viaGyroscope.forEach((value, i) => expect(value).toBeCloseTo(viaOrientation[i], 6));
    });

    it("tilts up about the phone's x axis", () => {
      // A positive rate about x takes the top of the phone away from the user.
      const pointing = cameraPointing(rearCameraDirection(spin([30, 0, 0], 1)));
      expect(pointing.altDeg).toBeCloseTo(30, 6);
    });

    it("doesn't change where the camera looks when rolling about its own axis", () => {
      const pointing = cameraPointing(rearCameraDirection(spin([0, 0, 90], 1)));
      expect(pointing.altDeg).toBeCloseTo(0, 6);
      expect(pointing.azDeg % 360).toBeCloseTo(0, 6);
    });

    it('ignores a reading with no rotation or no time', () => {
      expect(integrateGyroscope(upright, [0, 0, 0], 1)).toEqual(upright);
      expect(integrateGyroscope(upright, [10, 0, 0], 0)).toEqual(upright);
    });
  });

  describe('correction towards the orientation reading', () => {
    it('lands on the target at full weight, and stays put at none', () => {
      const target = attitudeFromOrientation(40, 90, 0);
      blendAttitude(upright, target, 1).forEach((value, i) => expect(value).toBeCloseTo(target[i], 9));
      blendAttitude(upright, target, 0).forEach((value, i) => expect(value).toBeCloseTo(upright[i], 9));
    });

    it('moves only part of the way at a small weight', () => {
      const pointing = cameraPointing(
        rearCameraDirection(blendAttitude(upright, attitudeFromOrientation(-40, 90, 0), 0.1)),
      );
      expect(pointing.azDeg).toBeGreaterThan(1);
      expect(pointing.azDeg).toBeLessThan(10);
    });

    it('takes the short way round when the signs differ', () => {
      const negated = upright.map((value) => -value) as unknown as typeof upright;
      blendAttitude(upright, negated, 0.5).forEach((value, i) => expect(value).toBeCloseTo(upright[i], 9));
    });
  });

  describe('stillness', () => {
    it('counts as still only after a full second without movement', () => {
      const detector = new StillnessDetector();
      expect(detector.update([0.1, 0, 0], 0.5)).toBe(false);
      expect(detector.update([0.1, 0, 0], 0.5)).toBe(true);
    });

    it('starts again after any movement', () => {
      const detector = new StillnessDetector();
      detector.update([0, 0, 0], 1);
      expect(detector.update([5, 0, 0], 0.016)).toBe(false);
      expect(detector.update([0, 0, 0], 0.5)).toBe(false);
    });
  });
});
