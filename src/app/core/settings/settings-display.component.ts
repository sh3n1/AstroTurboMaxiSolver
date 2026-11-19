import { Component, computed, inject } from '@angular/core';
import {
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonToggle,
} from '@ionic/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { gridOutline, languageOutline, lockOpenOutline, moonOutline, textOutline } from 'ionicons/icons';

import { AppState } from '../app-state.service';
import { LANGUAGES } from '../i18n/languages';
import { ScreenWakeService } from '../platform/screen-wake.service';

import { SETTINGS_SECTION_STYLES } from './settings-styles';

/**
 * How the app looks, as a section of Settings: its language, the text size, red night mode,
 * keeping the screen on, and the RA and Dec readout.
 */
@Component({
  selector: 'app-settings-display',
  imports: [
    TranslatePipe,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonToggle,
  ],
  styles: [
    SETTINGS_SECTION_STYLES,
    `
      /* The text size choice: a label above three sample letters of growing size. */
      .text-size {
        width: 100%;
        padding: 10px 0 12px;
      }
      .text-size ion-segment {
        margin-top: 8px;
      }
      .text-size ion-segment-button {
        min-height: 44px;
        /* Ionic shows segment text in capitals. These are samples of the text, so keep them as typed. */
        text-transform: none;
      }
      .sample-standard {
        font-size: 16px;
      }
      .sample-large {
        font-size: 19px;
      }
      .sample-extra-large {
        font-size: 23px;
      }
    `,
  ],
  template: `
    <ion-list inset="true">
      <ion-list-header>{{ 'settings.display' | translate }}</ion-list-header>
      <!-- The phone's language by default; choosing one reloads the app in it. -->
      <ion-item>
        <ion-icon slot="start" name="language-outline" aria-hidden="true"></ion-icon>
        <ion-select
          [label]="'settings.language' | translate"
          interface="popover"
          data-testid="language"
          [value]="settings().language"
          (ionChange)="setLanguage($any($event).detail.value)"
        >
          <ion-select-option value="auto">{{ autoLanguageLabel() }}</ion-select-option>
          @for (language of languages; track language.code) {
            <ion-select-option [value]="language.code">{{ language.name }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-icon slot="start" name="text-outline" aria-hidden="true"></ion-icon>
        <div class="text-size">
          <ion-label id="text-size-label">{{ 'settings.textSize' | translate }}</ion-label>
          <ion-segment
            aria-labelledby="text-size-label"
            data-testid="text-size"
            [value]="settings().textSize"
            (ionChange)="state.updateSettings({ textSize: $any($event).detail.value })"
          >
            <ion-segment-button value="standard" [attr.aria-label]="'settings.standard' | translate">
              <ion-label class="sample-standard">Aa</ion-label>
            </ion-segment-button>
            <ion-segment-button value="large" [attr.aria-label]="'settings.large' | translate">
              <ion-label class="sample-large">Aa</ion-label>
            </ion-segment-button>
            <ion-segment-button value="extra-large" [attr.aria-label]="'settings.extraLarge' | translate">
              <ion-label class="sample-extra-large">Aa</ion-label>
            </ion-segment-button>
          </ion-segment>
        </div>
      </ion-item>
      <ion-item>
        <ion-icon slot="start" name="moon-outline" aria-hidden="true"></ion-icon>
        <ion-toggle
          data-testid="night-mode"
          [checked]="settings().nightMode"
          (ionChange)="state.updateSettings({ nightMode: $any($event).detail.checked })"
        >
          {{ 'settings.nightMode' | translate }}
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-icon slot="start" name="lock-open-outline" aria-hidden="true"></ion-icon>
        <ion-toggle
          data-testid="keep-screen-on"
          [helperText]="screenWake.supported ? '' : ('settings.notSupported' | translate)"
          [disabled]="!screenWake.supported"
          [checked]="settings().keepScreenOn && screenWake.supported"
          (ionChange)="state.updateSettings({ keepScreenOn: $any($event).detail.checked })"
        >
          {{ 'settings.keepScreenOn' | translate }}
        </ion-toggle>
      </ion-item>
      <ion-item lines="none">
        <ion-icon slot="start" name="grid-outline" aria-hidden="true"></ion-icon>
        <ion-toggle
          data-testid="show-equatorial"
          [checked]="settings().showEquatorial"
          (ionChange)="state.updateSettings({ showEquatorial: $any($event).detail.checked })"
        >
          {{ 'settings.showEquatorial' | translate }}
        </ion-toggle>
      </ion-item>
    </ion-list>
  `,
})
export class SettingsDisplayComponent {
  protected readonly state = inject(AppState);
  protected readonly settings = this.state.settings;
  protected readonly screenWake = inject(ScreenWakeService);
  private readonly translate = inject(TranslateService);

  /** The languages the app has, each named in itself. */
  protected readonly languages = LANGUAGES;

  /** Automatic, with the language it gives now: "Automatic · English". */
  protected readonly autoLanguageLabel = computed(() => {
    const current = LANGUAGES.find((language) => language.code === this.translate.getCurrentLang());
    return this.translate.instant('settings.languageAuto', { name: current?.name ?? '' }) as string;
  });

  /**
   * Changes the language, by reloading the app in it: many texts are worded once, when they
   * are built, so a reload is what changes them all. Saved first, so the reload finds it.
   */
  protected setLanguage(language: string): void {
    if (language === this.settings().language) return;
    this.state.updateSettings({ language });
    this.state.saveSettingsNow();
    window.location.reload();
  }

  constructor() {
    addIcons({ gridOutline, languageOutline, lockOpenOutline, moonOutline, textOutline });
  }
}
