// Astronomical seeing from a weather forecast's temperature profile.
//
// Seeing is the blur the atmosphere adds to a star, as the width of its image in
// arcseconds. It comes from turbulence mixing small temperature differences into the
// air. Weather models don't forecast that turbulence, so it is worked out from how the
// temperature changes with height, with the AXP model (Trinquet & Vernin 2006, PASP 118,
// 756) as 7Timer uses it on the GFS model (Ye 2011, PASP 123, 113):
//
//   1. For each layer, CT² = <CT²>(h) · [A(h) · dθ/dz]^p(h), where θ is the potential
//      temperature and the three coefficients were fitted to balloon flights per kilometre
//      of height. The lowest kilometre has its own sub-layers, since the ground layer adds
//      most of the seeing at night.
//   2. Cn² = CT² · (7.9e-5 · P / T²)², summed through the atmosphere, gives Fried's
//      parameter r0, the width of steady air, and seeing = 0.98 λ / r0.
//
// A scale, fitted to 7Timer's and meteoblue's forecasts in spikes/seeing-calibration,
// corrects for the model's coarse layers. No imports, so that script can run this file
// in Node.

/** The air at one pressure level, as weather models give it. */
export interface AirLevel {
  pressureHpa: number;
  /** Geopotential height above sea level. */
  heightM: number;
  temperatureC: number;
}

/** The air near the ground: where most of the night's seeing comes from. */
export interface GroundAir {
  /** The ground's height above sea level. */
  elevationM: number;
  surfacePressureHpa: number;
  temperature2mC: number;
  temperature80mC: number;
}

/** Scales fitted to other forecasts. See spikes/seeing-calibration/RESULTS.md. */
export interface SeeingTuning {
  /** Scales the turbulence in the lowest kilometre. */
  groundScale: number;
  /** Scales the turbulence above it. */
  freeAirScale: number;
  /** The smallest temperature gradient used, in K/m: mixed air still has some turbulence. */
  minGradient: number;
}

/** Fitted on 2026-11-09 to 336 hours of 7Timer at 14 places and 48 hours of meteoblue in Valencia. */
export const SEEING_TUNING: SeeingTuning = { groundScale: 0.56, freeAirScale: 1.78, minGradient: 0.003 };

/** Visible light, the wavelength seeing is quoted at. */
const WAVELENGTH_M = 500e-9;
const RADIANS_TO_ARCSEC = 206_264.8;
/** The pressure falls by e every this many metres, near the ground. */
const SCALE_HEIGHT_M = 8_000;

/**
 * The AXP coefficients for each kilometre above sea level, from 1 to 26 km
 * (Ye 2011, Table 2): [bottom km, p, A, <CT²>].
 */
const FREE_AIR_LAYERS: readonly (readonly [number, number, number, number])[] = [
  [1, 0.3, 1.8e3, 5.2e-5],
  [2, 1.3, 5.6e2, 4.2e-5],
  [3, 1.7, 4.6e2, 2.8e-5],
  [4, 1.7, 3.8e2, 2.5e-5],
  [5, 2.6, 2.6e2, 1.8e-5],
  [6, 1.1, 4.6e2, 1.5e-5],
  [7, 0.8, 6.8e2, 1.6e-5],
  [8, 0.6, 1.0e3, 1.6e-5],
  [9, 0.3, 2.2e3, 1.9e-5],
  [10, 0.5, 6.8e2, 2.6e-5],
  [11, 0.7, 3.2e2, 3.4e-5],
  [12, 0.6, 2.2e2, 4.4e-5],
  [13, 0.1, 8.3e3, 4.8e-5],
  [14, 0.2, 1.0e3, 5.5e-5],
  [15, -0.4, 3.2e1, 6.5e-5],
  [16, -0.3, 1.5e1, 8.3e-5],
  [17, 2.5, 5.6e1, 1.1e-4],
  [18, -0.9, 2.6e1, 1.1e-4],
  [19, 3.3, 3.8e1, 9.5e-5],
  [20, -1.0, 2.6e1, 8.2e-5],
  [21, 1.5, 4.6e1, 7.4e-5],
  [22, -1.9, 3.2e1, 7.5e-5],
  [23, 1.3, 4.6e1, 8.7e-5],
  [24, 1.1, 3.8e1, 1.1e-4],
  [25, 1.5, 3.8e1, 1.3e-4],
];

/** The ground layer's coefficients: p and A for all three sub-layers. */
const GROUND_P = 0.5;
const GROUND_A = 1.6e2;
/** Steps through the lowest kilometre, where <CT²> changes fast with height. */
const GROUND_STEP_M = 10;

/** Potential temperature: what the air's temperature would be brought down to 1000 hPa. */
export function potentialTemperatureK(temperatureC: number, pressureHpa: number): number {
  return (temperatureC + 273.15) * (1000 / pressureHpa) ** 0.286;
}

/** One point of the temperature profile, sorted by height. */
interface ProfilePoint {
  heightM: number;
  temperatureK: number;
  /** The log of pressure, which changes almost linearly with height. */
  logPressure: number;
}

/**
 * The profile from the ground up: the 2 m and 80 m temperatures, then the pressure
 * levels above them. Levels below the ground, which models fill in by extrapolation,
 * are left out.
 */
export function temperatureProfile(levels: readonly AirLevel[], ground: GroundAir): ProfilePoint[] {
  const near = (aboveGroundM: number, temperatureC: number): ProfilePoint => ({
    heightM: ground.elevationM + aboveGroundM,
    temperatureK: temperatureC + 273.15,
    logPressure: Math.log(ground.surfacePressureHpa) - aboveGroundM / SCALE_HEIGHT_M,
  });
  const above = levels
    .filter((level) => level.heightM > ground.elevationM + 100)
    .map((level) => ({
      heightM: level.heightM,
      temperatureK: level.temperatureC + 273.15,
      logPressure: Math.log(level.pressureHpa),
    }));
  return [near(2, ground.temperature2mC), near(80, ground.temperature80mC), ...above].sort(
    (a, b) => a.heightM - b.heightM,
  );
}

/** The temperature and pressure at a height, interpolated through the profile. */
function airAt(profile: readonly ProfilePoint[], heightM: number): { temperatureK: number; pressureHpa: number } {
  let i = 1;
  while (i < profile.length - 1 && profile[i].heightM < heightM) i++;
  const a = profile[i - 1];
  const b = profile[i];
  const t = (heightM - a.heightM) / (b.heightM - a.heightM);
  return {
    temperatureK: a.temperatureK + t * (b.temperatureK - a.temperatureK),
    pressureHpa: Math.exp(a.logPressure + t * (b.logPressure - a.logPressure)),
  };
}

/** How fast the potential temperature rises with height between two heights, in K/m. */
function thetaGradient(profile: readonly ProfilePoint[], lowerM: number, upperM: number): number {
  const theta = (heightM: number) => {
    const air = airAt(profile, heightM);
    return potentialTemperatureK(air.temperatureK - 273.15, air.pressureHpa);
  };
  return (theta(upperM) - theta(lowerM)) / (upperM - lowerM);
}

/** Cn² from CT², for air at a temperature and pressure. */
function cn2(ct2: number, temperatureK: number, pressureHpa: number): number {
  return ct2 * ((7.9e-5 * pressureHpa) / temperatureK ** 2) ** 2;
}

/** The AXP CT² for a layer: <CT²> · [A · dθ/dz]^p. Mixed or unstable air counts as barely stable. */
function ct2(meanCt2: number, a: number, p: number, gradient: number, tuning: SeeingTuning): number {
  return meanCt2 * (a * Math.max(gradient, tuning.minGradient)) ** p;
}

/** Turbulence in the lowest kilometre above the ground, ∫Cn² dz. */
export function groundTurbulence(
  profile: readonly ProfilePoint[],
  ground: GroundAir,
  tuning: SeeingTuning = SEEING_TUNING,
): number {
  const base = ground.elevationM;
  // As 7Timer does: the lowest 100 m use the gradient from 2 m to about 100 m above the
  // ground, and the rest of the kilometre the gradient from there to about 400 m.
  const lowGradient = thetaGradient(profile, base + 2, base + 80);
  const highGradient = thetaGradient(profile, base + 80, base + 400);
  let total = 0;
  for (let h = GROUND_STEP_M / 2; h < 1000; h += GROUND_STEP_M) {
    const meanCt2 = h < 50 ? 1.4e-2 : h < 100 ? 4.8e-4 * (h / 100) ** -2.6 : 3.4e-5 * (h / 1000) ** -1.1;
    const layer = ct2(meanCt2, GROUND_A, GROUND_P, h < 100 ? lowGradient : highGradient, tuning);
    const air = airAt(profile, base + h);
    total += cn2(layer, air.temperatureK, air.pressureHpa) * GROUND_STEP_M;
  }
  return total;
}

/** Turbulence above the lowest kilometre, ∫Cn² dz, one kilometre at a time. */
export function freeAirTurbulence(
  profile: readonly ProfilePoint[],
  ground: GroundAir,
  tuning: SeeingTuning = SEEING_TUNING,
): number {
  const top = profile[profile.length - 1].heightM;
  let total = 0;
  for (const [bottomKm, p, a, meanCt2] of FREE_AIR_LAYERS) {
    const lower = bottomKm * 1000;
    const upper = lower + 1000;
    // Layers inside the ground's kilometre are counted there, and the profile ends at its top level.
    if (lower < ground.elevationM + 1000 || upper > top) continue;
    const air = airAt(profile, lower + 500);
    const layer = ct2(meanCt2, a, p, thetaGradient(profile, lower, upper), tuning);
    total += cn2(layer, air.temperatureK, air.pressureHpa) * 1000;
  }
  return total;
}

/** Seeing for a total turbulence ∫Cn² dz, in arcseconds: 0.98 λ / r0. */
export function seeingFromTurbulence(integralCn2: number): number {
  const k = (2 * Math.PI) / WAVELENGTH_M;
  const r0 = (0.423 * k * k * integralCn2) ** (-3 / 5);
  return ((0.98 * WAVELENGTH_M) / r0) * RADIANS_TO_ARCSEC;
}

/** Forecast seeing at the zenith, in arcseconds. */
export function seeingArcsec(
  levels: readonly AirLevel[],
  ground: GroundAir,
  tuning: SeeingTuning = SEEING_TUNING,
): number {
  const profile = temperatureProfile(levels, ground);
  const turbulence =
    tuning.groundScale * groundTurbulence(profile, ground, tuning) +
    tuning.freeAirScale * freeAirTurbulence(profile, ground, tuning);
  return seeingFromTurbulence(turbulence);
}

/**
 * 7Timer's seeing classes, as their upper limits in arcseconds: class 1 is under 0.5″,
 * class 8 over 2.5″. Used to compare with 7Timer.
 */
export const SEEING_CLASS_LIMITS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5] as const;

/** The 7Timer class, 1 (best) to 8 (worst), for a seeing in arcseconds. */
export function seeingClass(arcsec: number): number {
  const index = SEEING_CLASS_LIMITS.findIndex((limit) => arcsec < limit);
  return index === -1 ? 8 : index + 1;
}
