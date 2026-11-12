import type { OnDestroy } from '@angular/core';
import { Component, ElementRef, effect, signal, viewChild } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { bookmarksOutline, mapOutline, searchOutline, settingsOutline } from 'ionicons/icons';

import { TimeControlComponent } from '../core/time-control.component';

/** The app's main navigation. */
@Component({
  selector: 'app-tabs',
  imports: [IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs, TimeControlComponent],
  styles: `
    /*
     * On the Sky tab the tab bar floats over the map instead of taking space from it.
     * It is nearly solid, so map labels underneath don't mix with the tab names.
     * The sky page reads the height to keep its target bar above it.
     */
    ion-tabs.over-map {
      --af-tab-bar-height: calc(56px + var(--ion-safe-area-bottom, 0px) + var(--af-time-control-height, 0px));
    }
    /*
     * The time control sits just above the tab bar on every tab. Over the map it floats
     * too, and its height adds to the space the sky page keeps clear.
     */
    ion-tabs.over-map app-time-control {
      position: absolute;
      left: 0;
      right: 0;
      bottom: calc(56px + var(--ion-safe-area-bottom, 0px));
      z-index: 10;
    }
    ion-tabs.over-map ion-tab-bar {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      --background: rgb(13 18 32 / 90%);
      --border: none;
    }
  `,
  template: `
    <ion-tabs
      [class.over-map]="tab() === 'sky'"
      [style.--af-time-control-height.px]="timeControlHeight()"
      (ionTabsDidChange)="tab.set($event.tab)"
    >
      <app-time-control #timeControl></app-time-control>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="sky">
          <ion-icon name="map-outline" aria-hidden="true"></ion-icon>
          <ion-label>Sky</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="targets">
          <ion-icon name="search-outline" aria-hidden="true"></ion-icon>
          <ion-label>Targets</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="lists">
          <ion-icon name="bookmarks-outline" aria-hidden="true"></ion-icon>
          <ion-label>Lists</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="settings">
          <ion-icon name="settings-outline" aria-hidden="true"></ion-icon>
          <ion-label>Settings</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage implements OnDestroy {
  /** The tab on show, so the Sky tab can lay the tab bar over its map. */
  protected readonly tab = signal('sky');

  /** How tall the time control is now: nothing while closed, more while open. */
  protected readonly timeControlHeight = signal(0);
  private readonly timeControl = viewChild('timeControl', { read: ElementRef<HTMLElement> });
  private readonly resizes = new ResizeObserver(([entry]) =>
    this.timeControlHeight.set(entry.target.getBoundingClientRect().height),
  );

  constructor() {
    addIcons({ bookmarksOutline, mapOutline, searchOutline, settingsOutline });
    effect(() => {
      const element = this.timeControl()?.nativeElement;
      if (element) this.resizes.observe(element);
    });
  }

  ngOnDestroy(): void {
    this.resizes.disconnect();
  }
}
