// The details box's Tonight chart: how high a target is through the night, over the sky's
// own colours, with its highest point and the best time to look. Plain functions, so they
// can be tested without the page around them.

import type { SkyShade } from './planning-time';
import { skyShade } from './planning-time';

/** The night shown: from 18:00 to 07:00 local time, which covers dusk to dawn most of the year. */
export const NIGHT_START_HOUR = 18;
export const NIGHT_HOURS = 13;
/** Checked every ten minutes: smooth enough for a small chart, and quick. */
const STEP_MINUTES = 10;
/** Below this, haze and buildings dim a target, as in the lists' height badges. */
export const GOOD_ALTITUDE_DEG = 30;

/** One check of the night: the target's height and how dark the sky is. */
export interface NightSample {
  time: Date;
  altDeg: number;
  shade: SkyShade;
}

export interface Tonight {
  start: Date;
  end: Date;
  samples: NightSample[];
  /** Its highest point while the Sun is down, or null if it stays below the horizon then. */
  highest: { time: Date; altDeg: number } | null;
  /** The longest stretch of full darkness with it well up, or null if there is none. */
  best: { from: Date; until: Date } | null;
}

/**
 * The night to show for a time: tonight from the afternoon on, and the night still going
 * on in the early morning. The phone's own time zone sets the clock times.
 */
export function nightWindow(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  // Before noon, the night that started yesterday evening is the one that matters.
  if (now.getHours() < 12) start.setDate(start.getDate() - 1);
  start.setHours(NIGHT_START_HOUR, 0, 0, 0);
  return { start, end: new Date(start.getTime() + NIGHT_HOURS * 3_600_000) };
}

/** Tonight for a target, from its height and the Sun's at any time. */
export function tonight(altitudeAt: (time: Date) => number, sunAltitudeAt: (time: Date) => number, now: Date): Tonight {
  const { start, end } = nightWindow(now);
  const samples: NightSample[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += STEP_MINUTES * 60_000) {
    const time = new Date(t);
    samples.push({ time, altDeg: altitudeAt(time), shade: skyShade(sunAltitudeAt(time)) });
  }

  let highest: Tonight['highest'] = null;
  for (const { time, altDeg, shade } of samples) {
    if (shade !== 'day' && altDeg > 0 && (!highest || altDeg > highest.altDeg)) highest = { time, altDeg };
  }

  // The longest run of checks in full darkness with the target well up.
  let best: Tonight['best'] = null;
  let runStart: Date | null = null;
  samples.forEach(({ time, altDeg, shade }, i) => {
    const good = shade === 'night' && altDeg >= GOOD_ALTITUDE_DEG;
    if (good && !runStart) runStart = time;
    const runEnds = runStart && (!good || i === samples.length - 1);
    if (runEnds && runStart) {
      const until = good ? time : samples[i - 1].time;
      if (!best || until.getTime() - runStart.getTime() > best.until.getTime() - best.from.getTime()) {
        best = { from: runStart, until };
      }
      runStart = null;
    }
  });
  return { start, end, samples, highest, best };
}

/** The chart's shapes, in its own units: `width` across, the horizon at `horizonY`. */
export interface TonightChart {
  /** The sky's shade through the night, as strips. */
  bands: { x: number; width: number; shade: SkyShade }[];
  /** The target's height, as SVG points: its line, and the area under it. */
  line: string;
  area: string;
  /** Where now is, if it falls in the night shown. */
  now: { x: number; y: number } | null;
  peak: { x: number; y: number } | null;
  best: { x: number; width: number } | null;
  /** Every three hours from the start, for the time labels. */
  hours: { x: number; time: Date }[];
  /** The height of the "well up" line. */
  goodY: number;
}

/**
 * Lays out the chart: time across, height up, with 90° at `topY` and the horizon at
 * `horizonY`. Heights below the horizon sit on it, so the line rests there while it's down.
 */
export function tonightChart(night: Tonight, now: Date, width: number, topY: number, horizonY: number): TonightChart {
  const span = night.end.getTime() - night.start.getTime();
  const x = (time: Date): number => round(((time.getTime() - night.start.getTime()) / span) * width);
  const y = (altDeg: number): number => round(horizonY - (Math.max(0, altDeg) / 90) * (horizonY - topY));

  const bands: TonightChart['bands'] = [];
  night.samples.forEach(({ time, shade }, i) => {
    const next = night.samples[i + 1]?.time ?? night.end;
    const last = bands[bands.length - 1];
    if (last?.shade === shade) last.width = round(x(next) - last.x);
    else bands.push({ x: x(time), width: round(x(next) - x(time)), shade });
  });

  const points = night.samples.map(({ time, altDeg }) => `${x(time)},${y(altDeg)}`).join(' ');
  const inNight = now >= night.start && now <= night.end;
  // The height now, between the two checks either side of it.
  const nowAlt = (): number => {
    const i = night.samples.findIndex((sample) => sample.time > now);
    if (i <= 0) return night.samples[0].altDeg;
    const [a, b] = [night.samples[i - 1], night.samples[i]];
    const share = (now.getTime() - a.time.getTime()) / (b.time.getTime() - a.time.getTime());
    return a.altDeg + (b.altDeg - a.altDeg) * share;
  };

  const hours: TonightChart['hours'] = [];
  for (let h = 0; h < NIGHT_HOURS; h += 3)
    hours.push({ x: round((h / NIGHT_HOURS) * width), time: new Date(night.start.getTime() + h * 3_600_000) });

  return {
    bands,
    line: points,
    area: `0,${horizonY} ${points} ${width},${horizonY}`,
    now: inNight ? { x: x(now), y: y(nowAlt()) } : null,
    peak: night.highest ? { x: x(night.highest.time), y: y(night.highest.altDeg) } : null,
    best: night.best ? { x: x(night.best.from), width: round(x(night.best.until) - x(night.best.from)) } : null,
    hours,
    goodY: y(GOOD_ALTITUDE_DEG),
  };
}

const round = (value: number): number => Math.round(value * 10) / 10;
