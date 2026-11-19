// Facts about the Moon, the planets, Pluto and the bright asteroids for the details box:
// how far away they are, how big their disc looks, how much of it is lit, and how far
// from the Sun they appear. astronomy-engine works these out for the planets and the
// Moon; the asteroids come from their orbits in minor-planets.ts.

import { AngleFromSun, Body, Illumination, MoonPhase, SearchMoonPhase } from 'astronomy-engine';

import { num, t } from '../i18n/t';

import { minorPlanet, minorPlanetPosition } from './minor-planets';

/** Kilometres in one astronomical unit, the mean distance from the Earth to the Sun. */
export const KM_PER_AU = 149_597_870.7;
/** Seconds light takes to cross one astronomical unit. */
const LIGHT_SECONDS_PER_AU = 499.004784;
/** Arcseconds in a radian, to turn a small angle into arcseconds. */
const ARCSEC_PER_RADIAN = 206_264.806;
/** Days from one new Moon to the next, on average. */
const SYNODIC_MONTH_DAYS = 29.530588;

/** Mean diameters in kilometres. Saturn's is its globe, without the rings. */
const DIAMETERS_KM: Record<string, number> = {
  Moon: 3474.8,
  Mercury: 4879.4,
  Venus: 12_103.6,
  Mars: 6792.4,
  Jupiter: 142_984,
  Saturn: 120_536,
  Uranus: 51_118,
  Neptune: 49_528,
  Pluto: 2376.6,
};

export interface BodyFacts {
  /** Distance from the Earth's centre, in astronomical units. */
  distanceAu: number;
  /** Seconds the light we see left it. */
  lightSeconds: number;
  /** How wide its disc looks, in arcseconds. */
  discArcsec: number;
  /** How much of the disc facing us is sunlit, from 0 to 1. */
  litFraction: number;
  /** The angle between it and the Sun, seen from the Earth. */
  sunAngleDeg: number;
  /** For the Moon only: its age, and its next full and new Moon. */
  moon?: { ageDays: number; nextFull: Date; nextNew: Date };
}

/** How wide a disc looks, in arcseconds, from its size and distance. */
const discArcsec = (diameterKm: number, distanceAu: number): number =>
  (diameterKm / (distanceAu * KM_PER_AU)) * ARCSEC_PER_RADIAN;

/** The facts for a solar-system body at a time, or null for anything else. */
export function bodyFacts(bodyName: string, date: Date): BodyFacts | null {
  const minor = minorPlanet(bodyName);
  if (minor) {
    const { earthDistanceAu, sunAngleDeg, litFraction } = minorPlanetPosition(minor, date);
    return {
      distanceAu: earthDistanceAu,
      lightSeconds: earthDistanceAu * LIGHT_SECONDS_PER_AU,
      discArcsec: discArcsec(minor.diameterKm, earthDistanceAu),
      litFraction,
      sunAngleDeg,
    };
  }
  const diameterKm = DIAMETERS_KM[bodyName];
  if (diameterKm === undefined) return null;

  const body = bodyName as Body;
  const { geo_dist, phase_fraction } = Illumination(body, date);
  const facts: BodyFacts = {
    distanceAu: geo_dist,
    lightSeconds: geo_dist * LIGHT_SECONDS_PER_AU,
    discArcsec: discArcsec(diameterKm, geo_dist),
    litFraction: phase_fraction,
    sunAngleDeg: AngleFromSun(body, date),
  };
  if (body === Body.Moon) {
    // The Moon's phase as an angle: 0° at new Moon, 180° at full, so it gives the age.
    const ageDays = (MoonPhase(date) / 360) * SYNODIC_MONTH_DAYS;
    // A whole month ahead always contains the next of each.
    const nextFull = SearchMoonPhase(180, date, 31)?.date;
    const nextNew = SearchMoonPhase(0, date, 31)?.date;
    if (nextFull && nextNew) facts.moon = { ageDays, nextFull, nextNew };
  }
  return facts;
}

/** A distance for the details box: kilometres for the Moon, astronomical units beyond it. */
export function distanceText(distanceAu: number): string {
  // Rounded to 100 km, with thousands grouped the way the phone's language does it.
  if (distanceAu < 0.01) return t('bodies.km', { km: num(Math.round((distanceAu * KM_PER_AU) / 100) * 100) });
  return t('bodies.au', { au: num(distanceAu, distanceAu < 10 ? 2 : 1) });
}

/** How long light takes to reach us, in the largest unit that reads well. */
export function lightTimeText(seconds: number): string {
  if (seconds < 60) return t('bodies.lightSeconds', { seconds: num(seconds, 1) });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('bodies.lightMinutes', { minutes });
  return t('bodies.lightHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** A disc's apparent size: arcminutes for the Moon, arcseconds for the rest. */
export function discText(arcsec: number): string {
  if (arcsec >= 60) return `${num(arcsec / 60, 1)}′`;
  return arcsec >= 10 ? `${Math.round(arcsec)}″` : `${num(arcsec, 1)}″`;
}
