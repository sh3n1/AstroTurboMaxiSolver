import { separationDeg } from '../astronomy/astronomy';

import { EYEPIECE_SMOOTHING_MS, SKY_MAP_SMOOTHING_MS, smoothPointing, smoothingFactor } from './view-smoothing';

describe('view smoothing', () => {
  it('covers about two thirds of the way after one time constant', () => {
    expect(smoothingFactor(450, 450)).toBeCloseTo(1 - Math.exp(-1), 9);
  });

  it('follows at once with no smoothing, and not at all with no time passed', () => {
    expect(smoothingFactor(16, 0)).toBe(1);
    expect(smoothingFactor(0, 450)).toBe(0);
  });

  it('smooths the eyepiece view much more than the sky map', () => {
    expect(smoothingFactor(16, EYEPIECE_SMOOTHING_MS)).toBeLessThan(smoothingFactor(16, SKY_MAP_SMOOTHING_MS) / 3);
  });

  it('starts from the first reading', () => {
    expect(smoothPointing(null, { altDeg: 30, azDeg: 100 }, 0.1)).toEqual({ altDeg: 30, azDeg: 100 });
  });

  it('moves part of the way, taking the short way round through north', () => {
    const result = smoothPointing({ altDeg: 0, azDeg: 355 }, { altDeg: 0, azDeg: 5 }, 0.5);
    expect(separationDeg(result, { altDeg: 0, azDeg: 0 })).toBeLessThan(0.01);
  });

  it('calms jitter: alternating readings barely move the view', () => {
    let shown = { altDeg: 40, azDeg: 120 };
    const factor = smoothingFactor(16, EYEPIECE_SMOOTHING_MS);
    let largest = 0;
    for (let i = 0; i < 120; i++) {
      // Readings jump 0.2° back and forth, like a noisy sensor.
      const next = smoothPointing(shown, { altDeg: 40 + (i % 2 ? 0.1 : -0.1), azDeg: 120 }, factor);
      largest = Math.max(largest, separationDeg(next, shown));
      shown = next;
    }
    expect(largest).toBeLessThan(0.01);
  });
});
