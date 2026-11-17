import { THEME } from './theme';

// The time control's arithmetic: steps, dragging, days and the colour of the sky through
// the day. Plain functions, so they can be tested without the control around them.

/** The ruler moves in steps of this many minutes: fine enough to plan, easy to land on. */
export const STEP_MINUTES = 5;
const STEP_MS = STEP_MINUTES * 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * How far the chosen time may go from now: a year either way. Planets and asteroids are
 * worked out from orbits that drift further out, and a year covers any season's planning.
 */
export const PLANNING_RANGE_MS = 365 * DAY_MS;

/** A time rounded to the nearest step, such as 23:30 or 23:35. */
export function snapToStep(time: number): Date {
  return new Date(Math.round(time / STEP_MS) * STEP_MS);
}

/** A time kept within the planning range of now. */
export function clampToRange(time: number, now: number): number {
  return Math.min(now + PLANNING_RANGE_MS, Math.max(now - PLANNING_RANGE_MS, time));
}

/**
 * The time after dragging the ruler sideways. The ruler moves like a tape under the
 * marker: dragging it to the left brings later hours to the middle.
 */
export function timeAfterDrag(start: Date, dragPx: number, pxPerHour: number, now: number): Date {
  const time = start.getTime() - (dragPx / pxPerHour) * HOUR_MS;
  return snapToStep(clampToRange(time, now));
}

/** The same time of day, some days later or earlier. Keeps the clock time across a change of summer time. */
export function addDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/** A date in the form ion-datetime uses, "2026-11-14", in the phone's own time zone. */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The time of day of one date, on the day of another "2026-11-14" date. */
export function onDay(time: Date, day: string): Date {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const result = new Date(time);
  result.setFullYear(year, month - 1, dayOfMonth);
  return result;
}

/** How dark the sky is, from how far the Sun is below the horizon. */
export type SkyShade = 'day' | 'civil' | 'nautical' | 'astronomical' | 'night';

/**
 * The sky's colour for each shade, on the time control's ruler and the details' Tonight
 * chart: a clear blue day, darkening step by step into night, so each part of the evening
 * is easy to tell apart at a glance.
 */
export const SKY_SHADE_COLOURS: Record<SkyShade, string> = {
  day: '#4f78b8',
  civil: '#3b4f86',
  nautical: '#283563',
  astronomical: '#182040',
  night: THEME.ink,
};

/**
 * The sky's shade for the Sun's height: day while it is up, then the three twilights,
 * each 6° deeper, and full darkness once it is 18° down, when faint galaxies show.
 */
export function skyShade(sunAltDeg: number): SkyShade {
  if (sunAltDeg > 0) return 'day';
  if (sunAltDeg > -6) return 'civil';
  if (sunAltDeg > -12) return 'nautical';
  if (sunAltDeg > -18) return 'astronomical';
  return 'night';
}
