import { Component, signal } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { calendarOutline, planetOutline, searchOutline, settingsOutline } from 'ionicons/icons';

/** The app's main navigation. */
@Component({
  selector: 'app-tabs',
  imports: [IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs],
  styles: `
    /*
     * On the Sky tab the tab bar floats over the map, see-through, instead of taking
     * space from it. The sky page reads the height to keep its target bar above it.
     */
    ion-tabs.over-map {
      --af-tab-bar-height: calc(56px + var(--ion-safe-area-bottom, 0px));
    }
    ion-tabs.over-map ion-tab-bar {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      --background: rgb(13 18 32 / 35%);
      --border: none;
    }
  `,
  template: `
    <ion-tabs [class.over-map]="tab() === 'sky'" (ionTabsDidChange)="tab.set($event.tab)">
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
  /** The tab on show, so the Sky tab can lay the tab bar over its map. */
  protected readonly tab = signal('sky');

  constructor() {
    addIcons({ calendarOutline, planetOutline, searchOutline, settingsOutline });
  }
}
