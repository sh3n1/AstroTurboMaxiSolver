import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon, IonItem, IonLabel, IonList, IonListHeader } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { documentTextOutline, openOutline, ribbonOutline, shieldCheckmarkOutline } from 'ionicons/icons';

import { SETTINGS_SECTION_STYLES } from './settings-styles';

/**
 * The last section of Settings: the data credits, on a page of their own, and the privacy
 * policy and terms of use, which live on the site so they read the same in the app and
 * for Google's sign-in.
 */
@Component({
  selector: 'app-settings-about',
  imports: [IonIcon, IonItem, IonLabel, IonList, IonListHeader, RouterLink],
  styles: [SETTINGS_SECTION_STYLES],
  template: `
    <ion-list inset="true">
      <ion-list-header>About</ion-list-header>
      <ion-item button detail="true" data-testid="open-credits" routerLink="/tabs/settings/credits">
        <ion-icon slot="start" name="ribbon-outline" aria-hidden="true"></ion-icon>
        <ion-label>Data credits</ion-label>
      </ion-item>
      <ion-item
        data-testid="privacy-link"
        href="https://astroturbomaxisolver.app/privacy.html"
        target="_blank"
        rel="noopener"
        detail="false"
      >
        <ion-icon slot="start" name="shield-checkmark-outline" aria-hidden="true"></ion-icon>
        <ion-label>Privacy policy</ion-label>
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
        <ion-label>Terms of use</ion-label>
        <ion-icon slot="end" name="open-outline" aria-hidden="true"></ion-icon>
      </ion-item>
    </ion-list>
  `,
})
export class SettingsAboutComponent {
  constructor() {
    addIcons({ documentTextOutline, openOutline, ribbonOutline, shieldCheckmarkOutline });
  }
}
