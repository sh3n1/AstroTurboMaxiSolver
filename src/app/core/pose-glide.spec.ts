import { describe, expect, it } from 'vitest';

import { separationDeg } from './astronomy';
import { glideFraction, glideHorizontal, stepPose } from './pose-glide';

describe('pose glide', () => {
  it('covers more of the way the longer a frame took, never more than all of it', () => {
    expect(glideFraction(0)).toBe(0);
    expect(glideFraction(16)).toBeGreaterThan(0.2);
    expect(glideFraction(16)).toBeLessThan(0.3);
    expect(glideFraction(60)).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(glideFraction(10_000)).toBeLessThanOrEqual(1);
    expect(glideFraction(-5)).toBe(0);
  });

  it('takes the short way round in azimuth', () => {
    const half = glideHorizontal({ altDeg: 0, azDeg: 350 }, { altDeg: 0, azDeg: 10 }, 0.5);
    expect(half.altDeg).toBeCloseTo(0, 10);
    expect(Math.min(half.azDeg, 360 - half.azDeg)).toBeCloseTo(0, 10);
  });

  it('crosses the zenith along the sky, not round the horizon', () => {
    const from = { altDeg: 80, azDeg: 0 };
    const to = { altDeg: 80, azDeg: 180 };
    const half = glideHorizontal(from, to, 0.5);
    expect(half.altDeg).toBeCloseTo(90, 6);
    // Each step stays between the two, never further from the end than the start was.
    expect(separationDeg(glideHorizontal(from, to, 0.25), to)).toBeLessThan(separationDeg(from, to));
  });

  it('arrives exactly with the whole way, and goes straight there between opposite directions', () => {
    const to = { altDeg: 30, azDeg: 120 };
    const there = glideHorizontal({ altDeg: 10, azDeg: 100 }, to, 1);
    expect(there.altDeg).toBeCloseTo(30, 10);
    expect(there.azDeg).toBeCloseTo(120, 10);
    expect(glideHorizontal({ altDeg: 0, azDeg: 0 }, { altDeg: 0, azDeg: 180 }, 0.5)).toEqual({ altDeg: 0, azDeg: 180 });
  });

  it('only glides the camera while both poses have one', () => {
    const shown = { pointing: { altDeg: 40, azDeg: 90 }, camera: null };
    const target = { pointing: { altDeg: 50, azDeg: 90 }, camera: { altDeg: 60, azDeg: 90 } };
    const step = stepPose(shown, target, 0.5);
    expect(step.camera).toEqual(target.camera);
    expect(step.pointing.altDeg).toBeCloseTo(45, 1);
    expect(stepPose(step, { ...target, camera: null }, 0.5).camera).toBeNull();
  });
});
