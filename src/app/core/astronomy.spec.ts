import { Body, Equator, Horizon, Observer } from 'astronomy-engine';

import {
  applyMatrix,
  azimuthChangeDeg,
  bearingInViewDeg,
  compassPoint,
  equatorialVector,
  formatDec,
  formatRa,
  localToEquatorial,
  rotateInView,
  viewRollDeg,
  equatorialToHorizontal,
  fromViewCoordinates,
  horizontalVector,
  magnification,
  separationDeg,
  skyConditions,
  skyRotation,
  solarSystemPosition,
  stereographic,
  stereographicRadius,
  toViewCoordinates,
  trueFieldDeg,
  vectorToHorizontal,
  viewBasis,
} from './astronomy';

const RAD = Math.PI / 180;
const VALENCIA = { lat: 39.47, lon: -0.38 };

/** An independent calculation, to check the library against published formulas. */
function meeusSiderealDeg(date: Date): number {
  const days = date.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545;
  const centuries = days / 36_525;
  const deg = 280.46061837 + 360.98564736629 * days + 0.000387933 * centuries ** 2 - centuries ** 3 / 38_710_000;
  return ((deg % 360) + 360) % 360;
}

function meeusHorizontal(hourAngleDeg: number, decDeg: number, latDeg: number): { altDeg: number; azDeg: number } {
  const [h, d, l] = [hourAngleDeg * RAD, decDeg * RAD, latDeg * RAD];
  const alt = Math.asin(Math.sin(l) * Math.sin(d) + Math.cos(l) * Math.cos(d) * Math.cos(h));
  const az = Math.atan2(
    -Math.cos(d) * Math.sin(h),
    Math.sin(d) * Math.cos(l) - Math.cos(d) * Math.cos(h) * Math.sin(l),
  );
  return { altDeg: alt / RAD, azDeg: ((az / RAD) % 360) + 360 };
}

describe('astronomy', () => {
  describe('reference formulas, from Meeus, Astronomical Algorithms', () => {
    it('match the sidereal time in example 12.a', () => {
      const expected = (13 + 10 / 60 + 46.3668 / 3600) * 15; // 13h 10m 46.3668s
      expect(meeusSiderealDeg(new Date(Date.UTC(1987, 3, 10)))).toBeCloseTo(expected, 3);
    });

    it('match the altitude and azimuth in example 13.b', () => {
      // The book gives azimuth from south, so 180° is added here.
      const result = meeusHorizontal(64.352133, -6.719892, 38.921389);
      expect(result.altDeg).toBeCloseTo(15.1249, 3);
      expect(result.azDeg).toBeCloseTo(68.0337 + 180, 3);
    });
  });

  describe('sky positions from astronomy-engine', () => {
    it('agree with the reference formulas at the J2000 epoch, when precession is zero', () => {
      const date = new Date(Date.UTC(2000, 0, 1, 12));
      const [ra, dec] = [279.23, 38.78]; // Vega
      const expected = meeusHorizontal(meeusSiderealDeg(date) + VALENCIA.lon - ra, dec, VALENCIA.lat);
      const actual = equatorialToHorizontal(skyRotation(date, VALENCIA.lat, VALENCIA.lon), ra, dec);
      expect(separationDeg(actual, expected)).toBeLessThan(0.02);
    });

    it('include precession at later dates', () => {
      const date = new Date(Date.UTC(2026, 10, 5, 20));
      const [ra, dec] = [279.23, 38.78];
      const withoutPrecession = meeusHorizontal(meeusSiderealDeg(date) + VALENCIA.lon - ra, dec, VALENCIA.lat);
      const actual = equatorialToHorizontal(skyRotation(date, VALENCIA.lat, VALENCIA.lon), ra, dec);
      // About 26 years of precession moves this star by a few tenths of a degree.
      const difference = separationDeg(actual, withoutPrecession);
      expect(difference).toBeGreaterThan(0.05);
      expect(difference).toBeLessThan(0.6);
    });

    it('put Polaris close to an altitude equal to the latitude, in the north', () => {
      const position = equatorialToHorizontal(skyRotation(new Date(), VALENCIA.lat, VALENCIA.lon), 37.95, 89.26);
      expect(Math.abs(position.altDeg - VALENCIA.lat)).toBeLessThan(1);
      expect(Math.abs(azimuthChangeDeg(0, position.azDeg))).toBeLessThan(2);
    });
  });

  describe('planets and the Moon', () => {
    const date = new Date(Date.UTC(2026, 10, 5, 20));

    it('have positions consistent with the star positions', () => {
      // The library's own altitude and azimuth for the Moon, a separate calculation path.
      const observer = new Observer(VALENCIA.lat, VALENCIA.lon, 0);
      const ofDate = Equator(Body.Moon, date, observer, true, true);
      const direct = Horizon(date, observer, ofDate.ra, ofDate.dec);

      const { raDeg, decDeg } = solarSystemPosition('Moon', date, VALENCIA.lat, VALENCIA.lon);
      const viaRotation = equatorialToHorizontal(skyRotation(date, VALENCIA.lat, VALENCIA.lon), raDeg, decDeg);
      const expected = { altDeg: direct.altitude, azDeg: direct.azimuth };
      expect(separationDeg(viaRotation, expected)).toBeLessThan(0.02);
    });

    it('have sensible brightness', () => {
      const jupiter = solarSystemPosition('Jupiter', date, VALENCIA.lat, VALENCIA.lon);
      expect(jupiter.mag).toBeLessThan(-1.5);
      expect(jupiter.mag).toBeGreaterThan(-3.5);
    });
  });

  describe('sky conditions', () => {
    it('find a sensible night for Valencia in November', () => {
      const midday = new Date(Date.UTC(2026, 10, 5, 12));
      const { sunAltDeg, darkFrom, darkUntil, moonIlluminatedPercent } = skyConditions(
        midday,
        VALENCIA.lat,
        VALENCIA.lon,
      );
      expect(sunAltDeg).toBeGreaterThan(20);
      expect(darkFrom!.getTime()).toBeGreaterThan(midday.getTime());
      const hours = (darkUntil!.getTime() - darkFrom!.getTime()) / 3_600_000;
      expect(hours).toBeGreaterThan(9);
      expect(hours).toBeLessThan(12);
      expect(moonIlluminatedPercent).toBeGreaterThanOrEqual(0);
      expect(moonIlluminatedPercent).toBeLessThanOrEqual(100);
    });

    it('report no start time when it is already dark', () => {
      const midnight = new Date(Date.UTC(2026, 10, 6, 0));
      const { darkFrom, darkUntil } = skyConditions(midnight, VALENCIA.lat, VALENCIA.lon);
      expect(darkFrom).toBeNull();
      expect(darkUntil!.getTime()).toBeGreaterThan(midnight.getTime());
    });
  });

  describe('readouts', () => {
    it('recovers a sky position from where it appears locally', () => {
      const rotation = skyRotation(new Date(Date.UTC(2026, 10, 5, 20)), VALENCIA.lat, VALENCIA.lon);
      const { raDeg, decDeg } = localToEquatorial(rotation, applyMatrix(rotation, equatorialVector(279.23, 38.78)));
      expect(raDeg).toBeCloseTo(279.23, 9);
      expect(decDeg).toBeCloseTo(38.78, 9);
    });

    it('formats right ascension and declination', () => {
      expect(formatRa(84.15)).toBe('5h 37m');
      expect(formatRa(359.999)).toBe('0h 00m');
      expect(formatDec(38.78)).toBe('+38° 47′');
      expect(formatDec(-5.5)).toBe('−5° 30′');
      expect(formatDec(-0.001)).toBe('+0° 00′');
    });
  });

  describe('view roll', () => {
    const pointing = { altDeg: 0, azDeg: 0 }; // Looking north at the horizon

    it('is zero with the phone level, top up', () => {
      expect(viewRollDeg(pointing, [0, 0, 1])).toBeCloseTo(0, 9);
    });

    it('is negative with the phone turned anticlockwise, top towards the west', () => {
      expect(viewRollDeg(pointing, [-1, 0, 0])).toBeCloseTo(-90, 9);
    });

    it('moves the sky the opposite way on screen, so the sky stays put', () => {
      // Turn the phone anticlockwise, and straight up in the sky is now to the phone's right.
      const onScreen = rotateInView(0, 1, -90);
      expect(onScreen.x).toBeCloseTo(1, 9);
      expect(onScreen.y).toBeCloseTo(0, 9);
    });

    it("puts the phone's own up direction at the top of the screen", () => {
      const phoneUp = { x: Math.sin((30 * Math.PI) / 180), y: Math.cos((30 * Math.PI) / 180) };
      const onScreen = rotateInView(phoneUp.x, phoneUp.y, 30);
      expect(onScreen.x).toBeCloseTo(0, 9);
      expect(onScreen.y).toBeCloseTo(1, 9);
    });
  });

  describe('view maths', () => {
    it('measures separation between sky positions', () => {
      expect(separationDeg({ altDeg: 10, azDeg: 350 }, { altDeg: 10, azDeg: 10 })).toBeCloseTo(19.696, 2);
      expect(separationDeg({ altDeg: 0, azDeg: 0 }, { altDeg: 0, azDeg: 180 })).toBeCloseTo(180, 6);
    });

    it('takes the shortest way round in azimuth', () => {
      expect(azimuthChangeDeg(350, 10)).toBe(20);
      expect(azimuthChangeDeg(10, 350)).toBe(-20);
    });

    it('names compass directions', () => {
      expect(compassPoint(0)).toBe('north');
      expect(compassPoint(359)).toBe('north');
      expect(compassPoint(95)).toBe('east');
      expect(compassPoint(225)).toBe('south-west');
    });

    it('converts between vectors and altitude and azimuth', () => {
      const result = vectorToHorizontal(horizontalVector({ altDeg: 35, azDeg: 200 }));
      expect(result.altDeg).toBeCloseTo(35, 9);
      expect(result.azDeg).toBeCloseTo(200, 9);
    });

    it('converts to view coordinates and back', () => {
      const basis = viewBasis({ altDeg: 40, azDeg: 120 });
      const vector = horizontalVector({ altDeg: 55, azDeg: 100 });
      fromViewCoordinates(basis, toViewCoordinates(basis, vector)).forEach((value, i) =>
        expect(value).toBeCloseTo(vector[i], 9),
      );
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
});
