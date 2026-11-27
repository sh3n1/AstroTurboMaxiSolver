import { describe, expect, it } from 'vitest';

import { bearingInViewDeg, viewBasis } from './astronomy';
import { mountBearingDeg } from './mount-guidance';

describe('guidance along the mount', () => {
  it('points up, down, right and left along the axes', () => {
    const pointing = { altDeg: 40, azDeg: 180 };
    expect(mountBearingDeg(pointing, { altDeg: 50, azDeg: 180 })).toBeCloseTo(0, 6);
    expect(mountBearingDeg(pointing, { altDeg: 30, azDeg: 180 })).toBeCloseTo(180, 6);
    // Azimuth growing is to the right, as on the map.
    expect(mountBearingDeg(pointing, { altDeg: 40, azDeg: 200 })).toBeCloseTo(90, 6);
    expect(mountBearingDeg(pointing, { altDeg: 40, azDeg: 160 })).toBeCloseTo(270, 6);
  });

  it('turns round in azimuth instead of going over the zenith', () => {
    // Low in the east to low in the west: the shortest path goes straight up.
    const east = { altDeg: 30, azDeg: 90 };
    const west = { altDeg: 30, azDeg: 270 };
    expect(bearingInViewDeg(viewBasis(east), west)).toBeCloseTo(0, 6);
    const bearing = mountBearingDeg(east, west);
    expect(bearing === 90 || bearing === 270).toBe(true);
  });

  it('takes the short way round in azimuth, across north', () => {
    expect(mountBearingDeg({ altDeg: 40, azDeg: 350 }, { altDeg: 40, azDeg: 10 })).toBeCloseTo(90, 6);
    expect(mountBearingDeg({ altDeg: 40, azDeg: 10 }, { altDeg: 40, azDeg: 350 })).toBeCloseTo(270, 6);
  });

  it('points straight at a target close by, as the map shows it', () => {
    const pointing = { altDeg: 60, azDeg: 120 };
    const near = { altDeg: 61, azDeg: 122 };
    // Within a couple of degrees: the lines of azimuth meet towards the zenith.
    const difference = mountBearingDeg(pointing, near) - bearingInViewDeg(viewBasis(pointing), near);
    expect(Math.abs(difference)).toBeLessThan(2);
  });
});
