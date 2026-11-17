import type { ElementRef, OnDestroy } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  compassOutline,
  contractOutline,
  downloadOutline,
  expandOutline,
  listOutline,
  locateOutline,
  moonOutline,
  phoneLandscapeOutline,
  settingsOutline,
  timeOutline,
} from 'ionicons/icons';

import { isIconUrl } from './app-icons';
import { AppState } from './app-state.service';
import { FullscreenService } from './fullscreen.service';
import { InstallService } from './install.service';
import { SensorService } from './sensor.service';

/**
 * Taps on the tiles do nothing for this long after the menu appears. The tap that opened
 * it, or a second one a moment later, often lands where a tile has just appeared, which
 * would switch something on by accident. Longer than a double tap, short enough not to
 * be noticed by someone who means to tap a tile.
 */
export const MENU_TAP_GUARD_MS = 450;

/** The view the view tile switches to: its icon, an Ionic name or an image URL, and its name. */
export interface ViewTile {
  icon: string;
  label: string;
}

/**
 * The sky map's menu: big tiles with words, over the bottom of the map. A tap on the map
 * opens it, and it goes away by itself after a while without a touch, or with another tap
 * on the map, so the sky stays clear while the hands are on the telescope. The sensors and
 * the view stay open after a tap, to see what changed; the other tiles do their job and
 * close it. It lies over the sky page's stage, which places it and times it.
 */
@Component({
  selector: 'app-more-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  styles: `
    /* The backdrop and the sheet are placed on the map's stage, not in a box of their own. */
    :host {
      display: contents;
    }
    .sheet {
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: calc(10px + var(--af-tab-bar-height, 0px));
      z-index: 21;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
      gap: 8px;
      padding: 10px;
      border: 1px solid var(--af-edge);
      border-radius: 16px;
      background: rgb(var(--af-overlay-rgb) / 97%);
      /* It fades in, so a tap meant for the map isn't taken for one on a tile it never saw. */
      animation: appear 150ms ease-out;
    }
    @keyframes appear {
      from {
        opacity: 0;
      }
    }
    .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 84px;
      padding: 8px;
      border: 1px solid var(--af-edge);
      border-radius: 12px;
      background: #141a2c;
      color: var(--af-text);
      font: inherit;
      font-size: calc(16px * var(--af-scale, 1));
      font-weight: 600;
    }
    .tile ion-icon {
      font-size: 30px;
    }
    .tile.warn ion-icon {
      color: var(--ion-color-warning);
    }
    .tile.good ion-icon {
      color: var(--ion-color-success);
    }
    /*
     * At night every colour becomes red by its brightness, so the green of a switch that is
     * on would turn a weaker red than the white of one that is off: a lit fill instead.
     */
    :host-context(html.night) .tile.good {
      background: #6b6b6b;
    }
    :host-context(html.night) .tile.good ion-icon {
      color: var(--af-bright);
    }
    /* A switch that is on, such as night mode, has a lit frame. */
    .tile[aria-pressed='true'] {
      border-color: var(--ion-color-primary);
    }
  `,
  template: `
    <div #sheet class="sheet" data-testid="more-sheet" role="group" aria-label="Menu" [attr.data-ready]="ready()">
      <!--
        Green while the motion sensors steer the view. On a screen phone, the finder phone
        on the telescope steers it, and this opens the link.
      -->
      @if (state.remoteFinder()) {
        <button type="button" class="tile good" data-testid="sensor-toggle" (click)="go('/remote')">
          <ion-icon name="phone-landscape-outline" aria-hidden="true"></ion-icon>
          Finder steers
        </button>
      } @else {
        <button
          type="button"
          class="tile"
          data-testid="sensor-toggle"
          [class.good]="state.sensorsActive()"
          [attr.aria-pressed]="state.sensorsActive()"
          (click)="toggleSensors()"
        >
          <ion-icon name="compass-outline" aria-hidden="true"></ion-icon>
          {{ state.sensorsActive() ? 'Sensors on' : 'Use sensors' }}
        </button>
      }
      <!-- Steps through the sky map, the eyepiece view and the eyepiece ring, showing the view it switches to. -->
      <button type="button" class="tile" data-testid="view-mode" [attr.data-mode]="mode()" (click)="nextView.emit()">
        <ion-icon
          aria-hidden="true"
          [name]="isIconUrl(view().icon) ? undefined : view().icon"
          [src]="isIconUrl(view().icon) ? view().icon : undefined"
        ></ion-icon>
        {{ view().label }}
      </button>
      <button type="button" class="tile" data-testid="open-lists" (click)="openLists()">
        <ion-icon name="list-outline" aria-hidden="true"></ion-icon>
        Lists
      </button>
      <!-- Green once aligned, amber until then, and says if it was only rough. -->
      <button
        type="button"
        class="tile"
        data-testid="alignment-status"
        [class.good]="state.alignment()"
        [class.warn]="!state.alignment()"
        (click)="go('/align')"
      >
        <ion-icon name="locate-outline" aria-hidden="true"></ion-icon>
        @if (state.alignment(); as alignment) {
          Aligned: {{ alignment.starId }}{{ alignment.method === 'plate-solve' ? '' : ', rough' }}
        } @else {
          Not aligned
        }
      </button>
      <button
        type="button"
        class="tile"
        data-testid="night-toggle"
        [attr.aria-pressed]="state.settings().nightMode"
        (click)="toggleNight()"
      >
        <ion-icon name="moon-outline" aria-hidden="true"></ion-icon>
        Night
      </button>
      <!-- Amber while the map shows another time. -->
      <button type="button" class="tile" data-testid="open-time" [class.warn]="state.planning()" (click)="openTime()">
        <ion-icon name="time-outline" aria-hidden="true"></ion-icon>
        Time
      </button>
      <!-- Full screen hides the browser bars. Not offered where the browser can't, as on iPhones. -->
      @if (fullscreen.supported) {
        <button
          type="button"
          class="tile"
          data-testid="fullscreen-toggle"
          [attr.aria-pressed]="fullscreen.active()"
          (click)="toggleFullscreen()"
        >
          <ion-icon [name]="fullscreen.active() ? 'contract-outline' : 'expand-outline'" aria-hidden="true"></ion-icon>
          Full screen
        </button>
      }
      <button type="button" class="tile" data-testid="more-remote" (click)="go('/remote')">
        <ion-icon name="phone-landscape-outline" aria-hidden="true"></ion-icon>
        Two phones
      </button>
      <!-- Until the app is on the home screen: Chrome's install dialog, or the steps on iPhones. -->
      @if (install.available()) {
        <button type="button" class="tile" data-testid="install-tile" (click)="installApp()">
          <ion-icon name="download-outline" aria-hidden="true"></ion-icon>
          Install
        </button>
      }
      <button type="button" class="tile" data-testid="open-settings" (click)="go('/tabs/settings')">
        <ion-icon name="settings-outline" aria-hidden="true"></ion-icon>
        Settings
      </button>
    </div>
  `,
})
export class MoreSheetComponent implements OnDestroy {
  /** The view on show, for tests, and the one the view tile switches to. */
  readonly mode = input.required<string>();
  readonly view = input.required<ViewTile>();
  /** A tile that does its job and is done was tapped: the sky page closes the sheet. */
  readonly closed = output<void>();
  /** The view tile was tapped: the sky page steps to the next view. */
  readonly nextView = output<void>();

  protected readonly state = inject(AppState);
  protected readonly fullscreen = inject(FullscreenService);
  protected readonly install = inject(InstallService);
  private readonly sensors = inject(SensorService);
  protected readonly isIconUrl = isIconUrl;
  private readonly router = inject(Router);
  /** The tabs holding the pages, which remember where each was left. */
  private readonly tabs = inject(IonTabs, { optional: true });

  /** False just after the menu appears, while taps on its tiles are ignored: see MENU_TAP_GUARD_MS. */
  protected readonly ready = signal(false);
  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');
  private readyTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    addIcons({
      compassOutline,
      contractOutline,
      downloadOutline,
      expandOutline,
      listOutline,
      locateOutline,
      moonOutline,
      phoneLandscapeOutline,
      settingsOutline,
      timeOutline,
    });
    afterNextRender(() => {
      this.readyTimer = setTimeout(() => this.ready.set(true), MENU_TAP_GUARD_MS);
      // Caught on the way down, before any tile hears it, and stopped there. The sheet still
      // takes the tap, so it doesn't fall through to the map and close the menu.
      this.sheet().nativeElement.addEventListener(
        'click',
        (event) => {
          if (this.ready()) return;
          event.stopPropagation();
          event.preventDefault();
        },
        true,
      );
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.readyTimer);
  }

  /** Installs the app, or shows how on iPhones, and closes the menu. */
  protected installApp(): void {
    this.closed.emit();
    void this.install.install();
  }

  protected go(url: string): void {
    this.closed.emit();
    void this.router.navigateByUrl(url);
  }

  /**
   * Back to the page of Lists left last, such as a search or one list, with its search and
   * scroll as they were: Ionic's tabs keep each tab's pages, and selecting it goes back.
   */
  protected openLists(): void {
    this.closed.emit();
    if (this.tabs) void this.tabs.select('lists');
    else void this.router.navigateByUrl('/tabs/lists');
  }

  /** Starts or stops the motion sensors steering the map. The sheet stays, to show which. */
  protected toggleSensors(): void {
    if (this.state.sensorsActive()) this.sensors.stop();
    else void this.sensors.start();
  }

  /** Opens or closes the time control, to see the sky at another time. */
  protected openTime(): void {
    this.closed.emit();
    this.state.timeControlOpen.set(!this.state.timeControlOpen());
  }

  protected toggleNight(): void {
    this.closed.emit();
    this.state.updateSettings({ nightMode: !this.state.settings().nightMode });
  }

  protected toggleFullscreen(): void {
    this.closed.emit();
    void this.fullscreen.toggle();
  }
}
