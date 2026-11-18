import { describe, expect, it } from 'vitest';

import type { OpenMeteoResponse } from './forecast';
import {
  FORECAST_LEVELS,
  forecastAt,
  forecastIsFor,
  forecastUrl,
  parseForecast,
  roundForForecast,
  seeingQuality,
} from './forecast';

const HOUR = 3_600_000;

/** An Open-Meteo answer for two hours over a standard atmosphere. */
function response(): OpenMeteoResponse {
  const hourly: OpenMeteoResponse['hourly'] = {
    time: [1_794_182_400, 1_794_186_000],
    cloud_cover: [10, null],
    temperature_2m: [15, 15],
    temperature_80m: [14.6, 14.6],
    surface_pressure: [1012, 1012],
  };
  for (const p of FORECAST_LEVELS) {
    const heightM = p > 226.3 ? 44_331 * (1 - (p / 1013.25) ** 0.19026) : 11_000 + 6_341.6 * Math.log(226.3 / p);
    hourly[`geopotential_height_${p}hPa`] = [heightM, heightM];
    hourly[`temperature_${p}hPa`] = [heightM < 11_000 ? 15 - 0.0065 * heightM : -56.5, null];
  }
  return { latitude: 39.5, longitude: -0.4, elevation: 10, hourly };
}

describe('forecast', () => {
  it('sends the place only to a tenth of a degree', () => {
    expect(roundForForecast(39.4699)).toBe(39.5);
    expect(roundForForecast(-0.3763)).toBe(-0.4);
    const url = new URL(forecastUrl(39.4699, -0.3763));
    expect(url.searchParams.get('latitude')).toBe('39.5');
    expect(url.searchParams.get('longitude')).toBe('-0.4');
    expect(url.searchParams.get('hourly')).toContain('temperature_30hPa');
  });

  it('turns the answer into hours of cloud and seeing, and leaves out what is missing', () => {
    const forecast = parseForecast(response(), 39.47, -0.38, 1000);
    expect(forecast.fetchedAt).toBe(1000);
    expect(forecast.hours[0].time).toBe(1_794_182_400_000);
    expect(forecast.hours[0].cloudPercent).toBe(10);
    expect(forecast.hours[0].seeingArcsec).toBeGreaterThan(0.3);
    // The second hour has no cloud and no upper-air temperatures.
    expect(forecast.hours[1].cloudPercent).toBeNull();
    expect(forecast.hours[1].seeingArcsec).toBeNull();
  });

  it('knows which place a kept forecast is for', () => {
    const forecast = parseForecast(response(), 39.47, -0.38, 0);
    expect(forecastIsFor(forecast, 39.46, -0.41)).toBe(true);
    expect(forecastIsFor(forecast, 40.42, -3.7)).toBe(false);
  });

  it('finds the hour nearest a time, and nothing outside the forecast', () => {
    const forecast = parseForecast(response(), 39.47, -0.38, 0);
    const first = forecast.hours[0].time;
    expect(forecastAt(forecast, first + 20 * 60_000)?.time).toBe(first);
    expect(forecastAt(forecast, first + 40 * 60_000)?.time).toBe(first + HOUR);
    expect(forecastAt(forecast, first - 2 * HOUR)).toBeNull();
    expect(forecastAt(forecast, first + 5 * HOUR)).toBeNull();
  });

  it('rates seeing for its colour', () => {
    expect(seeingQuality(0.8)).toBe('good');
    expect(seeingQuality(1.2)).toBe('fair');
    expect(seeingQuality(1.7)).toBe('poor');
    expect(seeingQuality(2.4)).toBe('bad');
    // Rated as shown: 0.97 reads 1.0, so it is the same colour as 1.04.
    expect(seeingQuality(0.97)).toBe(seeingQuality(1.04));
    expect(seeingQuality(0.94)).toBe('good');
  });
});
