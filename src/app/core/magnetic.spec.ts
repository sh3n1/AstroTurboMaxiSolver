import { describe, expect, it } from 'vitest';

import { magneticDeclinationDeg } from './magnetic';

// Published World Magnetic Model values for 2026, rounded. The test allows a degree,
// since the field drifts slowly over the years.
const DATE = new Date('2026-06-01T00:00:00Z');

describe('magnetic declination', () => {
  it('is small in Valencia, which is why the error went unnoticed there', () => {
    expect(Math.abs(magneticDeclinationDeg(39.47, -0.38, DATE))).toBeLessThan(2.5);
  });

  it('is large and to the east in Seattle', () => {
    expect(magneticDeclinationDeg(47.61, -122.33, DATE)).toBeCloseTo(15, -0.5);
  });

  it('is large and to the west in New York', () => {
    expect(magneticDeclinationDeg(40.71, -74.01, DATE)).toBeCloseTo(-12.5, -0.5);
  });
});
