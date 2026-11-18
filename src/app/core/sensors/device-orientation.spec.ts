import { cameraPointing, rearCameraVector, summarize, summarizeAngles } from './device-orientation';

describe('device orientation', () => {
  describe('rear camera direction', () => {
    it('looks straight down when the phone lies flat, screen up', () => {
      const [east, north, up] = rearCameraVector(0, 0, 0);
      expect(east).toBeCloseTo(0, 9);
      expect(north).toBeCloseTo(0, 9);
      expect(up).toBeCloseTo(-1, 9);
    });

    it('looks north at the horizon when held upright with the top pointing up', () => {
      const pointing = cameraPointing(rearCameraVector(0, 90, 0));
      expect(pointing.altDeg).toBeCloseTo(0, 9);
      expect(pointing.azDeg).toBeCloseTo(0, 9);
    });

    it('looks west after turning the upright phone a quarter turn anticlockwise', () => {
      // Alpha increases anticlockwise seen from above, the opposite of a compass.
      const pointing = cameraPointing(rearCameraVector(90, 90, 0));
      expect(pointing.altDeg).toBeCloseTo(0, 9);
      expect(pointing.azDeg).toBeCloseTo(270, 9);
    });

    it('looks 30° above the horizon when tilted back past upright', () => {
      const pointing = cameraPointing(rearCameraVector(0, 120, 0));
      expect(pointing.altDeg).toBeCloseTo(30, 9);
      expect(pointing.azDeg).toBeCloseTo(0, 9);
    });

    it('stays a unit vector for any orientation', () => {
      const vector = rearCameraVector(123, 45, -67);
      expect(Math.hypot(...vector)).toBeCloseTo(1, 9);
    });
  });

  it('keeps pointings clear of straight up', () => {
    expect(cameraPointing(rearCameraVector(0, 180, 0)).altDeg).toBe(89);
  });

  describe('statistics', () => {
    it('summarizes a series', () => {
      const result = summarize([1, 2, 3, 4]);
      expect(result.mean).toBe(2.5);
      expect(result.standardDeviation).toBeCloseTo(1.118, 3);
    });

    it('handles an empty series', () => {
      expect(summarize([]).count).toBe(0);
      expect(summarizeAngles([]).count).toBe(0);
    });

    it('averages angles correctly across north', () => {
      const result = summarizeAngles([359, 1]);
      expect(Math.min(result.mean, 360 - result.mean)).toBeCloseTo(0, 6);
      expect(result.standardDeviation).toBeCloseTo(1, 6);
    });
  });
});
