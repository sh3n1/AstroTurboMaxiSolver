import { Injectable } from '@angular/core';

import type { Horizontal, Matrix3 } from '../astronomy/astronomy';

/** What the sky map drew in its last frame, for the puck to mirror (docs/puck.md). */
export interface MapView {
  /** The smoothed pointing the view is centred on, as it appears. */
  pointing: Horizontal;
  /** The view's turn about its centre, as the map draws it (`rotateInView`). */
  rollDeg: number;
  /** The width of sky the map shows, in degrees. */
  fieldDeg: number;
  /** -1 where the image is mirrored that way (`imageFlip`), else 1. */
  flipX: number;
  flipY: number;
  /** Whether the eyepiece view is drawn, rather than the sky map. */
  eyepiece: boolean;
  /** The faintest stars drawn. */
  starLimitMag: number;
  /** J2000 to local, at the frame's moment. */
  rotation: Matrix3;
  /** Counts the frames drawn, so a reader can tell a new one from the last. */
  frame: number;
}

/**
 * The sky map's last frame. The map writes it as it draws; the puck's link reads it a few
 * times a second. A plain field rather than a signal: it changes every frame, and nothing
 * on screen depends on it.
 */
@Injectable({ providedIn: 'root' })
export class MapViewService {
  private view: MapView | null = null;

  /** The last frame drawn, or null before the map has drawn one. */
  get last(): MapView | null {
    return this.view;
  }

  publish(view: Omit<MapView, 'frame'>): void {
    this.view = { ...view, frame: (this.view?.frame ?? 0) + 1 };
  }
}
