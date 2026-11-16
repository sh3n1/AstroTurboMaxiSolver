// Whether the phone is held on its side: a wide, short screen, which the app lays out
// differently. The styles use the same condition in their media queries.

import { signal } from '@angular/core';

/** A phone on its side. Tablets, which are tall either way up, keep the usual layout. */
export const SIDEWAYS_QUERY = '(orientation: landscape) and (max-height: 520px)';

// Tests and old browsers may lack matchMedia: the phone then counts as upright.
const query = typeof matchMedia === 'function' ? matchMedia(SIDEWAYS_QUERY) : null;
const state = signal(query?.matches ?? false);
query?.addEventListener('change', (event) => state.set(event.matches));

/** True while the phone is on its side, for layouts that styles alone can't change. */
export const sideways = state.asReadonly();

/**
 * How far the browser has turned its picture from the phone's upright position, in
 * degrees: 0 upright, 90 with the phone's top to the left, 180 upside down, 270 with its
 * top to the right. Older iPhones only have window.orientation, which says -90 for 270.
 */
export function screenAngleDeg(): number {
  const angle = typeof screen === 'undefined' ? undefined : screen.orientation?.angle;
  if (typeof angle === 'number') return angle;
  const old = (globalThis as { orientation?: unknown }).orientation;
  return typeof old === 'number' ? (old + 360) % 360 : 0;
}
