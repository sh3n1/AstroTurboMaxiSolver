// The weather forecast for planning: cloud cover and seeing, hour by hour, from
// Open-Meteo (open-meteo.com, data CC BY 4.0, credited in Settings). Plain functions, so
// they can be tested without the app around them. ForecastService fetches and caches.

import type { AirLevel, GroundAir } from './seeing';
import { seeingArcsec } from './seeing';

/** One hour of the forecast. Either value is null where the model gives no data. */
export interface ForecastHour {
  /** The hour, in milliseconds since 1970. */
  time: number;
  /** Total cloud cover, 0 to 100 %. */
  cloudPercent: number | null;
  /** Seeing at the zenith, in arcseconds. */
  seeingArcsec: number | null;
}

/** A forecast for one place, as kept in the cache. */
export interface Forecast {
  /** When it was downloaded, in milliseconds since 1970. */
  fetchedAt: number;
  /** The place it is for, rounded as it was asked for. */
  latitudeDeg: number;
  longitudeDeg: number;
  hours: ForecastHour[];
}

/**
 * The pressure levels the seeing model uses, from near the ground to about 24 km.
 * GFS gives all of them for the whole 16 days.
 */
export const FORECAST_LEVELS = [
  1000, 975, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 150, 100, 70, 50, 30,
] as const;

/**
 * The place is rounded to a tenth of a degree, about 10 km, before it is sent: close
 * enough for the weather, and it doesn't give away exactly where the user is.
 */
export function roundForForecast(deg: number): number {
  return Math.round(deg * 10) / 10;
}

/** The forecast request: GFS, as 7Timer uses, the day before and 16 days ahead. */
export function forecastUrl(latitudeDeg: number, longitudeDeg: number): string {
  const perLevel = FORECAST_LEVELS.flatMap((p) => [`temperature_${p}hPa`, `geopotential_height_${p}hPa`]);
  const hourly = ['cloud_cover', 'temperature_2m', 'temperature_80m', 'surface_pressure', ...perLevel].join(',');
  const params = new URLSearchParams({
    latitude: String(roundForForecast(latitudeDeg)),
    longitude: String(roundForForecast(longitudeDeg)),
    hourly,
    models: 'gfs_seamless',
    past_days: '1',
    forecast_days: '16',
    timeformat: 'unixtime',
    timezone: 'GMT',
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/** The part of Open-Meteo's answer the app reads. */
export interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  elevation: number;
  hourly: Record<string, (number | null)[]> & { time: number[] };
}

/** Turns Open-Meteo's answer into hours of cloud and seeing. */
export function parseForecast(
  response: OpenMeteoResponse,
  latitudeDeg: number,
  longitudeDeg: number,
  fetchedAt: number,
): Forecast {
  const h = response.hourly;
  const hours = h.time.map((seconds, i): ForecastHour => {
    const levels: AirLevel[] = [];
    for (const p of FORECAST_LEVELS) {
      const heightM = h[`geopotential_height_${p}hPa`]?.[i];
      const temperatureC = h[`temperature_${p}hPa`]?.[i];
      if (heightM != null && temperatureC != null) levels.push({ pressureHpa: p, heightM, temperatureC });
    }
    const surfacePressureHpa = h['surface_pressure']?.[i];
    const temperature2mC = h['temperature_2m']?.[i];
    const temperature80mC = h['temperature_80m']?.[i];
    // Seeing needs the air near the ground and most of the levels above.
    const canSee =
      surfacePressureHpa != null &&
      temperature2mC != null &&
      temperature80mC != null &&
      levels.length >= FORECAST_LEVELS.length - 2;
    const ground: GroundAir | null = canSee
      ? { elevationM: response.elevation, surfacePressureHpa, temperature2mC, temperature80mC }
      : null;
    return {
      time: seconds * 1000,
      cloudPercent: h['cloud_cover']?.[i] ?? null,
      seeingArcsec: ground ? Math.round(seeingArcsec(levels, ground) * 100) / 100 : null,
    };
  });
  return {
    fetchedAt,
    latitudeDeg: roundForForecast(latitudeDeg),
    longitudeDeg: roundForForecast(longitudeDeg),
    hours,
  };
}

/** Whether a forecast is for this place, as rounded for the request. */
export function forecastIsFor(forecast: Forecast, latitudeDeg: number, longitudeDeg: number): boolean {
  return (
    forecast.latitudeDeg === roundForForecast(latitudeDeg) && forecast.longitudeDeg === roundForForecast(longitudeDeg)
  );
}

/** The forecast hour nearest a time, or null outside the forecast. */
export function forecastAt(forecast: Forecast, time: number): ForecastHour | null {
  const hours = forecast.hours;
  if (!hours.length) return null;
  const first = hours[0].time;
  const i = Math.round((time - first) / 3_600_000);
  const hour = hours[i];
  return hour && Math.abs(hour.time - time) <= 30 * 60_000 ? hour : null;
}

/** How good the seeing is, for its colour: good under 1″, fair to 1.5″, poor to 2″, then bad. */
export type SeeingQuality = 'good' | 'fair' | 'poor' | 'bad';

/** Seeing as the ruler shows it, to a tenth of an arcsecond. */
export function shownSeeing(arcsec: number): number {
  return Math.round(arcsec * 10) / 10;
}

/** Rated as shown, so two cells that both read "1.0″" are always the same colour. */
export function seeingQuality(arcsec: number): SeeingQuality {
  const shown = shownSeeing(arcsec);
  if (shown < 1) return 'good';
  if (shown < 1.5) return 'fair';
  if (shown < 2) return 'poor';
  return 'bad';
}
