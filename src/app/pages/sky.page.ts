import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { IonContent, IonFabButton, IonIcon, ToastController } from '@ionic/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  add,
  downloadOutline,
  locationOutline,
  mapOutline,
  radioButtonOffOutline,
  refreshOutline,
  syncOutline,
  remove,
} from 'ionicons/icons';

import { APP_ICONS } from '../core/app-icons';
import { AppState } from '../core/app-state.service';
import { formatLocation } from '../core/astronomy/astronomy';
import { i18n } from '../core/i18n/t';
import { InstallNoticeComponent } from '../core/platform/install-notice.component';
import { InstallService } from '../core/platform/install.service';
import { PermissionsService } from '../core/platform/permissions.service';
import { SoundService } from '../core/platform/sound.service';
import { UpdateService } from '../core/platform/update.service';
import { SensorService } from '../core/sensors/sensor.service';
import { isShutterPress } from '../core/sensors/shutter-remote';
import { SkyCanvasComponent } from '../core/sky-map/sky-canvas.component';
import type { ViewMode } from '../core/sky-map/sky-style';
import {
  DEFAULT_FIELD_DEG,
  MAX_FIELD_DEG,
  MIN_FIELD_DEG,
  NEXT_VIEW,
  ZOOM_STEP,
  clampField,
} from '../core/sky-map/sky-style';
import { EyepiecePanelComponent } from '../core/sky-page/eyepiece-panel.component';
import { MENU_TAP_GUARD_MS, MoreSheetComponent } from '../core/sky-page/more-sheet.component';
import { PointingReadoutComponent } from '../core/sky-page/pointing-readout.component';
import { TargetBarComponent } from '../core/sky-page/target-bar.component';
import { LiveSolverService } from '../core/solver/live-solver.service';
import { SyncService } from '../core/sync/sync.service';

/** The button shows the view it switches to: its icon, and its name for screen readers. */
const VIEW_BUTTONS: Record<ViewMode, { icon: string; label: string }> = {
  sky: { icon: 'map-outline', label: i18n('views.sky') },
  eyepiece: { icon: APP_ICONS.eyepiece, label: i18n('views.eyepiece') },
  ring: { icon: 'radio-button-off-outline', label: i18n('views.ring') },
};
/** How long a toast message stays, long enough to read at arm's length. */
const TOAST_MS = 3500;
/**
 * The menu and the zoom buttons go away after this long without a touch, and leave the sky
 * clear, as a car's navigation screen does. A tap on the map brings them back.
 */
const MENU_IDLE_MS = 10_000;

/**
 * The sky map, reticle, guidance and eyepiece view. The user aims by moving the phone
 * with sensors on, or by dragging with them off.
 */
@Component({
  selector: 'app-sky',
  imports: [
    TranslatePipe,
    IonContent,
    IonFabButton,
    IonIcon,
    EyepiecePanelComponent,
    InstallNoticeComponent,
    MoreSheetComponent,
    PointingReadoutComponent,
    SkyCanvasComponent,
    TargetBarComponent,
  ],
  // In a file of its own, to keep this one short: see sky.page.css.
  styleUrl: './sky.page.css',
  template: `
    <!-- No header, so the map fills the whole screen. -->
    <ion-content [scrollY]="false" [fullscreen]="true">
      <!-- Any touch keeps the menu and zoom open a while longer: see wake. -->
      <div class="stage" (pointerdown)="wake()">
        <!-- The map itself: drawing, dragging and pinching. A tap on its rings plate solves, elsewhere it is the menu's. -->
        <app-sky-canvas [mode]="mode()" [(fieldDeg)]="fieldDeg" (ringsTap)="solveHere()" (mapTap)="toggleMenu()" />
        <!-- Tapping the rings, red or green, plate solves there. This hidden button does the same for screen readers. -->
        @if (!solvingHere() && !state.finderMode()) {
          <button class="visually-hidden" type="button" data-testid="solve-here" (click)="solveHere()">
            {{ 'sky.solveHere' | translate }}
          </button>
        }

        <!-- Where the telescope points, and how wide the view is. -->
        <app-pointing-readout
          class="readout"
          data-testid="pointing"
          [attr.data-still]="sensors.isStill()"
          [mode]="mode()"
          [fieldDeg]="fieldDeg()"
        ></app-pointing-readout>

        <!-- A finder phone linked to a screen phone shows only the map: nothing to tap by accident. -->
        @if (!state.finderMode()) {
          <!-- The steps to install on iPhones, when the Install button asks for them. -->
          <app-install-notice />
          <!--
            Zoom, top right, shown with the menu. Not in the eyepiece view, where the eyepiece
            sets the field. Pinching zooms too.
          -->
          @if (mode() !== 'eyepiece') {
            <div class="zoom" [class.faded]="!moreOpen()">
              <ion-fab-button
                [attr.aria-label]="'sky.zoomIn' | translate"
                data-testid="zoom-in"
                [disabled]="fieldDeg() <= minField"
                (click)="zoomBy(1 / zoomStep)"
              >
                <ion-icon name="add" aria-hidden="true"></ion-icon>
              </ion-fab-button>
              <ion-fab-button
                [attr.aria-label]="'sky.zoomOut' | translate"
                data-testid="zoom-out"
                [disabled]="fieldDeg() >= maxField"
                (click)="zoomBy(zoomStep)"
              >
                <ion-icon name="remove" aria-hidden="true"></ion-icon>
              </ion-fab-button>
            </div>
          }
          <!--
            The menu: big tiles with words over the bottom of the map. A tap on the map opens
            it, and it goes after a while without a touch: see MENU_IDLE_MS. This hidden
            button opens it for screen readers.
          -->
          <button class="visually-hidden" type="button" data-testid="open-menu" (click)="openMenu()">
            {{ 'menu.title' | translate }}
          </button>
          @if (moreOpen()) {
            <app-more-sheet
              [mode]="mode()"
              [view]="viewButtons[nextView()]"
              (nextView)="mode.set(nextView())"
              (closed)="moreOpen.set(false)"
            ></app-more-sheet>
          }
        }

        @if (!state.finderMode()) {
          <div class="dock" #dock>
            <!-- Location sits bottom left and zoom bottom right, just above whatever boxes are open below. -->
            <div class="corner">
              @if (!state.selectedTarget()) {
                <!-- Where the sky is calculated for, like the pointing readout at the top. -->
                @if (state.settings().locationSet) {
                  <div class="readout location" data-testid="location">{{ location() }}</div>
                } @else {
                  <!-- Until a location is set, the sky shown is for a neutral place, so ask for one. -->
                  <button type="button" class="readout location unset" data-testid="location" (click)="locate()">
                    <ion-icon name="location-outline" aria-hidden="true"></ion-icon>
                    {{ locating() || ('sky.setLocation' | translate) }}
                  </button>
                }
              }
              <!-- Bottom right, like Set location on the left: installing, a new version, and sync. -->
              <div class="right">
                <!-- Until the app is installed. -->
                @if (install.available()) {
                  <button
                    type="button"
                    class="readout location unset"
                    data-testid="install-app"
                    (click)="install.install()"
                  >
                    <ion-icon name="download-outline" aria-hidden="true"></ion-icon>
                    {{ 'sky.install' | translate }}
                  </button>
                }
                <!-- A new version is downloaded: one tap switches to it. -->
                @if (update.ready()) {
                  <button
                    type="button"
                    class="readout location unset"
                    data-testid="update-app"
                    (click)="update.apply()"
                  >
                    <ion-icon name="refresh-outline" aria-hidden="true"></ion-icon>
                    {{ 'sky.update' | translate }}
                  </button>
                }
                <!-- Sync's access to the drive has run out, with changes to send: a tap renews it. -->
                @if (sync.offerTap()) {
                  <button
                    type="button"
                    class="readout location unset"
                    data-testid="sync-tap"
                    (click)="sync.syncNow(true)"
                  >
                    <ion-icon name="sync-outline" aria-hidden="true"></ion-icon>
                    {{ 'sync.title' | translate }}
                  </button>
                }
              </div>
            </div>
            @if (mode() === 'eyepiece') {
              <!-- The faintest stars shown, and the eyepiece and the rest of the kit in use. -->
              <app-eyepiece-panel class="eyepiece-panel" data-testid="eyepiece-panel"></app-eyepiece-panel>
            }

            @if (state.selectedTarget()) {
              <!-- The target: which way to move, its name, and its buttons. -->
              <app-target-bar class="bar" data-testid="target-bar"></app-target-bar>
            }
            <!-- Last, at the bottom, so it is seen without covering the sky. -->
            @if (sensors.error(); as message) {
              <div class="message" data-testid="sensor-error">{{ message }}</div>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class SkyPage implements AfterViewInit, OnDestroy {
  protected readonly state = inject(AppState);
  protected readonly sensors = inject(SensorService);
  private readonly permissions = inject(PermissionsService);
  private readonly translate = inject(TranslateService);
  protected readonly install = inject(InstallService);
  protected readonly update = inject(UpdateService);
  protected readonly sync = inject(SyncService);
  protected readonly liveSolver = inject(LiveSolverService);
  private readonly sound = inject(SoundService);
  private readonly toasts = inject(ToastController);
  /** The newest plate solve already given a toast, so each attempt gets at most one. */
  private lastToastedSolveId = this.liveSolver.log()[0]?.id ?? 0;
  /** When the alignment shown last was made, or undefined before the first check. */
  private shownAlignedAt?: string | null;

  /** In the app's state, so the puck's menu can step it too. */
  protected readonly mode = this.state.viewMode;
  protected readonly nextView = computed(() => NEXT_VIEW[this.mode()]);
  protected readonly viewButtons = VIEW_BUTTONS;
  protected readonly fieldDeg = signal(DEFAULT_FIELD_DEG);
  protected readonly minField = MIN_FIELD_DEG;
  protected readonly maxField = MAX_FIELD_DEG;
  protected readonly zoomStep = ZOOM_STEP;
  /** What the location button says while GPS is working, or after it fails. Empty otherwise. */
  protected readonly locating = signal('');

  protected async locate(): Promise<void> {
    this.locating.set(this.translate.instant('location.finding') as string);
    const message = await this.permissions.locate();
    // On success the box shows the location instead, so only a problem needs saying.
    // "Not now" leaves the button as it was.
    this.locating.set(
      this.state.settings().locationSet || !message
        ? ''
        : (this.translate.instant('location.tapToTryAgain', { message: this.translate.instant(message) }) as string),
    );
  }

  /** The observer's location, as set in Settings or from GPS, such as "39.47° N, 0.38° W". */
  protected readonly location = computed(() =>
    formatLocation(this.state.settings().latitudeDeg, this.state.settings().longitudeDeg),
  );
  private readonly map = viewChild.required(SkyCanvasComponent);
  /**
   * Redraws the map when the boxes at the bottom change size, as when a target is chosen or
   * its details open: the reticle moves into the part of the map they leave clear.
   */
  private readonly resizeObserver = new ResizeObserver(() => this.map().redraw());
  private readonly dockRef = viewChild<ElementRef<HTMLElement>>('dock');
  private observedDock?: HTMLElement;
  /** True while a tap's plate solve runs, so a second tap does nothing. */
  protected readonly solvingHere = signal(false);
  /** Whether the menu is open. */
  protected readonly moreOpen = signal(false);
  /** When it opened, so a double tap on the map doesn't close it again at once. */
  private menuOpenedAt = 0;
  /** Closes the menu after a while without a touch: see MENU_IDLE_MS. */
  private idleTimer?: ReturnType<typeof setTimeout>;
  /** A shutter remote's press plate solves: see shutterPressed. */
  private readonly onKey = (event: KeyboardEvent): void => this.shutterPressed(event);

  constructor() {
    // Its own icons, and the two the menu's view tile is given by name.
    addIcons({
      add,
      downloadOutline,
      locationOutline,
      mapOutline,
      radioButtonOffOutline,
      refreshOutline,
      remove,
      syncOutline,
    });

    // Every failed automatic plate solve, or one started by tapping the rings, is told
    // with a toast. Successes only when the debugging setting asks for them, and with a soft
    // shutter sound if chosen in Settings. Alignment shows its own results, so it is left out.
    effect(() => {
      const newest = this.liveSolver.log()[0];
      if (!newest || newest.id <= this.lastToastedSolveId) return;
      this.lastToastedSolveId = newest.id;
      if (newest.trigger === 'alignment') return;
      const { solveSuccessToast: showSuccess, solveSound } = untracked(() => this.state.settings());
      if (newest.outcome === 'solved' && solveSound) this.sound.shutter();
      // Only over the map. On another tab the message would cover that page's header,
      // and its buttons with it, each time the phone lay still.
      if (
        untracked(() => this.state.mapOnShow()) &&
        (newest.outcome === 'failed' || (newest.outcome === 'solved' && showSuccess))
      ) {
        void this.toast(newest.message, 'solve-toast');
      }
    });
    // A new alignment is confirmed with a toast. The one already saved at start-up is not.
    effect(() => {
      const alignment = this.state.alignment();
      const alignedAt = alignment?.alignedAt;
      if (this.shownAlignedAt !== undefined && alignment && alignedAt !== this.shownAlignedAt) {
        void this.toast(
          this.translate.instant(alignment.method === 'plate-solve' ? 'alignment.aligned' : 'alignment.alignedRough', {
            star: alignment.starId,
          }) as string,
          'alignment-toast',
        );
      }
      this.shownAlignedAt = alignedAt ?? null;
    });

    // The boxes at the bottom are watched for size whenever they are on screen.
    effect(() => {
      const dock = this.dockRef()?.nativeElement;
      if (dock === this.observedDock) return;
      if (this.observedDock) this.resizeObserver.unobserve(this.observedDock);
      if (dock) this.resizeObserver.observe(dock);
      this.observedDock = dock;
    });
  }

  /** A short message that appears near the top and goes away by itself. */
  private async toast(message: string, testId: string): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration: TOAST_MS,
      position: 'top',
      cssClass: 'af-toast',
      htmlAttributes: { 'data-testid': testId },
    });
    await toast.present();
  }

  ngAfterViewInit(): void {
    window.addEventListener('keydown', this.onKey);
    this.wake();
  }

  ngOnDestroy(): void {
    this.resizeObserver.disconnect();
    clearTimeout(this.idleTimer);
    window.removeEventListener('keydown', this.onKey);
  }

  /**
   * A touch: the menu, if open, stays until the next while without one. Then it goes away
   * with the zoom buttons, leaving the sky clear.
   */
  protected wake(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.moreOpen.set(false), MENU_IDLE_MS);
  }

  /** Opens the menu, for its while: see wake. */
  protected openMenu(): void {
    this.moreOpen.set(true);
    this.menuOpenedAt = performance.now();
    this.wake();
  }

  /**
   * A Bluetooth shutter remote, when the setting is on, plate solves on the map, as a tap
   * on the rings does. The Align page has its own use for it, aligning. Not on a finder
   * phone, whose screen phone asks for its solves.
   */
  private shutterPressed(event: KeyboardEvent): void {
    if (!this.state.settings().shutterAligns || !this.state.mapOnShow() || this.state.finderMode()) return;
    if (!isShutterPress(event)) return;
    event.preventDefault();
    void this.solveHere();
  }

  protected zoomBy(factor: number): void {
    this.fieldDeg.set(clampField(this.fieldDeg() * factor));
  }

  /** A tap on the map, away from the rings, opens the menu or closes it. */
  protected toggleMenu(): void {
    // A second tap straight after the one that opened it is a double tap, not a close.
    if (this.moreOpen() && performance.now() - this.menuOpenedAt < MENU_TAP_GUARD_MS) return;
    if (this.moreOpen()) this.moreOpen.set(false);
    else this.openMenu();
  }

  /**
   * Plate solves now, when the user taps the rings, rather than waiting for the
   * phone to be still. The sky map moves to the solved position, and the sensors, if on,
   * are corrected. The alignment with the telescope stays as it is. The result is told as
   * an automatic solve's is.
   */
  protected async solveHere(): Promise<void> {
    if (this.solvingHere()) return;
    this.solvingHere.set(true);
    try {
      await this.liveSolver.solveNow('tap');
    } finally {
      this.solvingHere.set(false);
    }
  }

  /**
   * The Sky tab came into view: draw the sky as it is now. The page stays alive behind
   * the other tabs, where it draws nothing and shows no plate-solve messages, and the
   * live solver rests, so they take nothing from the list the user is reading.
   */
  ionViewDidEnter(): void {
    this.state.mapOnShow.set(true);
    // The first time, offers to take the location, which the whole sky depends on. Not on a
    // finder phone on the telescope, which takes its location from the screen phone.
    if (!this.state.finderMode()) this.permissions.welcomeOnce();
  }

  /** Another tab is taking over. */
  ionViewWillLeave(): void {
    this.state.mapOnShow.set(false);
  }
}
