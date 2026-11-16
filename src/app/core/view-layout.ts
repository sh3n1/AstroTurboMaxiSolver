// Where the sky map's view sits on the screen, and how large: plain functions, so they
// can be tested without the page around them.

/** The eyepiece view shows a little sky around its circle: this many times its field. */
export const EYEPIECE_VIEW_SCALE = 1.6;
/** With the phone upright, the eyepiece's circle sits this far down, above its panel. */
const EYEPIECE_CENTRE_SHARE = 0.34;
/** With the phone on its side, the circle's diameter is at most this share of the screen's height. */
const SIDEWAYS_CIRCLE_SHARE = 0.92;
/** The circle never gets smaller than this, however little room is left for it. */
const MIN_CIRCLE_RADIUS_PX = 60;
/** With the phone upright, the reticle stays at least this far down, clear of the readout. */
const MIN_CENTRE_Y_PX = 120;

/** The view's centre on the screen, and the width in pixels that its field of view covers. */
export interface ViewLayout {
  centreX: number;
  centreY: number;
  /** The chosen field of view spans this many pixels. */
  spanPx: number;
}

/**
 * The part of the screen's width that is clear, on a phone on its side: from the right
 * edge of what lies at the left (the target's box, or the eyepiece's panel) to the left edge
 * of the column of buttons at the right. In pixels from the map's left edge.
 */
export interface ClearSpan {
  left: number;
  right: number;
}

/**
 * Lays out the view on a screen. With the phone upright, the sky map is centred in the
 * height that `clearBottom` leaves clear above the target's box, and the eyepiece's circle
 * sits above its panel, each spanning the width.
 *
 * With the phone on its side, `clear` says which part of the width nothing covers. The
 * map still spans the whole width, running under the boxes, but its centre, where the
 * reticle is, moves to the middle of the clear part. The eyepiece's circle is fitted
 * inside the clear part, as large as the height allows, so no panel lies over it.
 */
export function viewLayout(
  width: number,
  height: number,
  isEyepiece: boolean,
  clear?: ClearSpan,
  clearBottom?: number,
): ViewLayout {
  if (!clear) {
    if (isEyepiece) return { centreX: width / 2, centreY: height * EYEPIECE_CENTRE_SHARE, spanPx: width };
    // Upright, the reticle sits in the middle of what the target's box leaves clear above it.
    const clearHeight = Math.min(height, clearBottom ?? height);
    return { centreX: width / 2, centreY: Math.max(MIN_CENTRE_Y_PX, clearHeight / 2), spanPx: width };
  }
  const centreX = (clear.left + clear.right) / 2;
  if (!isEyepiece) return { centreX, centreY: height / 2, spanPx: width };
  const radius = Math.max(
    MIN_CIRCLE_RADIUS_PX,
    Math.min((height * SIDEWAYS_CIRCLE_SHARE) / 2, (clear.right - clear.left) / 2),
  );
  return { centreX, centreY: height / 2, spanPx: 2 * radius * EYEPIECE_VIEW_SCALE };
}
