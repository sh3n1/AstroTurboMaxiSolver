import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon, IonItem, IonLabel, IonList, IonListHeader } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  codeSlashOutline,
  documentTextOutline,
  openOutline,
  ribbonOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';

import { SETTINGS_SECTION_STYLES } from './settings-styles';

/**
 * The last section of Settings: the data credits, on a page of their own, and the privacy
 * policy and terms of use, which live on the site so they read the same in the app and
 * for Google's sign-in.
 */
@Component({
  selector: 'app-settings-about',
  imports: [TranslatePipe, IonIcon, IonItem, IonLabel, IonList, IonListHeader, RouterLink],
  styles: [SETTINGS_SECTION_STYLES],
  template: `
    <ion-list inset="true">
      <ion-list-header>{{ 'settings.about.title' | translate }}</ion-list-header>
      <ion-item button detail="true" data-testid="open-credits" routerLink="/tabs/settings/credits">
        <ion-icon slot="start" name="ribbon-outline" aria-hidden="true"></ion-icon>
        <ion-label>{{ 'settings.about.credits' | translate }}</ion-label>
      </ion-item>
      <ion-item
        data-testid="privacy-link"
        href="https://astroturbomaxisolver.app/privacy.html"
        target="_blank"
        rel="noopener"
        detail="false"
      >
        <ion-icon slot="start" name="shield-checkmark-outline" aria-hidden="true"></ion-icon>
        <ion-label>{{ 'settings.about.privacy' | translate }}</ion-label>
        <ion-icon slot="end" name="open-outline" aria-hidden="true"></ion-icon>
      </ion-item>
      <ion-item
        data-testid="licence-link"
        href="https://www.gnu.org/licenses/gpl-3.0.html"
        target="_blank"
        rel="noopener"
        detail="false"
      >
        <ion-icon slot="start" name="code-slash-outline" aria-hidden="true"></ion-icon>
        <ion-label class="ion-text-wrap">
          <h2>{{ 'settings.about.licence' | translate }}</h2>
          <p>{{ 'settings.about.copyright' | translate }}</p>
        </ion-label>
        <ion-icon slot="end" name="open-outline" aria-hidden="true"></ion-icon>
      </ion-item>
      <ion-item
        lines="none"
        data-testid="terms-link"
        href="https://astroturbomaxisolver.app/terms.html"
        target="_blank"
        rel="noopener"
        detail="false"
      >
        <ion-icon slot="start" name="document-text-outline" aria-hidden="true"></ion-icon>
        <ion-label>{{ 'settings.about.terms' | translate }}</ion-label>
        <ion-icon slot="end" name="open-outline" aria-hidden="true"></ion-icon>
      </ion-item>
    </ion-list>
  `,
})
export class SettingsAboutComponent {
  constructor() {
    addIcons({ codeSlashOutline, documentTextOutline, openOutline, ribbonOutline, shieldCheckmarkOutline });
  }
}
