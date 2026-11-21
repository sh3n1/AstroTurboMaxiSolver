// AstroTurboMaxiSolver's own icons for ideas Ionic has no good symbol for, drawn like the target
// icons: thin lines on the same 24 × 24 grid. Each means one thing everywhere it appears,
// so no Ionic icon has to stand for two ideas. Ready as image URLs for an ion-icon's src.

import type { IconPath } from './catalog/target-icons';
import { CONSTELLATION, circle, iconDataUrl } from './catalog/target-icons';

/** The app's reticle: three rings, as on the sky map. For "In the reticle". */
const RETICLE: IconPath[] = [{ d: circle(12, 12, 2) }, { d: circle(12, 12, 6) }, { d: circle(12, 12, 10.5) }];

/** How bright the sky is: three bars rising like a scale, the lowest filled. For the Bortle class. */
const SKY_DARKNESS: IconPath[] = [
  { d: 'M3.5 15h4v5.5h-4Z', fill: true },
  { d: 'M10 10h4v10.5h-4Z' },
  { d: 'M16.5 4h4v16.5h-4Z' },
];

/** Brightness: three dots, bright to faint. For magnitudes. */
const MAGNITUDE: IconPath[] = [
  { d: circle(5, 12, 3.4), fill: true },
  { d: circle(13, 12, 2.3), fill: true },
  { d: circle(19.5, 12, 1.4), fill: true },
];

/** Seeing: the air's ripples that make stars twinkle and blur. */
const SEEING: IconPath[] = [{ d: 'M2.5 8.5c3-3 6 3 9.5 0s6.5 3 9.5 0' }, { d: 'M2.5 15.5c3-3 6 3 9.5 0s6.5 3 9.5 0' }];

/**
 * An eyepiece seen from the side: the wide eye lens housing on top, a grip line, and the
 * narrower barrel that slides into the focuser. For the eyepiece view.
 */
const EYEPIECE: IconPath[] = [{ d: 'M6 3.5h12v8H6Z' }, { d: 'M6 7.5h12' }, { d: 'M8.5 11.5v9h7v-9' }];

/**
 * A hand remote: a rounded body with a big round button and two small ones. For Remote, where
 * a second phone or the puck works this phone from the hand.
 */
const REMOTE: IconPath[] = [
  { d: 'M8.5 2.5h7a2.5 2.5 0 0 1 2.5 2.5v14a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 19V5a2.5 2.5 0 0 1 2.5-2.5Z' },
  { d: circle(12, 8.5, 2.6) },
  { d: circle(9.7, 15, 1), fill: true },
  { d: circle(14.3, 15, 1), fill: true },
];

/** The icons as image URLs, made once. */
export const APP_ICONS = {
  reticle: iconDataUrl(RETICLE),
  skyDarkness: iconDataUrl(SKY_DARKNESS),
  magnitude: iconDataUrl(MAGNITUDE),
  seeing: iconDataUrl(SEEING),
  eyepiece: iconDataUrl(EYEPIECE),
  remote: iconDataUrl(REMOTE),
  constellation: iconDataUrl(CONSTELLATION),
} as const;

/** Whether an icon is one of these images rather than an Ionic icon's name. */
export const isIconUrl = (icon: string): boolean => icon.startsWith('data:');
