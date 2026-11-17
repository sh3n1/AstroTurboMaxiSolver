// Draws the sky map's background on its canvas: the grid, the horizon, the stars and the
// constellations. Plain functions that keep nothing between frames: each takes a Frame, the
// one description of the drawing in progress, which the sky page builds once per frame.

import type { Matrix3, Vector3 } from '../astronomy';
import { horizontalVector, normalize, toApparent } from '../astronomy';

import type { Box, Constellation, Point, Project, Star } from './sky-style';
import { BELOW_HORIZON_OPACITY, COLOR, STAR_TINTS } from './sky-style';

/** The drawing in progress: where to draw, and how the sky lies on the canvas at this frame. */
export interface Frame {
  ctx: CanvasRenderingContext2D;
  /** The canvas's size, in CSS pixels. */
  width: number;
  height: number;
  /** From a direction in the local sky to its place on the canvas. */
  project: Project;
  /** Pixels per projected unit: see stereographicRadius. */
  scale: number;
  /** The view's centre on the canvas, where the reticle or the eyepiece's circle goes. */
  centreX: number;
  centreY: number;
  /** The sky's rotation at this very frame, from catalogue positions to the local sky. */
  toLocal: Matrix3;
  /** The text size setting, as a factor. */
  textScale: number;
  /** The eyepiece view, which shows everything in full, even below the horizon. */
  isEyepiece: boolean;
}

const GRID_ALTITUDES_DEG = [30, 60];
const GRID_AZIMUTH_STEP_DEG = 45;
const CARDINALS = [
  { label: 'N', azDeg: 0 },
  { label: 'E', azDeg: 90 },
  { label: 'S', azDeg: 180 },
  { label: 'W', azDeg: 270 },
];

/** A canvas font at a size that follows the text size setting. Labels are semi-bold. */
export function font({ textScale }: Frame, sizePx: number, style = ''): string {
  return `${style} 600 ${Math.round(sizePx * textScale)}px sans-serif`.trim();
}

/** Draws text with a dark outline, so it stays readable over lines and stars. */
export function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLOR.sky;
  ctx.strokeText(text, x, y);
  ctx.restore();
  ctx.fillText(text, x, y);
}

/** Whether two labels' boxes overlap. */
export function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Draws a line through points, lifting the pen wherever a point can't be shown. */
function drawCurve(ctx: CanvasRenderingContext2D, points: (Point | null)[]): void {
  ctx.beginPath();
  let penDown = false;
  for (const point of points) {
    if (!point) {
      penDown = false;
    } else if (penDown) {
      ctx.lineTo(point.x, point.y);
    } else {
      ctx.moveTo(point.x, point.y);
      penDown = true;
    }
  }
  ctx.stroke();
}

/** Faint altitude and azimuth lines, which help judge distance and direction. */
export function drawGrid({ ctx, project }: Frame): void {
  ctx.strokeStyle = COLOR.grid;
  ctx.lineWidth = 1;
  for (const altDeg of GRID_ALTITUDES_DEG) {
    const points = [];
    for (let azDeg = 0; azDeg <= 360; azDeg += 3) points.push(project(horizontalVector({ altDeg, azDeg })));
    drawCurve(ctx, points);
  }
  for (let azDeg = 0; azDeg < 360; azDeg += GRID_AZIMUTH_STEP_DEG) {
    const points = [];
    for (let altDeg = 0; altDeg <= 90; altDeg += 5) points.push(project(horizontalVector({ altDeg, azDeg })));
    drawCurve(ctx, points);
  }
}

/** The constellations' lines, faded where they are below the horizon. */
export function drawConstellationLines({ ctx, project, toLocal }: Frame, constellations: Constellation[]): void {
  // Two paths, so each is stroked once: above the horizon, and below it, faded.
  const above = new Path2D();
  const below = new Path2D();
  const addSegment = (path: Path2D, a: Vector3, b: Vector3): void => {
    const [pa, pb] = [project(a), project(b)];
    if (!pa || !pb) return;
    path.moveTo(pa.x, pa.y);
    path.lineTo(pb.x, pb.y);
  };
  for (const { lines } of constellations) {
    for (const line of lines) {
      const points = line.map((vector) => toApparent(toLocal, vector));
      for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1], points[i]];
        if (a[2] >= 0 && b[2] >= 0) addSegment(above, a, b);
        else if (a[2] < 0 && b[2] < 0) addSegment(below, a, b);
        else {
          // The segment crosses the horizon: split it where it meets the horizon.
          const t = a[2] / (a[2] - b[2]);
          const crossing = normalize([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), 0]);
          addSegment(a[2] >= 0 ? above : below, a, crossing);
          addSegment(b[2] >= 0 ? above : below, crossing, b);
        }
      }
    }
  }
  ctx.strokeStyle = COLOR.constellationLine;
  ctx.lineWidth = 1.5;
  ctx.stroke(above);
  ctx.globalAlpha = BELOW_HORIZON_OPACITY;
  ctx.stroke(below);
  ctx.globalAlpha = 1;
}

/**
 * Constellation names go last and give way to anything already labelled: `labels` is the
 * room the labels drawn so far took, and each name written is added to it.
 */
export function drawConstellationNames(frame: Frame, constellations: Constellation[], labels: Box[]): void {
  const { ctx, project, toLocal, textScale } = frame;
  ctx.fillStyle = COLOR.constellationName;
  ctx.font = font(frame, 14, 'italic');
  ctx.textAlign = 'center';
  for (const { name, label } of constellations) {
    const local = toApparent(toLocal, label);
    const point = project(local);
    if (!point) continue;
    const halfWidth = ctx.measureText(name).width / 2;
    const box: Box = {
      left: point.x - halfWidth,
      right: point.x + halfWidth,
      top: point.y - 10 * textScale,
      bottom: point.y + 7 * textScale,
    };
    if (labels.some((other) => overlaps(box, other))) continue;
    labels.push(box);
    ctx.globalAlpha = local[2] < 0 ? BELOW_HORIZON_OPACITY : 1;
    drawLabel(ctx, name, point.x, point.y + 5 * textScale);
  }
  ctx.globalAlpha = 1;
}

/**
 * The stars, down to a limiting magnitude. The sky map passes every star, brightest first,
 * and drawing stops at the limit. The eyepiece view passes only the stars near where it
 * points, in any order.
 */
export function drawStars(
  { ctx, project, toLocal, width, height, isEyepiece }: Frame,
  stars: Star[],
  limit: number,
): void {
  // Filling stars of a similar brightness and colour as one shape is far faster than
  // filling each on its own, which matters most on older phones.
  const shapes = new Map<number, { path: Path2D; magGroup: number; tint: number; below: boolean }>();
  for (const star of stars) {
    if (star.mag > limit) {
      if (isEyepiece) continue;
      break;
    }
    const local = toApparent(toLocal, star.vector);
    // The sky map fades what is below the horizon. The eyepiece view also serves for
    // planning ahead, so it shows those stars in full.
    const below = local[2] < 0 && !isEyepiece;
    const point = project(local);
    if (!point || point.x < 0 || point.x > width || point.y < 0 || point.y > height) continue;

    const magGroup = Math.floor(star.mag);
    const key = (magGroup * 10 + star.colorIndex) * 2 + (below ? 1 : 0);
    let shape = shapes.get(key);
    if (!shape) {
      shape = { path: new Path2D(), magGroup, tint: star.colorIndex, below };
      shapes.set(key, shape);
    }
    const radius = Math.max(0.8, 3.4 - star.mag * 0.42);
    shape.path.moveTo(point.x + radius, point.y);
    shape.path.arc(point.x, point.y, radius, 0, 2 * Math.PI);
  }

  for (const { path, magGroup, tint, below } of shapes.values()) {
    // Faint stars fade as well as shrink.
    ctx.globalAlpha = Math.min(1, Math.max(0.55, 1.15 - magGroup * 0.1)) * (below ? BELOW_HORIZON_OPACITY : 1);
    ctx.fillStyle = STAR_TINTS[tint];
    ctx.fill(path);
  }
  ctx.globalAlpha = 1;
}

/** The horizon's line, with the compass points written under it. */
export function drawHorizon(frame: Frame): void {
  const { ctx, project, textScale } = frame;
  ctx.strokeStyle = COLOR.horizon;
  ctx.lineWidth = 2;
  const points = [];
  for (let azDeg = 0; azDeg <= 360; azDeg += 2) points.push(project(horizontalVector({ altDeg: 0, azDeg })));
  drawCurve(ctx, points);

  ctx.fillStyle = COLOR.cardinal;
  ctx.font = font(frame, 17, 'bold');
  ctx.textAlign = 'center';
  for (const { label, azDeg } of CARDINALS) {
    const point = project(horizontalVector({ altDeg: 0, azDeg }));
    if (point) drawLabel(ctx, label, point.x, point.y + 22 * textScale);
  }
}

/** Blacks out everything outside the eyepiece's circular field, of this radius in pixels. */
export function drawEyepieceMask({ ctx, width, height, centreX, centreY }: Frame, radius: number): void {
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.arc(centreX, centreY, radius, 0, 2 * Math.PI, true);
  ctx.fill();
  ctx.strokeStyle = '#3a4158';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, 2 * Math.PI);
  ctx.stroke();
}
