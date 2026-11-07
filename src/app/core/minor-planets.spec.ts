import { describe, expect, it } from 'vitest';

import { minorPlanet, minorPlanetPosition, MINOR_PLANETS } from './minor-planets';

// Positions from NASA/JPL Horizons for 2026 November 7, 0h UT, as seen from the Earth's
// centre: J2000 right ascension and declination in degrees, and visual magnitude.
const HORIZONS: Record<string, [number, number, number]> = {
  Ceres: [115.11837, 24.28169, 8.135],
  Vesta: [17.16977, -4.57928, 6.819],
  Pallas: [14.85796, -20.31656, 8.614],
  Juno: [304.14406, -14.24807, 10.075],
};
const DATE = new Date('2026-11-07T00:00:00Z');

/** The angle between two sky positions, in degrees. */
function separationDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const rad = Math.PI / 180;
  const cos =
    Math.sin(dec1 * rad) * Math.sin(dec2 * rad) +
    Math.cos(dec1 * rad) * Math.cos(dec2 * rad) * Math.cos((ra1 - ra2) * rad);
  return Math.acos(Math.min(1, cos)) / rad;
}

describe('minor planets', () => {
  it('has Ceres and the three brightest asteroids', () => {
    expect(MINOR_PLANETS.map((p) => p.name)).toEqual(['Ceres', 'Vesta', 'Pallas', 'Juno']);
  });

  for (const [name, [ra, dec, mag]] of Object.entries(HORIZONS)) {
    it(`puts ${name} where NASA/JPL does, well within the app's accuracy target`, () => {
      const position = minorPlanetPosition(minorPlanet(name)!, DATE);
      // A hundredth of a degree is far inside the half-degree target.
      expect(separationDeg(position.raDeg, position.decDeg, ra, dec)).toBeLessThan(0.01);
      expect(Math.abs(position.mag - mag)).toBeLessThan(0.3);
    });
  }
});
