import { Component } from '@angular/core';
import { IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { openOutline } from 'ionicons/icons';

import { RESERVED_LISTS } from '../lists/target-lists';

import { SETTINGS_SECTION_STYLES } from './settings-styles';

/** The credits the licences of the app's data and libraries require, as a section of Settings. */
@Component({
  selector: 'app-settings-credits',
  imports: [TranslatePipe, IonIcon, IonItem, IonLabel, IonList],
  styles: [
    SETTINGS_SECTION_STYLES,
    `
      .credit {
        font-size: calc(14px * var(--af-scale, 1));
      }
    `,
  ],
  template: `
    <ion-list inset="true">
      <ion-item
        data-testid="credit-openngc"
        href="https://github.com/mattiaverga/OpenNGC"
        target="_blank"
        rel="noopener"
        detail="false"
      >
        <ion-label class="ion-text-wrap credit">{{ 'credits.openngc' | translate }}</ion-label>
        <ion-icon slot="end" name="open-outline" aria-hidden="true"></ion-icon>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">{{ 'credits.xhip' | translate }}</ion-label>
      </ion-item>
      <ion-item
        data-testid="credit-hyg"
        href="https://github.com/astronexus/HYG-Database"
        target="_blank"
        rel="noopener"
        detail="false"
      >
        <ion-label class="ion-text-wrap credit">{{ 'credits.hyg' | translate }}</ion-label>
        <ion-icon slot="end" name="open-outline" aria-hidden="true"></ion-icon>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">{{ 'credits.messier' | translate }}</ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">{{ 'credits.caldwell' | translate }}</ion-label>
      </ion-item>
      <!-- The credits of the lists hidden for now come back with them: see RESERVED_LISTS. -->
      @if (!reserved.has('herschel400')) {
        <ion-item>
          <ion-label class="ion-text-wrap credit">{{ 'credits.herschel' | translate }}</ion-label>
        </ion-item>
      }
      @if (!reserved.has('sac110')) {
        <ion-item>
          <ion-label class="ion-text-wrap credit">{{ 'credits.sac' | translate }}</ion-label>
        </ion-item>
      }
      @if (!reserved.has('rasc')) {
        <ion-item>
          <ion-label class="ion-text-wrap credit">{{ 'credits.rasc' | translate }}</ion-label>
        </ion-item>
      }
      @if (!reserved.has('gems')) {
        <ion-item>
          <ion-label class="ion-text-wrap credit">{{ 'credits.gems' | translate }}</ion-label>
        </ion-item>
      }
      @if (!reserved.has('urban')) {
        <ion-item>
          <ion-label class="ion-text-wrap credit">{{ 'credits.urban' | translate }}</ion-label>
        </ion-item>
      }
      <ion-item>
        <ion-label class="ion-text-wrap credit">{{ 'credits.assa' | translate }}</ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">{{ 'credits.hubble' | translate }}</ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit" data-testid="credit-wds">{{ 'credits.wds' | translate }}</ion-label>
      </ion-item>
      <!-- Open-Meteo's data is CC BY 4.0, which asks for this credit. -->
      <ion-item>
        <ion-label class="ion-text-wrap credit" data-testid="credit-open-meteo">{{
          'credits.openMeteo' | translate
        }}</ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">{{ 'credits.wmm' | translate }}</ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">{{ 'credits.astronomyEngine' | translate }}</ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">{{ 'credits.qr' | translate }}</ion-label>
      </ion-item>
      <ion-item data-testid="credit-jpl">
        <ion-label class="ion-text-wrap credit">{{ 'credits.jpl' | translate }}</ion-label>
      </ion-item>
      <!-- Dexie's Apache-2.0 NOTICE file, which must be passed on with the app. -->
      <ion-item>
        <ion-label class="ion-text-wrap credit">{{ 'credits.dexie' | translate }}</ion-label>
      </ion-item>
      <!-- The atlas is CC BY-NC 4.0 and asks for both citations: see its LICENSE.txt. -->
      <ion-item
        data-testid="credit-falchi"
        href="https://doi.org/10.5880/GFZ.1.4.2016.001"
        target="_blank"
        rel="noopener"
        detail="false"
      >
        <ion-label class="ion-text-wrap credit">{{ 'credits.falchi' | translate }}</ion-label>
        <ion-icon slot="end" name="open-outline" aria-hidden="true"></ion-icon>
      </ion-item>
      <!-- Every library's licence, gathered by the production build. -->
      <ion-item
        lines="none"
        data-testid="software-licences"
        href="/3rdpartylicenses.txt"
        target="_blank"
        rel="noopener"
        detail="false"
      >
        <ion-label class="ion-text-wrap credit">{{ 'credits.licences' | translate }}</ion-label>
        <ion-icon slot="end" name="open-outline" aria-hidden="true"></ion-icon>
      </ion-item>
    </ion-list>
  `,
})
export class SettingsCreditsComponent {
  /** The lists hidden for now, whose credits are hidden with them. */
  protected readonly reserved = RESERVED_LISTS;

  constructor() {
    addIcons({ openOutline });
  }
}
