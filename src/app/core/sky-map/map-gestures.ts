// Tells apart what fingers do on the sky map: one finger taps or drags, two pinch. It only
// follows the fingers. What a tap, a drag or a pinch does to the map is the sky page's part.

import type { Point } from './sky-style';

/** A tap moves less than this, and is over sooner than this. Anything else is a drag. */
const TAP_MAX_MOVE_PX = 10;
const TAP_MAX_MS = 500;

/** What the map does with each gesture. */
export interface GestureHandlers {
  /**
   * A drag or pinch starts, or carries on with the fingers left after one lifts. The map
   * notes where it stands, so the moves that follow are counted from here and it doesn't jump.
   */
  start(): void;
  /** One finger has moved this far, in pixels, since the last start. */
  drag(dx: number, dy: number): void;
  /** Two fingers are this many times as far apart as at the last start: under 1 closes them. */
  pinch(spread: number): void;
  /** One finger went down and up again in place. */
  tap(event: PointerEvent): void;
}

/** Follows the fingers on the map's canvas, from its pointer events. */
export class MapGestures {
  // Fingers currently on the screen. One drags and two pinch.
  private readonly pointers = new Map<number, Point>();
  /** Where the one finger was at the last start. */
  private dragStart?: Point;
  /** How far apart the two fingers were at the last start. */
  private pinchStart?: number;
  /** Where and when a single finger went down, to tell a tap from a drag. */
  private tapStart?: Point & { time: number };

  constructor(private readonly handlers: GestureHandlers) {}

  down(event: PointerEvent): void {
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // Only a single finger can tap. A second one makes it a pinch.
    this.tapStart =
      this.pointers.size === 1 ? { x: event.clientX, y: event.clientY, time: performance.now() } : undefined;
    this.restart();
  }

  move(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pinchStart !== undefined) {
      const [a, b] = [...this.pointers.values()];
      if (a && b) this.handlers.pinch(Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1) / this.pinchStart);
    } else if (this.dragStart) {
      this.handlers.drag(event.clientX - this.dragStart.x, event.clientY - this.dragStart.y);
    }
  }

  /** A finger lifted, or the browser took the touch away (pointercancel), which is never a tap. */
  up(event: PointerEvent): void {
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    const start = this.tapStart;
    const isTap =
      event.type === 'pointerup' &&
      !!start &&
      this.pointers.size === 1 &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < TAP_MAX_MOVE_PX &&
      performance.now() - start.time < TAP_MAX_MS;
    this.tapStart = undefined;
    this.pointers.delete(event.pointerId);
    this.restart();
    if (isTap) this.handlers.tap(event);
  }

  /** Starts a drag or pinch from the current fingers, so the map doesn't jump. */
  private restart(): void {
    const fingers = [...this.pointers.values()];
    this.dragStart = fingers.length === 1 ? { ...fingers[0] } : undefined;
    this.pinchStart =
      fingers.length === 2 ? Math.hypot(fingers[0].x - fingers[1].x, fingers[0].y - fingers[1].y) : undefined;
    this.handlers.start();
  }
}
