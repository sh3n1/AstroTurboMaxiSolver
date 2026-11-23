// The app's own line icons for the puck (docs/puck.md, `icon`): the planets' for its map and
// lists, and the galaxies', nebulae's, double stars' and constellations' for its lists
// (target-icons.ts), flattened into lines of points, since the puck has no SVG. Sent once
// each link, one message per icon. Plain functions, so they can be tested without a link.

import type { IconPath } from '../catalog/target-icons';
import { ICON_BODIES, KIND_ICONS, phaseIcon, planetIcon } from '../catalog/target-icons';
import type { Target } from '../catalog/targets';

/** One line of an icon: points on the 24 grid as x, y, x, y…; dashed or filled as the app's. */
export interface PuckIconLine {
  p: number[];
  dashed?: true;
  fill?: true;
}

export interface PuckIconMessage {
  t: 'icon';
  /** The body it draws, as the `objects` message's `id`: "Saturn". */
  body: string;
  paths: PuckIconLine[];
}

type Point = [number, number];

/** Arcs are cut into straight steps of at most this angle: smooth at the puck's icon sizes. */
const ARC_STEP_RAD = Math.PI / 12;
const CURVE_STEPS = 8;

/** The angle from one vector to another, signed, in radians. */
function angleBetween(ux: number, uy: number, vx: number, vy: number): number {
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

/**
 * The points along an SVG elliptical arc from (x1, y1), after the first: the SVG
 * specification's conversion from end points to a centre (its appendix "Elliptical arc
 * implementation notes").
 */
function arcPoints(
  [x1, y1]: Point,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  [x2, y2]: Point,
): Point[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [[x2, y2]];
  const phi = (rotationDeg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  // Radii too small to join the points are scaled up just enough.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const start = angleBetween(1, 0, ux, uy);
  let delta = angleBetween(ux, uy, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const steps = Math.max(2, Math.ceil(Math.abs(delta) / ARC_STEP_RAD));
  return Array.from({ length: steps }, (_, i) => {
    const angle = start + (delta * (i + 1)) / steps;
    const [ex, ey] = [rx * Math.cos(angle), ry * Math.sin(angle)];
    return [cx + ex * cos - ey * sin, cy + ex * sin + ey * cos] as Point;
  });
}

/** Points along a Bézier curve through its control points, after the first. */
function curvePoints(controls: Point[]): Point[] {
  return Array.from({ length: CURVE_STEPS }, (_, i) => {
    let points = controls;
    const t = (i + 1) / CURVE_STEPS;
    // De Casteljau: each round blends neighbours, until one point is left.
    while (points.length > 1) {
      points = points.slice(1).map((p, k) => [p[0] * t + points[k][0] * (1 - t), p[1] * t + points[k][1] * (1 - t)]);
    }
    return points[0];
  });
}

/**
 * Flattens SVG path data into lines of points: one line per subpath. Knows the commands
 * the app's icons use: M, L, H, V, Q, C, S, A and Z, upper case and lower.
 */
export function flattenPath(d: string): Point[][] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const lines: Point[][] = [];
  let line: Point[] = [];
  let at: Point = [0, 0];
  let start: Point = [0, 0];
  let lastControl: Point | null = null;
  let command = '';
  let i = 0;
  const number = (): number => Number(tokens[i++]);
  const finish = (): void => {
    if (line.length > 1) lines.push(line);
    line = [];
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
    const relative = command === command.toLowerCase();
    const point = (): Point => {
      const [x, y] = [number(), number()];
      return relative ? [at[0] + x, at[1] + y] : [x, y];
    };
    let control: Point | null = null;
    switch (command.toUpperCase()) {
      case 'M':
        finish();
        at = start = point();
        line = [at];
        // More pairs after a move are lines.
        command = relative ? 'l' : 'L';
        break;
      case 'L':
        at = point();
        line.push(at);
        break;
      case 'H':
        at = [relative ? at[0] + number() : number(), at[1]];
        line.push(at);
        break;
      case 'V':
        at = [at[0], relative ? at[1] + number() : number()];
        line.push(at);
        break;
      case 'Q': {
        control = point();
        const end = point();
        line.push(...curvePoints([at, control, end]));
        at = end;
        break;
      }
      case 'C': {
        const first = point();
        control = point();
        const end = point();
        line.push(...curvePoints([at, first, control, end]));
        at = end;
        break;
      }
      case 'S': {
        // The first control mirrors the last curve's second, through the current point.
        const first: Point = lastControl ? [2 * at[0] - lastControl[0], 2 * at[1] - lastControl[1]] : at;
        control = point();
        const end = point();
        line.push(...curvePoints([at, first, control, end]));
        at = end;
        break;
      }
      case 'A': {
        const [rx, ry, rotation, large, sweep] = [number(), number(), number(), number(), number()];
        const end = point();
        line.push(...arcPoints(at, rx, ry, rotation, large === 1, sweep === 1, end));
        at = end;
        break;
      }
      case 'Z':
        line.push(start);
        at = start;
        finish();
        line = [start];
        break;
      default:
        i++; // not a command the icons use: skipped
    }
    lastControl = control;
  }
  finish();
  return lines;
}

const round = (value: number): number => Math.round(value * 10) / 10;

/** One icon's message: each of its paths flattened, each subpath a line of its own. */
export function iconMessage(body: string, icon: readonly IconPath[]): PuckIconMessage {
  const paths = icon.flatMap(({ d, dashed, fill }) =>
    flattenPath(d).map((points): PuckIconLine => {
      // Rounded to a tenth of the grid; a point the same as the one before adds nothing.
      const rounded = points.map(([x, y]) => [round(x), round(y)]);
      const p = rounded.filter((pt, k) => k === 0 || pt[0] !== rounded[k - 1][0] || pt[1] !== rounded[k - 1][1]).flat();
      return { p, ...(dashed ? { dashed: true as const } : {}), ...(fill ? { fill: true as const } : {}) };
    }),
  );
  return { t: 'icon', body, paths };
}

/**
 * Every icon, as the puck's messages: each body's, the Moon's and Venus's in their phase now
 * (from `targets`), as the phone's lists show them, and the kinds' own.
 */
export function iconMessages(targets: readonly Target[]): PuckIconMessage[] {
  const phased = targets.filter((target) => target.body && target.phase);
  const bodies = [...new Set([...ICON_BODIES, ...phased.map((target) => target.body!)])];
  const bodyIcons = bodies.flatMap((body) => {
    const phase = phased.find((target) => target.body === body)?.phase;
    const icon = phase ? phaseIcon(phase.litFraction, phase.litOnRight) : planetIcon(body);
    return icon ? [iconMessage(body, icon)] : [];
  });
  return [...bodyIcons, ...Object.entries(KIND_ICONS).map(([kind, icon]) => iconMessage(kind, icon))];
}

/**
 * The name of the icon the phone's lists show for a target (target-list.component.ts): a
 * body's, one of the kinds' own, or else its kind, for the standard ones the puck matches
 * with its own font: Star, Open cluster, Globular cluster and Other.
 */
export function listIconName(target: Target): string {
  if (target.body) return target.body;
  if (target.double || target.kind === 'Double star') return 'Double star';
  return target.kind;
}
