import { bodyFacts, discText, distanceText, lightTimeText } from './body-facts';

// A fixed moment, so the checks don't depend on when the tests run.
const DATE = new Date('2026-11-08T00:00:00Z');

describe('solar-system facts', () => {
  it('gives the Moon its distance, size, age and next phases', () => {
    const moon = bodyFacts('Moon', DATE)!;
    // The Moon is always between about 356,000 and 407,000 km away, and about half a degree wide.
    expect(moon.distanceAu * 149_597_870.7).toBeGreaterThan(355_000);
    expect(moon.distanceAu * 149_597_870.7).toBeLessThan(407_000);
    expect(moon.discArcsec / 60).toBeGreaterThan(29);
    expect(moon.discArcsec / 60).toBeLessThan(34);
    expect(moon.moon!.ageDays).toBeGreaterThanOrEqual(0);
    expect(moon.moon!.ageDays).toBeLessThan(29.6);
    expect(moon.moon!.nextFull.getTime()).toBeGreaterThan(DATE.getTime());
    expect(moon.moon!.nextNew.getTime()).toBeGreaterThan(DATE.getTime());
  });

  it('gives Jupiter a disc of tens of arcseconds, and light minutes away', () => {
    const jupiter = bodyFacts('Jupiter', DATE)!;
    expect(jupiter.distanceAu).toBeGreaterThan(3.9);
    expect(jupiter.distanceAu).toBeLessThan(6.5);
    expect(jupiter.discArcsec).toBeGreaterThan(29);
    expect(jupiter.discArcsec).toBeLessThan(51);
    expect(jupiter.lightSeconds / jupiter.distanceAu).toBeCloseTo(499, 0);
    expect(jupiter.moon).toBeUndefined();
  });

  it('works for the asteroids too, from their orbits', () => {
    const ceres = bodyFacts('Ceres', DATE)!;
    expect(ceres.distanceAu).toBeGreaterThan(1.5);
    expect(ceres.distanceAu).toBeLessThan(3.9);
    // Under a second of arc: a star-like point in any telescope.
    expect(ceres.discArcsec).toBeLessThan(1);
    expect(ceres.litFraction).toBeGreaterThan(0.9);
    expect(ceres.sunAngleDeg).toBeGreaterThanOrEqual(0);
    expect(ceres.sunAngleDeg).toBeLessThanOrEqual(180);
  });

  it('has nothing for objects outside the solar system', () => {
    expect(bodyFacts('Vega', DATE)).toBeNull();
  });
});

describe('solar-system facts in words', () => {
  it('reads distances in kilometres near the Earth and astronomical units beyond', () => {
    expect(distanceText(0.00257)).toMatch(/^384.?500 km$/);
    expect(distanceText(4.517)).toBe('4.52 au');
    expect(distanceText(34.6)).toBe('34.6 au');
  });

  it('reads light time in seconds, minutes or hours', () => {
    expect(lightTimeText(1.28)).toBe('1.3 light-seconds');
    expect(lightTimeText(2254)).toBe('light takes 38 min');
    expect(lightTimeText(17_280)).toBe('light takes 4 h 48 min');
  });

  it('reads disc sizes in arcminutes or arcseconds', () => {
    expect(discText(1860)).toBe('31.0′');
    expect(discText(44.2)).toBe('44″');
    expect(discText(0.62)).toBe('0.6″');
  });
});
