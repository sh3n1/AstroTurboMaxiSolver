// Draws what the user is looking for on the sky map's canvas: the targets with their icons
// and labels, the crosshair on the selected one, the reticle's rings, and the guidance from
// the rings to the target. Plain functions that keep nothing between frames: see Frame.

import type { Vector3 } from '../astronomy/astronomy';
import { equatorialVector, stereographicRadius, toApparent } from '../astronomy/astronomy';
import { designations } from '../catalog/designations';
import type { IconPath } from '../catalog/target-icons';
import { DISC_RADIUS, ICON_DASH, ICON_GRID, phaseIcon, targetIcon } from '../catalog/target-icons';
import type { Target } from '../catalog/targets';
import { chevronSpacingPx } from '../sky-page/reticle';

import type { Frame } from './draw-sky';
import { drawLabel, font, overlaps } from './draw-sky';
import type { Box, Point, Project } from './sky-style';
import { BELOW_HORIZON_OPACITY, COLOR, isShownAtField } from './sky-style';

/** Objects this far beyond the screen edge are skipped, though their size circle could reach in. */
const OFF_SCREEN_MARGIN_PX = 200;
/** Below this size on screen, an object's real outline is too small to be useful. */
const MIN_SIZE_CIRCLE_PX = 6;
/** Radius of a planet's or the Moon's icon disc on the map, at standard text size. */
const ICON_DISC_PX = 7;
/** Line width of the map's icons, in screen pixels. */
const ICON_LINE_PX = 1.6;
/** Fainter than this, an object's size circle only shows when it is the selected target. */
const MAX_SIZE_CIRCLE_MAG = 6;
/** The guidance chevrons, from the one nearest the reticle outwards. */
const CHEVRON_FADE = [0.35, 0.65, 1];
const CHEVRON_HEIGHT_PX = 8;
const CHEVRON_HALF_WIDTH_PX = 11;
/** Rings smaller than this have no room for a size label. */
const MIN_LABELLED_RING_PX = 30;

/** Canvas versions of the icon paths, made once each, since parsing them every frame is slow. */
const iconPaths = new Map<string, Path2D>();
function iconPath(d: string): Path2D {
  let path = iconPaths.get(d);
  if (!path) {
    // Phases change slowly, but over a long session their old shapes would pile up.
    if (iconPaths.size > 200) iconPaths.clear();
    path = new Path2D(d);
    iconPaths.set(d, path);
  }
  return path;
}

/** What drawTargets shows: the targets, the selected one, the view's width, and where the Sun is. */
export interface TargetsToDraw {
  targets: readonly Target[];
  selected: Target | null;
  /** Width of sky shown, in degrees, which decides how faint a label may be. */
  fieldDeg: number;
  /** The Sun's catalogue position, which the Moon's and Venus's lit sides face. */
  sun: { raDeg: number; decDeg: number };
}

/** Draws target markers and labels, and returns the space the labels took. */
export function drawTargets(frame: Frame, { targets, selected, fieldDeg, sun }: TargetsToDraw): Box[] {
  const { ctx, project, toLocal, scale, textScale, width, height, isEyepiece } = frame;
  const labels: Box[] = [];
  ctx.font = font(frame, 15);
  ctx.textAlign = 'left';
  const sunLocal = toApparent(toLocal, equatorialVector(sun.raDeg, sun.decDeg));

  // The selected target goes first, so its label always wins a clash.
  // Then those above the horizon, so their labels win a clash with faded ones below.
  const others = targets
    .filter((t) => t.id !== selected?.id && isShownAtField(t, fieldDeg))
    .map((target) => ({ target, local: toApparent(toLocal, equatorialVector(target.raDeg, target.decDeg)) }))
    .sort((a, b) => Number(a.local[2] < 0) - Number(b.local[2] < 0));
  const ordered = selected
    ? [{ target: selected, local: toApparent(toLocal, equatorialVector(selected.raDeg, selected.decDeg)) }, ...others]
    : others;
  for (const { target, local } of ordered) {
    const isSelected = target === selected;
    // The selected target always shows in full. The eyepiece view shows everything in full.
    ctx.globalAlpha = local[2] < 0 && !isSelected && !isEyepiece ? BELOW_HORIZON_OPACITY : 1;
    const point = project(local);
    // Drawing markers and labels that are off screen wastes most of the frame's time.
    if (!point || point.x < -OFF_SCREEN_MARGIN_PX || point.x > width + OFF_SCREEN_MARGIN_PX) continue;
    if (point.y < -OFF_SCREEN_MARGIN_PX || point.y > height + OFF_SCREEN_MARGIN_PX) continue;

    // A selected object keeps its own colour, so its kind stays clear. The crosshair marks it.
    const isStar = target.kind === 'Star' || target.kind === 'Double star';
    const color = target.body ? COLOR.solarSystem : isStar ? COLOR.starLabel : COLOR.deepSky;

    // The object's real size, when it is large enough to see at this zoom.
    // Only for the selected target and bright objects, since faint large ones crowd the view.
    const showsSize = isSelected || !!target.body || /^M\d/.test(target.id) || target.mag <= MAX_SIZE_CIRCLE_MAG;
    const sizeRadius = showsSize && target.sizeArcmin ? stereographicRadius(target.sizeArcmin / 60 / 2) * scale : 0;
    // How far the marker reaches from the centre, to keep the label and selection clear of it.
    let markerRadius = sizeRadius;
    if (target.body) {
      // Planets and the Moon show their own icon. It grows to the real size when zoomed
      // in far enough, so the Moon's phase fills the eyepiece view as it would there.
      const discPx = Math.max(sizeRadius, ICON_DISC_PX * textScale);
      // A phase is drawn lit on the right, then turned so the lit side faces the Sun.
      const icon = target.phase ? phaseIcon(target.phase.litFraction, true) : targetIcon(target);
      const angle = target.phase ? directionOnScreen(local, sunLocal, point, project) : 0;
      if (icon) drawIcon(ctx, icon, point, discPx, color, angle);
      markerRadius = (discPx * ICON_GRID) / 2 / DISC_RADIUS;
    } else if (sizeRadius >= MIN_SIZE_CIRCLE_PX) {
      ctx.strokeStyle = isSelected ? color : COLOR.sizeCircle;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(point.x, point.y, sizeRadius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (!isSelected && !isStar) {
      // Stars are already drawn as dots, so only other objects need a small marker.
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
      ctx.stroke();
    }
    if (isSelected) drawTargetMarker(ctx, point, Math.max(6, markerRadius + 3));

    // A constellation's name is already written there, with its lines.
    if (target.kind === 'Constellation') continue;
    // The map labels each object with its best-known designation, such as C20 for NGC 7000.
    const label = designations(target)[0];
    // Skip a label that would overlap one already drawn.
    const offset = Math.max(9, markerRadius + (isSelected ? 15 : 3));
    ctx.fillStyle = color;
    const box: Box = {
      left: point.x + offset,
      right: point.x + offset + ctx.measureText(label).width,
      top: point.y - 10 * textScale,
      bottom: point.y + 7 * textScale,
    };
    if (labels.some((other) => overlaps(box, other))) continue;
    labels.push(box);
    drawLabel(ctx, label, box.left, point.y + 5 * textScale);
  }
  ctx.globalAlpha = 1;
  return labels;
}

/**
 * Draws one of AstroTurboMaxiSolver's line icons centred on a point, sized so its disc has the
 * given radius, and turned by an angle in radians. A dark edge keeps it readable over
 * stars and lines, like the map's labels.
 */
function drawIcon(
  ctx: CanvasRenderingContext2D,
  icon: readonly IconPath[],
  { x, y }: Point,
  discPx: number,
  color: string,
  angle: number,
): void {
  const scale = discPx / DISC_RADIUS;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.translate(-ICON_GRID / 2, -ICON_GRID / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Lengths are in icon units here. Dividing by the scale keeps lines and dashes the
  // same on screen at any size, so a large Moon in the eyepiece still has thin lines.
  const lineWidth = ICON_LINE_PX / scale;
  for (const [edgeColor, width] of [
    [COLOR.sky, lineWidth + 3 / scale],
    [color, lineWidth],
  ] as const) {
    ctx.strokeStyle = edgeColor;
    ctx.fillStyle = edgeColor;
    ctx.lineWidth = width;
    for (const { d, fill, dashed } of icon) {
      const path = iconPath(d);
      ctx.setLineDash(dashed ? ICON_DASH.map((length) => (length * 2) / scale) : []);
      if (fill) ctx.fill(path);
      ctx.stroke(path);
    }
  }
  ctx.restore();
}

/**
 * The direction on screen from a point on the sky towards another, such as from the
 * Moon towards the Sun, as an angle in radians. It takes a tiny step along the sky,
 * so it works even when the Sun is far off screen or below the horizon.
 */
function directionOnScreen(from: Vector3, towards: Vector3, point: Point, project: Project): number {
  const along = towards[0] * from[0] + towards[1] * from[1] + towards[2] * from[2];
  const nudge = (i: number): number => from[i] + 0.001 * (towards[i] - along * from[i]);
  const step: Vector3 = [nudge(0), nudge(1), nudge(2)];
  const next = project(step);
  return next ? Math.atan2(next.y - point.y, next.x - point.x) : 0;
}

/**
 * The selected target: a crosshair of four short rounded strokes, with a gap in the
 * middle so the object itself stays visible. It uses the green the aiming rings turn
 * when the telescope is on target.
 */
function drawTargetMarker(ctx: CanvasRenderingContext2D, { x, y }: Point, gap: number): void {
  // Each stroke runs out from the gap, which keeps clear of the object's icon or size.
  const radius = gap + 10;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]) {
    ctx.moveTo(x + dx * gap, y + dy * gap);
    ctx.lineTo(x + dx * radius, y + dy * radius);
  }
  // A dark edge first, so the crosshair stands out over stars and lines.
  ctx.strokeStyle = COLOR.sky;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = COLOR.onTarget;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

/**
 * AstroTurboMaxiSolver's reticle at the view's centre: rings of these diameters in degrees,
 * the three rings of 0.5°, 2° and 4°, or one the size of the eyepiece's
 * field. Green when on target, and faded by `opacity` while plate solving. Returns the
 * largest ring's radius in pixels, where the guidance starts and a tap is taken.
 */
export function drawReticle(frame: Frame, ringsDeg: readonly number[], isOnTarget: boolean, opacity: number): number {
  const { ctx, scale, centreX: cx, centreY: cy } = frame;
  const color = isOnTarget ? COLOR.onTarget : COLOR.reticle;
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.5;
  ctx.font = font(frame, 13);
  ctx.textAlign = 'left';

  for (const diameterDeg of ringsDeg) {
    const radius = stereographicRadius(diameterDeg / 2) * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();
    // Small rings have no room for a label until zoomed in.
    if (radius >= MIN_LABELLED_RING_PX) {
      // Eyepiece fields such as 0.8333° read better rounded: "0.83°".
      drawLabel(ctx, `${Number(diameterDeg.toFixed(2))}°`, cx + radius * 0.72 + 4, cy - radius * 0.72 - 4);
    }
  }
  ctx.globalAlpha = 1;
  return stereographicRadius(Math.max(...ringsDeg) / 2) * scale;
}

/**
 * Points from the reticle to the selected target: chevrons just outside a circle of this
 * radius around the view's centre, in the direction of `angle` in radians, and a dashed
 * guide line to the target's place on the canvas once it is in view.
 */
export function drawPointer(
  frame: Frame,
  radius: number,
  angle: number,
  target: Point | null,
  distanceDeg: number,
): void {
  const { ctx, width, height, centreX: cx, centreY: cy } = frame;
  const [dirX, dirY] = [Math.sin(angle), -Math.cos(angle)];

  // A dashed line joins the rings to the target once it is in view.
  const isInView = !!target && target.x >= 0 && target.x <= width && target.y >= 0 && target.y <= height;
  if (target && isInView && Math.hypot(target.x - cx, target.y - cy) > radius + 40) {
    ctx.strokeStyle = COLOR.guide;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(cx + dirX * (radius + 34), cy + dirY * (radius + 34));
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawChevrons(ctx, cx + dirX * (radius + 4), cy + dirY * (radius + 4), angle, distanceDeg);
}

/**
 * A trail of chevrons from a point, towards `angle` in radians, that brightens towards the
 * target, so the eye follows it outwards. They spread apart the farther away the target is.
 */
export function drawChevrons(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  distanceDeg: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = COLOR.guide;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Wide gaps mean the target is far away, so move quickly. Tight gaps mean slow down.
  const spacing = chevronSpacingPx(distanceDeg);
  for (const [index, alpha] of CHEVRON_FADE.entries()) {
    const tip = -index * spacing - CHEVRON_HEIGHT_PX;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(-CHEVRON_HALF_WIDTH_PX, tip + CHEVRON_HEIGHT_PX);
    ctx.lineTo(0, tip);
    ctx.lineTo(CHEVRON_HALF_WIDTH_PX, tip + CHEVRON_HEIGHT_PX);
    ctx.stroke();
  }
  ctx.restore();
}
