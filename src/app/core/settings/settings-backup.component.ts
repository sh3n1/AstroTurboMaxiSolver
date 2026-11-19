import { Component, inject } from '@angular/core';
import { AlertController, IonIcon, IonItem, IonLabel, IonList, IonListHeader, ToastController } from '@ionic/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { archiveOutline, refreshOutline } from 'ionicons/icons';

import { appLocale } from '../i18n/t';
import { listToastPlace } from '../lists/list-toast';
import type { BackupContent } from '../storage/backup';
import { BackupService } from '../storage/backup.service';

import { SETTINGS_SECTION_STYLES } from './settings-styles';

/** How long the "restored" message shows before the app reloads with what was restored. */
const RELOAD_AFTER_MS = 1500;

/**
 * A full backup of the log, lists, kit and settings, as one zip file, as a section of
 * Settings: to save one, and to restore one, after saying what it holds.
 */
@Component({
  selector: 'app-settings-backup',
  imports: [TranslatePipe, IonIcon, IonItem, IonLabel, IonList, IonListHeader],
  styles: [SETTINGS_SECTION_STYLES],
  template: `
    <ion-list inset="true" data-testid="backup">
      <ion-list-header>{{ 'backup.title' | translate }}</ion-list-header>
      <ion-item button detail="false" data-testid="backup-save" (click)="save()">
        <ion-icon slot="start" name="archive-outline" aria-hidden="true"></ion-icon>
        <ion-label class="ion-text-wrap">
          <h2>{{ 'backup.save' | translate }}</h2>
          <p>{{ 'backup.saveNote' | translate }}</p>
        </ion-label>
      </ion-item>
      <ion-item button detail="false" lines="none" data-testid="backup-restore" (click)="fileInput.click()">
        <ion-icon slot="start" name="refresh-outline" aria-hidden="true"></ion-icon>
        <ion-label class="ion-text-wrap">
          <h2>{{ 'backup.restore' | translate }}</h2>
          <p>{{ 'backup.restoreNote' | translate }}</p>
        </ion-label>
      </ion-item>
    </ion-list>
    <!-- The phone's file picker, for the backup to restore. -->
    <input
      #fileInput
      type="file"
      accept=".zip,application/zip"
      hidden
      data-testid="backup-file"
      (change)="pick($event)"
    />
  `,
})
export class SettingsBackupComponent {
  private readonly backup = inject(BackupService);
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);
  private readonly translate = inject(TranslateService);

  constructor() {
    addIcons({ archiveOutline, refreshOutline });
  }

  protected async save(): Promise<void> {
    try {
      await this.backup.save();
    } catch {
      await this.tell(this.t('backup.saveFailed'));
    }
  }

  /** Reads the file picked, says what it holds, and restores it once confirmed. */
  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // The same file can be picked again next time.
    input.value = '';
    if (!file) return;
    let content: BackupContent;
    try {
      content = await this.backup.read(file);
    } catch (error) {
      await this.tell(error instanceof Error ? error.message : this.t('backup.notOurs'));
      return;
    }
    if (await this.confirm(content)) await this.restore(content);
  }

  /** Asks before restoring, with when the backup was made and what it holds. */
  private async confirm(content: BackupContent): Promise<boolean> {
    const alive = (records: readonly { deletedAt: number | null }[]): number =>
      records.filter((record) => record.deletedAt === null).length;
    const alert = await this.alerts.create({
      header: this.t('backup.confirmHeader'),
      message: this.t('backup.confirmMessage', {
        date: new Date(content.createdAt).toLocaleDateString(appLocale(), {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        entries: alive(content.records.logEntry),
        lists: alive(content.records.list),
        kit: alive(content.records.kit),
      }),
      htmlAttributes: { 'data-testid': 'backup-confirm' },
      buttons: [
        { text: this.t('common.cancel'), role: 'cancel' },
        { text: this.t('backup.restoreButton'), role: 'confirm' },
      ],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === 'confirm';
  }

  /** Restores, says so, and reloads, so every page starts from what was restored. */
  private async restore(content: BackupContent): Promise<void> {
    try {
      await this.backup.restore(content);
    } catch {
      await this.tell(this.t('backup.restoreFailed'));
      return;
    }
    await this.tell(this.t('backup.restored'), RELOAD_AFTER_MS);
    setTimeout(() => window.location.reload(), RELOAD_AFTER_MS);
  }

  private async tell(message: string, duration = 4000): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration,
      ...listToastPlace(),
      cssClass: 'af-toast',
      htmlAttributes: { 'data-testid': 'backup-toast' },
    });
    await toast.present();
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params) as string;
  }
}
