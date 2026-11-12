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
    /*
     * A phone on its side is wide and short, so height is what matters. The tab bar turns
     * into a rail down the left side, and the time control lies along the bottom of what
     * is left. Nothing floats over the map then, which keeps its full height.
     */
    @media (orientation: landscape) and (max-height: 520px) {
      ion-tabs {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr) auto;
        /* The rail's width, with the room a notch or camera hole takes at the left edge. */
        --af-rail-width: calc(88px + var(--ion-safe-area-left, 0px));
      }
      ion-tabs.over-map {
        --af-tab-bar-height: 0px;
      }
      /*
       * The rail already keeps clear of a notch at the left, so the pages beside it must
       * not leave that margin again: every row and toolbar would lose it a second time.
       */
      ion-tabs ::ng-deep .tabs-inner,
      app-time-control {
        --ion-safe-area-left: 0px;
      }
      /*
       * On the Sky tab the map runs the full width, under the rail and beside any notch,
       * so no dark band is lost at the left. The rail floats over it: only its icons and
       * names, on a shade that fades into the map. The sky page keeps its boxes clear of
       * the rail, and centres the reticle in what is left.
       */
      ion-tabs.over-map ::ng-deep .tabs-inner {
        grid-column: 1 / span 2;
        grid-row: 1;
      }
      ion-tabs.over-map ion-tab-bar {
        position: relative;
        z-index: 10;
        --background: transparent;
        background: linear-gradient(to right, rgb(5 7 15 / 92%) 35%, rgb(5 7 15 / 0%));
        border-right: none;
      }
      /* Outlined, like the map's own labels, so stars behind a name don't mix with it. */
      ion-tabs.over-map ion-tab-button {
        text-shadow:
          0 0 3px #05070f,
          0 0 3px #05070f,
          0 0 6px #05070f;
      }
      ion-tab-bar {
        position: static;
        --background: #0d1220;
        border-right: 1px solid var(--ion-tab-bar-border-color);
      }
      ion-tab-bar,
      ion-tabs.over-map ion-tab-bar {
        grid-column: 1;
        grid-row: 1 / span 2;
        flex-direction: column;
        justify-content: center;
        /* Ionic sizes the bar by its content, so the notch's margin is added as padding. */
        width: 88px;
        height: 100%;
        padding: 0 0 0 var(--ion-safe-area-left, 0px);
        --border: none;
      }
      ion-tab-button {
        flex: 0 0 auto;
        width: 100%;
        max-width: none;
        height: 60px;
        /* No side padding, so "Settings" fits the rail in full. */
        --padding-start: 0;
        --padding-end: 0;
      }
      app-time-control,
      ion-tabs.over-map app-time-control {
        position: static;
        grid-column: 2;
        grid-row: 2;
      }
      /* Under the map it runs the full width too, its buttons starting clear of the rail. */
      ion-tabs.over-map app-time-control {
        grid-column: 1 / span 2;
        padding-left: var(--af-rail-width);
      }
    }
  `,
  template: `
    <ion-tabs
      [class.over-map]="tab() === 'sky'"
      [style.--af-time-control-height.px]="timeControlHeight()"
      (ionTabsDidChange)="tab.set($event.tab)"
    >
      <app-time-control #timeControl></app-time-control>
      <ion-tab-bar slot="bottom" id="af-tab-bar">
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
