import { describe, expect, it } from 'vitest';

import type { AirLevel, GroundAir } from './seeing';
import { potentialTemperatureK, seeingArcsec, seeingClass, seeingFromTurbulence } from './seeing';

/** A standard atmosphere's pressure levels: 6.5 K colder per km up to 11 km, then steady. */
function standardLevels(): AirLevel[] {
  const pressures = [
    1000, 975, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 150, 100, 70, 50,
    30,
  ];
  return pressures.map((pressureHpa) => {
    // The standard atmosphere's height for a pressure, below and above the tropopause.
    const heightM =
      pressureHpa > 226.3
        ? 44_331 * (1 - (pressureHpa / 1013.25) ** 0.19026)
        : 11_000 + 6_341.6 * Math.log(226.3 / pressureHpa);
    const temperatureC = heightM < 11_000 ? 15 - 0.0065 * heightM : -56.5;
    return { pressureHpa, heightM, temperatureC };
  });
}

const valencia = (temperature2mC: number, temperature80mC: number): GroundAir => ({
  elevationM: 10,
  surfacePressureHpa: 1012,
  temperature2mC,
  temperature80mC,
});

describe('seeing', () => {
  it('works out potential temperature, which equals the temperature at 1000 hPa', () => {
    expect(potentialTemperatureK(15, 1000)).toBeCloseTo(288.15, 6);
    // Air brought down from 500 hPa warms by compression.
    expect(potentialTemperatureK(-20, 500)).toBeGreaterThan(300);
  });

  it('turns turbulence into seeing with Fried’s formula', () => {
    // ∫Cn² dz = 1e-13 m^(1/3) gives r0 ≈ 0.32 m, about 0.32″ at 500 nm.
    expect(seeingFromTurbulence(1e-13)).toBeCloseTo(0.316, 2);
    // Seeing grows as the turbulence to the power 3/5.
    expect(seeingFromTurbulence(1e-12) / seeingFromTurbulence(1e-13)).toBeCloseTo(10 ** 0.6, 3);
  });

  it('gives an ordinary seeing for an ordinary atmosphere', () => {
    const seeing = seeingArcsec(standardLevels(), valencia(15, 14.5));
    expect(seeing).toBeGreaterThan(0.6);
    expect(seeing).toBeLessThan(2.5);
  });

  it('is worse on a night with a ground inversion than in a mixed afternoon', () => {
    const levels = standardLevels();
    // At night the ground cools the air above it, so the air warms with height.
    const night = seeingArcsec(levels, valencia(8, 12));
    // In the afternoon the sun warms the ground, and the lowest air mixes.
    const afternoon = seeingArcsec(levels, valencia(20, 19.2));
    expect(night).toBeGreaterThan(afternoon);
  });

  it('leaves out the levels below a mountain site', () => {
    const levels = standardLevels();
    const site: GroundAir = { elevationM: 2400, surfacePressureHpa: 760, temperature2mC: 0, temperature80mC: -0.3 };
    const changedBelow = levels.map((level) => (level.heightM < 2400 ? { ...level, temperatureC: 40 } : level));
    expect(seeingArcsec(changedBelow, site)).toBe(seeingArcsec(levels, site));
  });

  it("sorts seeing into 7Timer's classes", () => {
    expect(seeingClass(0.4)).toBe(1);
    expect(seeingClass(0.5)).toBe(2);
    expect(seeingClass(1.1)).toBe(4);
    expect(seeingClass(2.4)).toBe(7);
    expect(seeingClass(3)).toBe(8);
  });
});
