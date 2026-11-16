// Where a message about a list goes: at the bottom, so it never covers the header's
// buttons while it shows. Messages over the sky map stay at the top, clear of its boxes.

import type { ToastOptions } from '@ionic/angular';

/** The place for a message on a list page: the bottom edge, where nothing else sits. */
export function listToastPlace(): Pick<ToastOptions, 'position' | 'positionAnchor'> {
  return { position: 'bottom' };
}
