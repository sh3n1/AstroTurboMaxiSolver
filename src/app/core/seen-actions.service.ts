import { Injectable, inject } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';

import { listToastPlace } from './list-toast';
import { LogEntrySheetComponent } from './log-entry-sheet.component';
import { ordinal } from './observing-log';
import { ObservingLogService } from './observing-log.service';
import type { Target } from './targets';

/** Longer than other toasts, to leave time to tap Note. */
const SEEN_TOAST_MS = 6000;

/**
 * Marking a target as seen, the same way from the sky map and from any list: one tap
 * logs it, with a message offering Undo and Note. If it is already logged tonight, the
 * note opens instead of logging it twice.
 */
@Injectable({ providedIn: 'root' })
export class SeenActionsService {
  private readonly log = inject(ObservingLogService);
  private readonly toasts = inject(ToastController);
  private readonly modals = inject(ModalController);

  /**
   * `from` says where it was tapped. Over the map the message goes at the top, clear of
   * the target's box. On a list it goes at the bottom, clear of the header's buttons.
   */
  async markSeen(target: Target, from: 'map' | 'list' = 'map'): Promise<void> {
    const logged = this.log.tonightEntry(target.id);
    if (logged) {
      await this.openLog(target.id, logged.id);
      return;
    }
    const entry = this.log.log(target);
    const times = this.log.timesSeen(target.id);
    const toast = await this.toasts.create({
      message: times > 1 ? `Seen · ${ordinal(times)} time` : 'Seen · first time',
      duration: SEEN_TOAST_MS,
      ...(from === 'list' ? listToastPlace() : { position: 'top' as const }),
      cssClass: 'af-toast',
      htmlAttributes: { 'data-testid': 'seen-toast' },
      buttons: [
        { text: 'Undo', handler: () => this.log.remove(entry.id) },
        { text: 'Note', handler: () => void this.openLog(target.id, entry.id) },
      ],
    });
    await toast.present();
  }

  /**
   * Opens a target's observations: on the entry given, else the newest, else a blank form
   * for the first one.
   */
  async openLog(targetId: string, entryId?: string): Promise<void> {
    const sheet = await this.modals.create({
      component: LogEntrySheetComponent,
      componentProps: { targetId, entryId },
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await sheet.present();
  }
}
