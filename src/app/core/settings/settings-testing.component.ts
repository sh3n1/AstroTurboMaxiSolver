import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, isDevMode, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBadge,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSelect,
  IonSelectOption,
  IonToggle,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  apertureOutline,
  chatbubbleEllipsesOutline,
  chevronDown,
  chevronUp,
  desktopOutline,
  flaskOutline,
  informationCircleOutline,
  listOutline,
} from 'ionicons/icons';

import { AppState } from '../app-state.service';
import { LiveSolverService } from '../live-solver.service';
import { LocalTimePipe } from '../local-time.pipe';

import { SETTINGS_SECTION_STYLES } from './settings-styles';

/** What scripts/build-info.mjs writes before each production build. */
interface BuildInfo {
  version: string;
  commit: string;
  /** Built with changes not yet committed. */
  changed: boolean;
  builtAt: string;
}

/** Tools for checking the app on a real phone and a real sky, as a section of Settings. */
@Component({
  selector: 'app-settings-testing',
  imports: [
    DecimalPipe,
    IonBadge,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonSelect,
    IonSelectOption,
    IonToggle,
    LocalTimePipe,
  ],
  styles: [SETTINGS_SECTION_STYLES],
  template: `
    <ion-list inset="true">
      <ion-list-header>Testing tools</ion-list-header>
      <!-- Which version this is, to tell whether a phone has the latest one published. -->
      <ion-item data-testid="app-version">
        <ion-icon slot="start" name="information-circle-outline" aria-hidden="true"></ion-icon>
        <ion-label class="ion-text-wrap">
          <h2>Version</h2>
          <p>{{ versionText() }}</p>
        </ion-label>
      </ion-item>
      <ion-item button detail="true" data-testid="open-device-test" (click)="openDeviceTest()">
        <ion-icon slot="start" name="flask-outline" aria-hidden="true"></ion-icon>
        <ion-label class="ion-text-wrap">
          <h2>Device test</h2>
          <p>Camera, sensors and plate solving</p>
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-icon slot="start" name="chatbubble-ellipses-outline" aria-hidden="true"></ion-icon>
        <ion-toggle
          data-testid="success-toast"
          helperText="Failures always show one."
          [checked]="settings().solveSuccessToast"
          (ionChange)="state.updateSettings({ solveSuccessToast: $any($event).detail.checked })"
        >
          Toast on successful solves
        </ion-toggle>
      </ion-item>
      @if (devMode) {
        <ion-item>
          <ion-icon slot="start" name="desktop-outline" aria-hidden="true"></ion-icon>
          <ion-toggle
            data-testid="send-solves"
            [checked]="settings().sendSolves"
            (ionChange)="state.updateSettings({ sendSolves: $any($event).detail.checked })"
          >
            Send solves to this PC
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" name="aperture-outline" aria-hidden="true"></ion-icon>
          <ion-select
            label="Camera capture"
            interface="popover"
            data-testid="capture-mode"
            [value]="settings().captureMode"
            (ionChange)="state.updateSettings({ captureMode: $any($event).detail.value })"
          >
            <ion-select-option value="normal">Normal</ion-select-option>
            <ion-select-option value="exposure">Force long exposure</ion-select-option>
            <ion-select-option value="stack">Force stacking</ion-select-option>
          </ion-select>
        </ion-item>
      }
      <ion-item
        button
        detail="false"
        data-testid="open-solve-log"
        [attr.aria-expanded]="showSolveLog()"
        (click)="showSolveLog.set(!showSolveLog())"
      >
        <ion-icon slot="start" name="list-outline" aria-hidden="true"></ion-icon>
        <ion-label>Plate solving log</ion-label>
        <ion-badge slot="end" color="medium">{{ liveSolver.log().length }}</ion-badge>
        <ion-icon slot="end" aria-hidden="true" [name]="showSolveLog() ? 'chevron-up' : 'chevron-down'"></ion-icon>
      </ion-item>
      @if (showSolveLog()) {
        <!-- The latest attempts in this session, newest first, for checking on a real sky. -->
        @for (entry of liveSolver.log(); track entry.id) {
          <ion-item data-testid="solve-log-entry">
            <ion-label class="ion-text-wrap">
              <h3 [class.good]="entry.outcome === 'solved'">{{ entry.message }}</h3>
              <p>
                {{ entry.at | localTime: 'time-seconds' }} ·
                {{ entry.trigger === 'auto' ? 'Automatic' : entry.trigger === 'tap' ? 'Tapped' : 'Alignment' }} ·
                {{ entry.durationMs / 1000 | number: '1.1-1' }} s · ISO {{ entry.iso }}
                @if (entry.frames > 1) {
                  · {{ entry.frames }} frames
                }
                @if (entry.starCount > 0) {
                  · {{ entry.starCount }} stars found
                }
                @if (entry.sensorErrorDeg !== null) {
                  · sensors were {{ entry.sensorErrorDeg | number: '1.1-1' }}° off
                }
              </p>
            </ion-label>
          </ion-item>
        } @empty {
          <ion-item data-testid="solve-log-empty">
            <ion-label class="ion-text-wrap">
              <p>No plate solves yet. Turn sensors on and hold the phone still.</p>
            </ion-label>
          </ion-item>
        }
      }
    </ion-list>
  `,
})
export class SettingsTestingComponent {
  protected readonly state = inject(AppState);
  protected readonly settings = this.state.settings;
  protected readonly liveSolver = inject(LiveSolverService);
  private readonly router = inject(Router);
  protected readonly showSolveLog = signal(false);
  /** Sending solves needs the dev server's proxy, so it is only offered in development. */
  protected readonly devMode = isDevMode();

  constructor() {
    void this.loadBuildInfo();
    addIcons({
      informationCircleOutline,
      apertureOutline,
      chatbubbleEllipsesOutline,
      chevronDown,
      chevronUp,
      desktopOutline,
      flaskOutline,
      listOutline,
    });
  }

  /** This build's version, commit and time, from scripts/build-info.mjs. Null under the dev server. */
  private readonly buildInfo = signal<BuildInfo | null>(null);
  protected readonly versionText = computed(() => {
    const info = this.buildInfo();
    if (!info) return 'Development';
    const built = new LocalTimePipe().transform(new Date(info.builtAt), 'date-time');
    return `${info.version} · ${info.commit}${info.changed ? '+' : ''} · ${built}`;
  });

  private async loadBuildInfo(): Promise<void> {
    try {
      const response = await fetch('assets/build-info.json');
      if (response.ok) this.buildInfo.set((await response.json()) as BuildInfo);
    } catch {
      // Under the dev server there is none: "Development" stays.
    }
  }

  protected openDeviceTest(): void {
    void this.router.navigateByUrl('/device-test');
  }
}
