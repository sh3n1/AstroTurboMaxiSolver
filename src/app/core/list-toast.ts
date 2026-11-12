// Where a message about a list goes: at the bottom, so it never covers the header's
// buttons while it shows. Messages over the sky map stay at the top, clear of its boxes.

import type { ToastOptions } from '@ionic/angular';

import { sideways } from './sideways';

/** The tab bar's id, set in the tabs page, for messages to sit just above it. */
const TAB_BAR_ID = 'af-tab-bar';

/**
 * The place for a message on a list page. With the phone upright it sits just above the
 * tab bar. On its side the tab bar is a rail down the left, so it sits at the bottom edge.
 */
export function listToastPlace(): Pick<ToastOptions, 'position' | 'positionAnchor'> {
  return sideways() || !document.getElementById(TAB_BAR_ID)
    ? { position: 'bottom' }
    : { position: 'bottom', positionAnchor: TAB_BAR_ID };
}
