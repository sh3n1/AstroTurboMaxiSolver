// Fits the seeing model's scales to 7Timer's and meteoblue's forecasts, and reports how
// well they match. Run from the repository root:
//   node spikes/seeing-calibration/fit.ts [data folder ...]   (default: every folder in data/)
import { readdirSync, readFileSync } from 'node:fs';

import type { AirLevel, GroundAir, SeeingTuning } from '../../src/app/core/sky-conditions/seeing.ts';
import { SEEING_TUNING, seeingArcsec, seeingClass } from '../../src/app/core/sky-conditions/seeing.ts';

const LEVELS = [
  1000, 975, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 150, 100, 70, 50, 30,
];
/** The middle of each 7Timer class, in arcseconds. */
const CLASS_MIDDLE = [0, 0.4, 0.625, 0.875, 1.125, 1.375, 1.75, 2.25, 2.75];

/** One forecast hour: the model's input, and what the other forecast says. */
interface Sample {
  place: string;
  levels: AirLevel[];
  ground: GroundAir;
  /** 7Timer's class, 1 to 8, or meteoblue's seeing in arcseconds. */
  theirs: number;
}

const root = new URL('./data/', import.meta.url);
const folders = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(root);
const sevenTimer: Sample[] = [];
const meteoblue: Sample[] = [];
const meteoblueValues = JSON.parse(readFileSync(new URL('./meteoblue-valencia.json', import.meta.url), 'utf8'));

/** The model's input at one hour of an Open-Meteo forecast, or null if any value is missing. */
function inputAt(om: any, i: number): { levels: AirLevel[]; ground: GroundAir } | null {
  const h = om.hourly;
  const levels = LEVELS.map((p) => ({
    pressureHpa: p,
    heightM: h[`geopotential_height_${p}hPa`][i],
    temperatureC: h[`temperature_${p}hPa`][i],
  }));
  const ground = {
    elevationM: om.elevation,
    surfacePressureHpa: h.surface_pressure[i],
    temperature2mC: h.temperature_2m[i],
    temperature80mC: h.temperature_80m[i],
  };
  const values = [...levels.flatMap((l) => [l.heightM, l.temperatureC]), ...Object.values(ground)];
  return values.some((v) => v == null) ? null : { levels, ground };
}

for (const folder of folders) {
  for (const file of readdirSync(new URL(`${folder}/`, root))) {
    const place = file.replace('.json', '');
    const { om, sevenTimer: st } = JSON.parse(readFileSync(new URL(`${folder}/${file}`, root), 'utf8'));
    const init = st.init as string; // "2026110900", UTC
    const start = Date.UTC(+init.slice(0, 4), +init.slice(4, 6) - 1, +init.slice(6, 8), +init.slice(8, 10)) / 1000;
    for (const point of st.dataseries) {
      const i = om.hourly.time.indexOf(start + point.timepoint * 3600);
      const input = i >= 0 && point.seeing >= 1 ? inputAt(om, i) : null;
      if (input) sevenTimer.push({ place, ...input, theirs: point.seeing });
    }
    if (place !== 'valencia') continue;
    for (const [day, hours] of Object.entries(meteoblueValues.days as Record<string, Record<string, number>>)) {
      for (const [hour, arcsec] of Object.entries(hours)) {
        const utc = Date.parse(`${day}T00:00:00Z`) / 1000 + (+hour - meteoblueValues.utcOffsetHours) * 3600;
        const i = om.hourly.time.indexOf(utc);
        const input = i >= 0 ? inputAt(om, i) : null;
        if (input) meteoblue.push({ place: `${day} ${hour.padStart(2, '0')}h`, ...input, theirs: arcsec });
      }
    }
  }
}
console.log(`${sevenTimer.length} hours to compare with 7Timer, ${meteoblue.length} with meteoblue`);

/** Mean squared difference in log seeing: against 7Timer's class middle, and meteoblue's value. */
function costs(t: SeeingTuning): { sevenTimer: number; meteoblue: number } {
  const mean = (samples: Sample[], target: (s: Sample) => number) =>
    samples.reduce((sum, s) => sum + Math.log(seeingArcsec(s.levels, s.ground, t) / target(s)) ** 2, 0) /
    samples.length;
  return {
    sevenTimer: mean(sevenTimer, (s) => CLASS_MIDDLE[s.theirs]),
    meteoblue: meteoblue.length ? mean(meteoblue, (s) => s.theirs) : 0,
  };
}

function report(name: string, t: SeeingTuning): void {
  let exact = 0;
  let withinOne = 0;
  let classError = 0;
  for (const s of sevenTimer) {
    const d = Math.abs(seeingClass(seeingArcsec(s.levels, s.ground, t)) - s.theirs);
    if (d === 0) exact++;
    if (d <= 1) withinOne++;
    classError += d;
  }
  const n = sevenTimer.length;
  const mb = meteoblue.map((s) => seeingArcsec(s.levels, s.ground, t) - s.theirs);
  const mbMean = mb.reduce((a, b) => a + b, 0) / mb.length;
  const mbRms = Math.sqrt(mb.reduce((a, b) => a + b * b, 0) / mb.length);
  console.log(
    `${name}: 7Timer same class ${((100 * exact) / n).toFixed(0)}%, within one ${((100 * withinOne) / n).toFixed(0)}%, ` +
      `mean class error ${(classError / n).toFixed(2)} | meteoblue mean difference ${mbMean.toFixed(2)}″, RMS ${mbRms.toFixed(2)}″`,
  );
}

report('Untuned AXP', SEEING_TUNING);

// A grid search over the scales: simple and dependable.
function fit(sevenTimerWeight: number, meteoblueWeight: number): SeeingTuning {
  let best = SEEING_TUNING;
  let bestCost = Infinity;
  const logRange = (from: number, to: number, steps: number) =>
    Array.from({ length: steps }, (_, i) => 10 ** (from + ((to - from) * i) / (steps - 1)));
  for (const groundScale of logRange(-2, 2, 17))
    for (const freeAirScale of logRange(-2, 2, 17))
      for (const minGradient of [1e-5, 3e-5, 1e-4, 3e-4, 1e-3, 3e-3]) {
        const t = { groundScale, freeAirScale, minGradient };
        const c = costs(t);
        const total = sevenTimerWeight * c.sevenTimer + meteoblueWeight * c.meteoblue;
        if (total < bestCost) [best, bestCost] = [t, total];
      }
  return best;
}
for (const [name, a, b] of [
  ['7Timer only', 1, 0],
  ['meteoblue only', 0, 1],
] as const) {
  const t = fit(a, b);
  console.log(name, t);
  report(name, t);
}
// Both forecasts count equally.
const best = fit(1, 1);
console.log('Fitted to both', best);
report('Fitted to both', best);

// 7Timer's classes against ours: rows 7Timer, columns ours.
const table = Array.from({ length: 9 }, () => Array(9).fill(0));
for (const s of sevenTimer) table[s.theirs][seeingClass(seeingArcsec(s.levels, s.ground, best))]++;
console.log('7Timer \\ ours ' + [1, 2, 3, 4, 5, 6, 7, 8].map((c) => String(c).padStart(4)).join(''));
for (let r = 1; r <= 8; r++)
  console.log(
    `      ${r}       ` +
      table[r]
        .slice(1)
        .map((v) => String(v).padStart(4))
        .join(''),
  );

// By place, to see where it does worse.
for (const place of [...new Set(sevenTimer.map((s) => s.place))]) {
  const own = sevenTimer.filter((s) => s.place === place);
  const ours = own.map((s) => seeingClass(seeingArcsec(s.levels, s.ground, best)));
  const err = own.reduce((sum, s, i) => sum + Math.abs(ours[i] - s.theirs), 0) / own.length;
  console.log(`${place.padEnd(10)} error ${err.toFixed(2)}  7Timer ${own.map((s) => s.theirs).join('')}`);
  console.log(`${''.padEnd(22)}ours   ${ours.join('')}`);
}

// Meteoblue, hour by hour.
console.log('\nValencia      meteoblue  ours');
for (const s of meteoblue) {
  console.log(`${s.place}  ${s.theirs.toFixed(2)}      ${seeingArcsec(s.levels, s.ground, best).toFixed(2)}`);
}
