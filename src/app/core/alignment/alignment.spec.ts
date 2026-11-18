import { separationDeg } from '../astronomy/astronomy';

import type { AlignmentCandidate } from './alignment';
import { apparentMagnitude, cameraOffset, offsetAngleDeg, suggestAlignmentStars, telescopePointing } from './alignment';

const candidate = (star: string, mag: number, altDeg: number): AlignmentCandidate<string> => ({
  star,
  mag,
  position: { altDeg, azDeg: 100 },
});

describe('alignment', () => {
  describe('star suggestions', () => {
    it('puts the brightest star first', () => {
      const result = suggestAlignmentStars([candidate('dim', 2, 60), candidate('bright', 0, 60)]);
      expect(result.map((c) => c.star)).toEqual(['bright', 'dim']);
    });

    it('leaves out stars that are too low, too high or too faint', () => {
      const result = suggestAlignmentStars([
        candidate('low', 0, 20),
        candidate('overhead', 0, 85),
        candidate('faint', 3, 60),
        candidate('good', 1, 60),
      ]);
      expect(result.map((c) => c.star)).toEqual(['good']);
    });

    it('accounts for the atmosphere dimming low stars', () => {
      expect(apparentMagnitude(1, 30)).toBeGreaterThan(apparentMagnitude(1, 80));
      const result = suggestAlignmentStars([candidate('low bright', 1.0, 26), candidate('high', 1.1, 75)]);
      expect(result[0].star).toBe('high');
    });

    it('limits how many it suggests', () => {
      const many = Array.from({ length: 10 }, (_, i) => candidate(`star ${i}`, 1, 60));
      expect(suggestAlignmentStars(many, 3)).toHaveLength(3);
    });
  });

  describe('camera offset', () => {
    it('recovers the telescope direction it was measured from', () => {
      const camera = { altDeg: 50, azDeg: 200 };
      const telescope = { altDeg: 48, azDeg: 203 };
      const result = telescopePointing(camera, cameraOffset(camera, telescope));
      expect(separationDeg(result, telescope)).toBeLessThan(1e-9);
    });

    it('stays correct after the mount moves, with the camera and telescope fixed together', () => {
      const offset = cameraOffset({ altDeg: 50, azDeg: 200 }, { altDeg: 50, azDeg: 203 });
      // Turning an alt-az mount in azimuth keeps the same offset.
      const result = telescopePointing({ altDeg: 50, azDeg: 10 }, offset);
      expect(separationDeg(result, { altDeg: 50, azDeg: 13 })).toBeLessThan(1e-9);
    });

    it('handles a large angle between camera and telescope', () => {
      const camera = { altDeg: 20, azDeg: 90 };
      const telescope = { altDeg: 70, azDeg: 90 };
      const offset = cameraOffset(camera, telescope);
      expect(offsetAngleDeg(offset)).toBeCloseTo(50, 9);
      expect(separationDeg(telescopePointing(camera, offset), telescope)).toBeLessThan(1e-9);
    });
  });
});
