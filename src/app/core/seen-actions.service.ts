import { Injectable, inject } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';

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

  async markSeen(target: Target): Promise<void> {
    const logged = this.log.tonightEntry(target.id);
    if (logged) {
      await this.openEntry(logged.id);
      return;
    }
    const entry = this.log.log(target);
    const times = this.log.timesSeen(target.id);
    const toast = await this.toasts.create({
      message: times > 1 ? `Seen · ${ordinal(times)} time` : 'Seen · first time',
      duration: SEEN_TOAST_MS,
      position: 'top',
      cssClass: 'af-toast',
      htmlAttributes: { 'data-testid': 'seen-toast' },
      buttons: [
        { text: 'Undo', handler: () => this.log.remove(entry.id) },
        { text: 'Note', handler: () => void this.openEntry(entry.id) },
      ],
    });
    await toast.present();
  }

  /** Opens a log entry's note sheet. */
  async openEntry(entryId: string): Promise<void> {
    const sheet = await this.modals.create({
      component: LogEntrySheetComponent,
      componentProps: { entryId },
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await sheet.present();
  }
}
