import type { OnDestroy } from '@angular/core';
import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';

import { AppState } from '../core/app-state.service';
import { FinderBandComponent } from '../core/sky-page/finder-band.component';
import { TimeControlComponent } from '../core/sky-page/time-control.component';

/**
 * The app's main pages. The sky map is home, as in a car's navigation screen: there is no
 * tab bar, and the map's own big buttons open Lists and Settings, which each have a way
 * back to the map. Ionic's tabs still hold the pages, so each keeps its place and scroll
 * while another is on show.
 */
@Component({
  selector: 'app-tabs',
  imports: [FinderBandComponent, IonTabBar, IonTabButton, IonTabs, TimeControlComponent],
  styles: `
    /*
     * Ionic's tabs need a tab bar to switch pages, but it is never shown: pages are opened
     * from the map's buttons instead.
     */
    ion-tab-bar {
      display: none;
    }
    /*
     * The time control, or a finder phone's band, sits at the bottom of every page. Over
     * the map it floats, and the sky page keeps its boxes clear of its height.
     */
    ion-tabs {
      --af-tab-bar-height: calc(var(--ion-safe-area-bottom, 0px) + var(--af-time-control-height, 0px));
    }
    app-time-control,
    app-finder-band {
      padding-bottom: var(--ion-safe-area-bottom, 0px);
    }
    ion-tabs.over-map app-time-control,
    ion-tabs.over-map app-finder-band {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10;
    }
  `,
  template: `
    <ion-tabs
      [class.over-map]="tab() === 'sky'"
      [style.--af-time-control-height.px]="timeControlHeight()"
      (ionTabsDidChange)="tab.set($event.tab)"
    >
      @if (state.finderMode()) {
        <app-finder-band #timeControl></app-finder-band>
      } @else {
        <app-time-control #timeControl></app-time-control>
      }
      <ion-tab-bar slot="bottom" aria-hidden="true">
        <ion-tab-button tab="sky" tabindex="-1"></ion-tab-button>
        <ion-tab-button tab="lists" tabindex="-1"></ion-tab-button>
        <ion-tab-button tab="settings" tabindex="-1"></ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage implements OnDestroy {
  protected readonly state = inject(AppState);
  /** The page on show, so the time control can float over the map. */
  protected readonly tab = signal('sky');

  /** How tall the time control is now: nothing while closed, more while open. */
  protected readonly timeControlHeight = signal(0);
  private readonly timeControl = viewChild('timeControl', { read: ElementRef<HTMLElement> });
  private readonly resizes = new ResizeObserver(([entry]) =>
    this.timeControlHeight.set(entry.target.getBoundingClientRect().height),
  );

  constructor() {
    // The band under the map changes when a finder phone links, so the one shown is watched.
    effect(() => {
      const element = this.timeControl()?.nativeElement;
      this.resizes.disconnect();
      if (element) this.resizes.observe(element);
    });
  }

  ngOnDestroy(): void {
    this.resizes.disconnect();
  }
}
