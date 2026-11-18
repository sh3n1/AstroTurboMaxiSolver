import { Injectable, inject, signal } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';

import { AppState } from '../app-state.service';
import { designationText } from '../catalog/designations';
import type { Target } from '../catalog/targets';
import { rearCameraDirection } from '../sensors/attitude';
import { cameraPointing } from '../sensors/device-orientation';
import { LiveSolverService } from '../solver/live-solver.service';

import { SYNC_CONFIRM_DEG, addSync, syncErrorDeg } from './alignment-sync';

/** How long the result stays, long enough to read at arm's length. */
const TOAST_MS = 3500;

/**
 * Syncs on the selected target: the user has it centred in the eyepiece, a fresh plate
 * solve says where the camera points, and the alignment learns the angle there. See
 * alignment-sync.ts for how syncs are kept and used.
 */
@Injectable({ providedIn: 'root' })
export class AlignmentSyncService {
  private readonly state = inject(AppState);
  private readonly liveSolver = inject(LiveSolverService);
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);

  /** True while a sync's plate solve runs, so a second tap does nothing. */
  readonly syncing = signal(false);

  async syncOn(target: Target): Promise<void> {
    if (this.syncing() || !this.state.alignment()) return;
    this.syncing.set(true);
    try {
      // Never the sensors: only a plate solve is exact enough to sync on.
      const result = await this.liveSolver.solveNow('alignment');
      const alignment = this.state.alignment();
      if (!result.ok) return void this.tell(`Not synced. ${result.reason}`);
      if (!alignment) return;
      const camera = cameraPointing(rearCameraDirection(result.attitude));
      const now = new Date();
      const position = this.state.positionOf(target);
      const errorDeg = syncErrorDeg(alignment, camera, position, now);
      // Far from where the app expected: perhaps another star is centred. Ask first.
      if (errorDeg > SYNC_CONFIRM_DEG && !(await this.confirm(target, errorDeg))) return;
      this.state.alignment.set(addSync(alignment, camera, position, now));
      void this.tell(`Synced, was ${errorDeg.toFixed(2)}° off`);
    } finally {
      this.syncing.set(false);
    }
  }

  private async confirm(target: Target, errorDeg: number): Promise<boolean> {
    const alert = await this.alerts.create({
      header: `${errorDeg.toFixed(1)}° off`,
      message: `Is ${designationText(target) || target.name} centred in the eyepiece?`,
      htmlAttributes: { 'data-testid': 'sync-confirm' },
      buttons: [
        { text: 'No', role: 'cancel' },
        { text: 'Sync', role: 'confirm' },
      ],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === 'confirm';
  }

  private async tell(message: string): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration: TOAST_MS,
      position: 'top',
      cssClass: 'af-toast',
      htmlAttributes: { 'data-testid': 'sync-toast' },
    });
    await toast.present();
  }
}
