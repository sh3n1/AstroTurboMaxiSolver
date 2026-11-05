import {
  applyMatrix,
  bearingInViewDeg,
  equatorialToHorizontal,
  equatorialToLocalMatrix,
  equatorialVector,
  greenwichSiderealDeg,
  horizontalVector,
  magnification,
  separationDeg,
  stereographic,
  stereographicRadius,
  toViewCoordinates,
  trueFieldDeg,
  viewBasis,
} from './astronomy';

describe('astronomy', () => {
  // Reference values come from worked examples in Meeus, Astronomical Algorithms.
  it('matches the sidereal time in Meeus example 12.a', () => {
    // 1987 April 10 at 0h UT: mean sidereal time 13h 10m 46.3668s.
    const expected = (13 + 10 / 60 + 46.3668 / 3600) * 15;
    expect(greenwichSiderealDeg(new Date(Date.UTC(1987, 3, 10)))).toBeCloseTo(expected, 3);
  });

  it('matches the altitude and azimuth in Meeus example 13.b', () => {
    // Venus from Washington. The book gives azimuth from south, so add 180°.
    // Hour angle 64.352133° means sidereal time equals RA plus that angle.
    const result = equatorialToHorizontal(100, -6.719892, 38.921389, 164.352133);
    expect(result.altDeg).toBeCloseTo(15.1249, 3);
    expect(result.azDeg).toBeCloseTo(68.0337 + 180, 3);
  });

  it('puts the north celestial pole at an altitude equal to the latitude', () => {
    const result = equatorialToHorizontal(0, 90, 39.47, 123);
    expect(result.altDeg).toBeCloseTo(39.47, 6);
    expect(result.azDeg % 360).toBeCloseTo(0, 6);
  });

  it('gives the same direction from the matrix as from the direct formula', () => {
    const horizontal = equatorialToHorizontal(279.23, 38.78, 39.47, 200);
    const fromMatrix = applyMatrix(equatorialToLocalMatrix(39.47, 200), equatorialVector(279.23, 38.78));
    const direct = horizontalVector(horizontal);
    fromMatrix.forEach((value, i) => expect(value).toBeCloseTo(direct[i], 9));
  });

  it('measures separation between sky positions', () => {
    expect(separationDeg({ altDeg: 10, azDeg: 350 }, { altDeg: 10, azDeg: 10 })).toBeCloseTo(19.696, 2);
    expect(separationDeg({ altDeg: 0, azDeg: 0 }, { altDeg: 0, azDeg: 180 })).toBeCloseTo(180, 6);
  });

  it('points the view bearing towards the target', () => {
    const basis = viewBasis({ altDeg: 30, azDeg: 0 });
    expect(bearingInViewDeg(basis, { altDeg: 50, azDeg: 0 })).toBeCloseTo(0, 6); // Higher is up
    expect(bearingInViewDeg(basis, { altDeg: 30, azDeg: 10 })).toBeGreaterThan(80); // East is right
    expect(bearingInViewDeg(basis, { altDeg: 30, azDeg: 10 })).toBeLessThan(100);
    expect(bearingInViewDeg(basis, { altDeg: 10, azDeg: 0 })).toBeCloseTo(180, 6); // Lower is down
  });

  it('projects a point at the expected stereographic radius', () => {
    const basis = viewBasis({ altDeg: 40, azDeg: 120 });
    const point = stereographic(toViewCoordinates(basis, horizontalVector({ altDeg: 60, azDeg: 120 })));
    expect(Math.hypot(point.x, point.y)).toBeCloseTo(stereographicRadius(20), 9);
  });

  it('calculates eyepiece magnification and field', () => {
    expect(magnification(650, 25)).toBe(26);
    expect(trueFieldDeg(650, 25, 52)).toBe(2);
  });
});
