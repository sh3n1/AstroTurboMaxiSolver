import { Component } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { calendarOutline, planetOutline, searchOutline, settingsOutline } from 'ionicons/icons';

/** The app's main navigation. */
@Component({
  selector: 'app-tabs',
  imports: [IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="sky">
          <ion-icon name="planet-outline" aria-hidden="true"></ion-icon>
          <ion-label>Sky</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="targets">
          <ion-icon name="search-outline" aria-hidden="true"></ion-icon>
          <ion-label>Targets</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="plan">
          <ion-icon name="calendar-outline" aria-hidden="true"></ion-icon>
          <ion-label>Plan</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="settings">
          <ion-icon name="settings-outline" aria-hidden="true"></ion-icon>
          <ion-label>Settings</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage {
  constructor() {
    addIcons({ calendarOutline, planetOutline, searchOutline, settingsOutline });
  }
}
