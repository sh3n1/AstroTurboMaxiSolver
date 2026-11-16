// AstroTurboMaxiSolver's own line icons for galaxies, nebulae, double stars, the planets and the Moon.
// Each icon is a few SVG paths on a 24 × 24 grid, drawn as thin lines like the Ionic
// outline icons. The same paths draw the icon in lists (as an SVG image) and on the sky
// map (as canvas paths), so both always look alike.

import type { Target } from './targets';

/** One line of an icon. */
export interface IconPath {
  /** SVG path data, on a 24 × 24 grid with the centre at 12, 12. */
  d: string;
  /** Filled instead of outlined, for the sunlit part of a phase. */
  fill?: boolean;
  /** Dashed, for the unlit edge of a phase. */
  dashed?: boolean;
}

/** The icon grid's size and centre. */
export const ICON_GRID = 24;
const C = ICON_GRID / 2;

/** Line width on the 24 grid, matching the Ionic outline icons (32 on their 512 grid). */
export const ICON_STROKE = 1.5;

/** Dash pattern for unlit edges, on the 24 grid. */
export const ICON_DASH = [1.5, 2];

/** Radius of a planet's disc on the grid, leaving room for rings and line width. */
export const DISC_RADIUS = 7;

/** A circle as path data, since SVG paths have no circle command. */
export function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}

const DISC = circle(C, C, DISC_RADIUS);

/** Turns a point on the grid about the centre, by an angle in degrees. */
function turn(x: number, y: number, angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [C + x * Math.cos(a) - y * Math.sin(a), C + x * Math.sin(a) + y * Math.cos(a)];
}

/** A list of points as path data: short straight steps, fine enough to look smooth. */
function polyline(points: [number, number][]): string {
  return 'M' + points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L');
}

/**
 * A spiral galaxy seen at an angle: a bright core with two arms winding out from it,
 * flattened and tilted the way most galaxies look in a telescope.
 */
function galaxy(): IconPath[] {
  const squash = 0.55; // How round the disc looks. 1 would be seen face on.
  const tilt = -28;
  // Each arm is a spiral that widens as it winds, from the core to the edge.
  const arm = (start: number): string =>
    polyline(
      Array.from({ length: 41 }, (_, i) => {
        const t = (i / 40) * 1.25 * Math.PI;
        const r = 2.2 + 8.6 * (t / (1.25 * Math.PI)) ** 1.2;
        return turn(r * Math.cos(t + start), r * Math.sin(t + start) * squash, tilt);
      }),
    );
  const core = polyline(
    Array.from({ length: 25 }, (_, i) => {
      const t = (i / 24) * 2 * Math.PI;
      return turn(2.2 * Math.cos(t), 2.2 * Math.sin(t) * squash, tilt);
    }),
  );
  return [{ d: core + 'Z', fill: true }, { d: arm(0) }, { d: arm(Math.PI) }];
}

const GALAXY = galaxy();

// A nebula: streaks of glowing gas drifting across the sky, with a young star beside them.
const NEBULA: IconPath[] = [
  { d: 'M2.8 15.6C5.8 11.4 8.8 16.4 12 12.4S18 9 21.2 5.6' },
  { d: 'M4.4 19.6C7.2 16 10 20.4 13.2 16.6S18.2 13.6 20.8 11.4' },
  { d: 'M3.4 10.4C5.6 7.4 8 10.6 10.6 7.6S14.4 4.2 16.6 3.4' },
  // A four-pointed star, filled.
  { d: 'M17.6 15.4L18.24 16.76L19.6 17.4L18.24 18.04L17.6 19.4L16.96 18.04L15.6 17.4L16.96 16.76Z', fill: true },
];

/** A constellation: a few stars joined by lines, like a figure on a star chart. */
function constellation(): IconPath[] {
  const stars: [number, number][] = [
    [3.5, 17],
    [8, 13.5],
    [12.5, 15],
    [15.5, 9.5],
    [20.5, 7],
    [19.5, 17.5],
  ];
  // The figure's lines join the stars in order, with a branch from the middle star.
  const figure = [stars.slice(0, 5), [stars[3], stars[5]]].map((points) => ({ d: polyline(points) }));
  return [...figure, ...stars.map(([x, y]) => ({ d: circle(x, y, 1.3), fill: true }))];
}
export const CONSTELLATION = constellation();

/**
 * Saturn: a smaller disc inside tilted rings. The far half of the rings is hidden
 * behind the disc, and the near half crosses in front of it.
 */
function saturn(): IconPath[] {
  const discRadius = 5;
  const ringX = 10.6; // Half the ring's width
  const ringY = 3.4; // Half its height, from the tilt towards us
  const tilt = (-20 * Math.PI) / 180;
  const point = (t: number): string => {
    const x = ringX * Math.cos(t);
    const y = ringY * Math.sin(t);
    const px = C + x * Math.cos(tilt) - y * Math.sin(tilt);
    const py = C + x * Math.sin(tilt) + y * Math.cos(tilt);
    return `${px.toFixed(2)} ${py.toFixed(2)}`;
  };
  // Draws part of the ring as short straight steps, fine enough to look smooth.
  const ring = (from: number, to: number): string => {
    const steps = Math.max(2, Math.round(Math.abs(to - from) / 0.1));
    const points = Array.from({ length: steps + 1 }, (_, i) => point(from + ((to - from) * i) / steps));
    return `M${points.join('L')}`;
  };
  // Where the ring meets the disc's edge, as an angle round the ring from its right end.
  const meet = Math.acos(Math.sqrt((discRadius ** 2 - ringY ** 2) / (ringX ** 2 - ringY ** 2)));
  return [
    { d: circle(C, C, discRadius) },
    // The near half, below the disc's centre on screen, drawn whole.
    { d: ring(0, Math.PI) },
    // The far half, only outside the disc.
    { d: ring(Math.PI, Math.PI + meet) },
    { d: ring(2 * Math.PI - meet, 2 * Math.PI) },
  ];
}

// Each planet is a disc with the feature an observer knows it by.
/** An asteroid: a lumpy rock with a couple of craters. */
const ASTEROID: IconPath[] = [
  // Long and lumpy, so it can't be mistaken for Mercury's round, cratered disc.
  {
    d: 'M3.4 15.6C2.4 12.6 4.6 10.2 7.2 9.6C8 7 10.6 5.2 13.6 5.4C15.4 4.4 18.6 4.8 19.8 7.2C21.2 9.6 20.2 12 18.4 13.2C17.6 16.2 14.6 17.6 12 17.4C10.2 18.8 7 19.4 5 18C4.2 17.4 3.6 16.6 3.4 15.6Z',
  },
  { d: circle(14.4, 9.4, 1.5) },
  { d: circle(8.8, 14.2, 1.2) },
];

const PLANETS: Record<string, IconPath[]> = {
  // Small, grey and cratered.
  Mercury: [{ d: DISC }, { d: circle(9.6, 10, 1.4) }, { d: circle(14.4, 14.2, 1.8) }, { d: circle(14.2, 8.6, 0.8) }],
  // Venus normally shows its real phase. This gibbous one is only for when that is unknown.
  Venus: phaseIcon(0.6, true),
  // A white polar cap and a dark marking across the disc.
  Mars: [{ d: DISC }, { d: 'M9 6.2Q12 8 15 6.2' }, { d: 'M6.4 13.2C8.6 11.6 10.6 15 13 13.6S16.8 12.4 17.8 13.8' }],
  // Two dark belts and the Great Red Spot.
  Jupiter: [
    { d: DISC },
    { d: 'M5.6 9.4H18.4' },
    { d: 'M5.4 13.6H11.4M16.6 13.6H18.6' },
    { d: 'M11.4 13.6a2.6 1.4 0 1 0 5.2 0a2.6 1.4 0 1 0 -5.2 0Z' },
  ],
  Saturn: saturn(),
  // Rings standing almost upright, since Uranus spins on its side.
  Uranus: [{ d: DISC }, { d: 'M12 1.6C13.6 1.6 13.6 22.4 12 22.4C10.4 22.4 10.4 1.6 12 1.6Z' }],
  // A dark storm and a band of high, bright clouds.
  // Set off centre, so the disc doesn't read as a face.
  Neptune: [{ d: DISC }, { d: 'M8.4 13.6a2.2 1.3 0 1 0 4.4 0a2.2 1.3 0 1 0 -4.4 0Z' }, { d: 'M6.2 9.8Q12 8 17.8 9.8' }],
  // Small and far away: a little disc inside its long, tilted orbit, drawn dashed.
  Pluto: [
    { d: circle(C, C, 4.2) },
    { d: 'M1.6 15.4C1 12.2 10.4 6.4 17.2 6.4C23.6 6.4 23.4 9.4 19.2 12', dashed: true },
  ],
  // A small round world with one bright spot, like the salt deposits in Occator crater.
  Ceres: [{ d: circle(C, C, 5.6) }, { d: circle(13.6, 10.8, 1.2), fill: true }],
  Vesta: ASTEROID,
  Pallas: ASTEROID,
  Juno: ASTEROID,
};

/**
 * A phase: the sunlit part filled, the unlit edge dashed. Used for the Moon and Venus.
 *
 * @param litFraction How much of the disc is lit, from 0 (new) to 1 (full).
 * @param litOnRight Whether the sunlit side is on the right of the icon.
 */
export function phaseIcon(litFraction: number, litOnRight: boolean): IconPath[] {
  const r = DISC_RADIUS;
  const lit = Math.min(1, Math.max(0, litFraction));
  const paths: IconPath[] = [{ d: DISC, dashed: true }];
  if (lit < 0.01) return paths;

  // The terminator is half an ellipse. Its width shrinks to nothing at half phase.
  const terminatorWidth = Math.max(0.01, Math.abs(2 * lit - 1) * r);
  // SVG arcs drawn clockwise on screen have sweep 1. Going from top to bottom round the
  // lit side is clockwise when that side is on the right.
  const limbSweep = litOnRight ? 1 : 0;
  // Coming back up, a gibbous terminator bulges into the dark side and a crescent's
  // bulges into the lit side, so they turn opposite ways.
  const terminatorSweep = lit > 0.5 ? limbSweep : 1 - limbSweep;
  paths.push({
    d: `M${C} ${C - r}A${r} ${r} 0 0 ${limbSweep} ${C} ${C + r}A${terminatorWidth} ${r} 0 0 ${terminatorSweep} ${C} ${C - r}Z`,
    fill: true,
  });
  return paths;
}

/**
 * The custom icon for a target, or null when the target uses a standard Ionic icon.
 * Phases are drawn with the lit side where the target's phase says, which suits lists.
 * The sky map instead turns the icon so the lit side faces the real Sun.
 */
/** A double star: a bright star with a smaller companion beside it. */
const DOUBLE_STAR: IconPath[] = [{ d: circle(9, 14, 4.5) }, { d: circle(17.5, 7, 2.5), fill: true }];

export function targetIcon(target: Target): IconPath[] | null {
  if (target.phase) return phaseIcon(target.phase.litFraction, target.phase.litOnRight);
  if (target.body) return PLANETS[target.body] ?? null;
  if (target.kind === 'Galaxy') return GALAXY;
  if (target.kind === 'Nebula') return NEBULA;
  if (target.kind === 'Constellation') return CONSTELLATION;
  if (target.double) return DOUBLE_STAR;
  return null;
}

/** The icon as an SVG data URL, for an ion-icon's src, so it sits in lists like the others. */
export function iconDataUrl(paths: readonly IconPath[]): string {
  // Fixed icons are the same arrays every time, so their images are made only once.
  const cached = dataUrls.get(paths);
  if (cached) return cached;
  const lines = paths.map(
    ({ d, fill, dashed }) =>
      `<path d="${d}" fill="${fill ? 'currentColor' : 'none'}" stroke-width="${ICON_STROKE}"` +
      ` stroke-linecap="round" stroke-linejoin="round"${dashed ? ` stroke-dasharray="${ICON_DASH.join(' ')}"` : ''}/>`,
  );
  // The ionicon class makes ion-icon draw the lines in the text colour.
  const url =
    `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" ` +
    `viewBox="0 0 ${ICON_GRID} ${ICON_GRID}">${lines.join('')}</svg>`;
  dataUrls.set(paths, url);
  return url;
}

const dataUrls = new WeakMap<readonly IconPath[], string>();
