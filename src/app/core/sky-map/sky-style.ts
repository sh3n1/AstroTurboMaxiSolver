// The sky map's look and its rules for what to show: colours for day and night, sizes, and
// which stars and labels a view is wide or narrow enough for. Plain values and functions,
// shared by the drawing code and the sky page, so they can be tested without the app.

import type { Vector3 } from '../astronomy';
import type { Target } from '../targets';
import { THEME } from '../theme';

/**
 * The three views the view button steps through, in this order: the sky map with the
 * three rings, the eyepiece view, and the sky map with one ring the size of the
 * eyepiece's field, to see what will fit in the eyepiece while finding the way there.
 */
export type ViewMode = 'sky' | 'eyepiece' | 'ring';

/** A place on the canvas, in CSS pixels. */
export type Point = { x: number; y: number };

/** Turns a direction in the local sky into its place on the canvas, or null if it can't be shown. */
export type Project = (v: Vector3) => Point | null;

/** A background star, with its direction worked out once. */
export interface Star {
  raDeg: number;
  decDeg: number;
  vector: Vector3;
  mag: number;
  /** Which of STAR_TINTS it is drawn in: see starTintIndex. */
  colorIndex: number;
}

/** A constellation's name, where to write it, and its lines. */
export interface Constellation {
  name: string;
  label: Vector3;
  lines: Vector3[][];
}

/** The room a label takes on the canvas, so labels don't overlap. */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const DEFAULT_FIELD_DEG = 20; // Close enough to read the stars and match a finder's view
export const MIN_FIELD_DEG = 5;
export const MAX_FIELD_DEG = 120;
/** A sky map width kept within the zoom's limits. */
export const clampField = (fieldDeg: number): number => Math.max(MIN_FIELD_DEG, Math.min(MAX_FIELD_DEG, fieldDeg));
export const ZOOM_STEP = 1.5;
export const MAX_ALTITUDE_DEG = 89; // Looking exactly straight up has no defined "right"
export const MIN_ALTITUDE_DEG = -20;

/** Stars known only by catalogue names are labelled to this magnitude: see isShownAtField. */
const UNNAMED_STAR_LABEL_MAG = 4.5;

/**
 * How strongly the sky map draws what is below the horizon: still there, to plan what
 * comes up next, but clearly faded so it isn't mistaken for something visible now.
 */
export const BELOW_HORIZON_OPACITY = 0.35;

// The app's own colours for its sky map and guidance. Night mode turns everything red by
// brightness, so its faint lines and greys are brightened there to stay visible.
const DAY_COLOR = {
  sky: THEME.sky,
  grid: '#141c2e',
  constellationLine: '#2a4170',
  constellationName: '#55709f',
  horizon: '#3f8f6a',
  cardinal: THEME.success,
  reticle: THEME.danger,
  onTarget: THEME.success,
  /** The guidance chevrons and line. The selected target itself is marked in onTarget green. */
  guide: THEME.guidance,
  deepSky: THEME.primary,
  solarSystem: '#ffd479',
  starLabel: THEME.muted,
  sizeCircle: '#4c6aa6',
};
const NIGHT_COLOR: typeof DAY_COLOR = {
  ...DAY_COLOR,
  grid: '#2a3550',
  constellationLine: '#4f6fae',
  constellationName: '#b4c6e8',
  horizon: THEME.success,
  starLabel: THEME.text,
  sizeCircle: '#7f9bd2',
  reticle: '#ffb3b3',
};

/** The colours in use, switched between day and night at the start of each drawing: see useColors. */
export const COLOR = { ...DAY_COLOR };

/** Switches the colours in use to day's or night's, before a frame is drawn. */
export function useColors(nightMode: boolean): void {
  Object.assign(COLOR, nightMode ? NIGHT_COLOR : DAY_COLOR);
}

/** Star tints from hot blue to cool red, chosen by the star's B-V colour index. */
export const STAR_TINTS = ['#b9d0ff', '#f4f6ff', '#fff3d6', '#ffd2a1', '#ffb08a'];

/** Which of STAR_TINTS a star of this B-V colour index is drawn in. */
export function starTintIndex(colorIndex: number): number {
  if (colorIndex < 0) return 0;
  if (colorIndex < 0.4) return 1;
  if (colorIndex < 0.8) return 2;
  if (colorIndex < 1.3) return 3;
  return 4;
}

/** Faint stars only clutter a wide view, so show more of them when zoomed in. */
export function magnitudeLimit(fieldDeg: number): number {
  if (fieldDeg >= 90) return 5.5;
  if (fieldDeg >= 40) return 6;
  return 6.5;
}

/** Hides fainter labelled objects in wide views, where they would crowd the map. */
export function isShownAtField(target: Target, fieldDeg: number): boolean {
  // The Moon and planets always show. Pluto and the asteroids are faint, so they follow
  // the same rules as other faint objects below.
  if (target.kind === 'Moon' || target.kind === 'Planet') return true;
  // The map already writes each constellation's name among its lines.
  if (target.kind === 'Constellation') return false;
  // Stars known only by catalogue names are labelled only zoomed in, and only the brighter
  // ones with a Greek letter, such as "κ Cyg": "HR 7633" and "33 Cyg" would crowd the map.
  if (target.unnamed) {
    return fieldDeg < 25 && target.mag <= UNNAMED_STAR_LABEL_MAG && /^\p{Script=Greek}/u.test(target.id);
  }
  if (target.kind === 'Star') return target.mag <= (fieldDeg >= 60 ? 1.5 : fieldDeg >= 25 ? 3 : 5);
  // There are some 1,400 doubles without a name, so they wait until zoomed in.
  if (target.kind === 'Double star') return fieldDeg < 25 && (fieldDeg < 8 || target.mag <= 6);
  // Messier objects are the familiar showpieces, so they appear sooner. The thousands
  // of NGC and IC objects only appear once zoomed in on them.
  if (/^M\d/.test(target.id)) return target.mag <= (fieldDeg >= 60 ? 7 : 99);
  return target.mag <= (fieldDeg >= 60 ? 4.5 : fieldDeg >= 15 ? 7 : fieldDeg >= 8 ? 10 : 99);
}
