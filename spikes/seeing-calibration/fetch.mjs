// Downloads matching forecasts from 7Timer (seeing) and Open-Meteo (GFS upper air) for
// places around the world, so the seeing model can be fitted to 7Timer's values.
// Run: node spikes/seeing-calibration/fetch.mjs   (saves to data/<date>/<place>.json)
import { mkdirSync, writeFileSync } from 'node:fs';

const PLACES = {
  valencia: [39.47, -0.38],
  madrid: [40.42, -3.7],
  london: [51.5, -0.12],
  oslo: [59.91, 10.75],
  la_palma: [28.76, -17.88],
  paranal: [-24.63, -70.4],
  mauna_kea: [19.82, -155.47],
  denver: [39.74, -104.99],
  chicago: [41.88, -87.63],
  miami: [25.76, -80.19],
  tokyo: [35.68, 139.69],
  delhi: [28.61, 77.21],
  sydney: [-33.87, 151.21],
  cape_town: [-33.92, 18.42],
};

/** The pressure levels the app asks Open-Meteo for. Keep in step with forecast.ts. */
export const LEVELS = [
  1000, 975, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 150, 100, 70, 50, 30,
];

function openMeteoUrl(lat, lon) {
  const perLevel = LEVELS.flatMap((p) => ['temperature', 'geopotential_height'].map((v) => `${v}_${p}hPa`));
  const hourly = [...perLevel, 'temperature_2m', 'temperature_80m', 'surface_pressure', 'cloud_cover'].join(',');
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${hourly}` +
    `&models=gfs_seamless&past_days=1&forecast_days=4&wind_speed_unit=ms&timeformat=unixtime&timezone=GMT`
  );
}

const day = new Date().toISOString().slice(0, 13).replace('T', '-');
const folder = new URL(`./data/${day}/`, import.meta.url);
mkdirSync(folder, { recursive: true });
for (const [name, [lat, lon]] of Object.entries(PLACES)) {
  const om = await (await fetch(openMeteoUrl(lat, lon))).json();
  const st = await (
    await fetch(`http://www.7timer.info/bin/api.pl?lon=${lon}&lat=${lat}&product=astro&output=json`)
  ).json();
  writeFileSync(new URL(`${name}.json`, folder), JSON.stringify({ lat, lon, om, sevenTimer: st }));
  console.log(name, st.dataseries?.length, om.hourly?.time?.length);
  await new Promise((r) => setTimeout(r, 1500)); // gentle on the free services
}
