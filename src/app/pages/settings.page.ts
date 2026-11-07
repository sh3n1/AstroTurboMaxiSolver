import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';

import { AppState } from '../core/app-state.service';
import type { Settings } from '../core/app-state.service';
import { LiveSolverService } from '../core/live-solver.service';
import { BORTLE_CLASSES } from '../core/sky-quality';

type NumericSetting = 'latitudeDeg' | 'longitudeDeg';

/** Display, location and equipment settings. */
@Component({
  selector: 'app-settings',
  imports: [
    DatePipe,
    DecimalPipe,
    IonButton,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonNote,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToggle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list inset="true">
        <ion-list-header>Display</ion-list-header>
        <ion-item>
          <ion-select
            label="Text size"
            interface="popover"
            data-testid="text-size"
            [value]="settings().textSize"
            (ionChange)="state.updateSettings({ textSize: $any($event).detail.value })"
          >
            <ion-select-option value="standard">Standard</ion-select-option>
            <ion-select-option value="large">Large</ion-select-option>
            <ion-select-option value="extra-large">Extra large</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-toggle
            data-testid="show-equatorial"
            [checked]="settings().showEquatorial"
            (ionChange)="state.updateSettings({ showEquatorial: $any($event).detail.checked })"
          >
            Show RA and Dec on the sky map
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-toggle
            data-testid="night-mode"
            [checked]="settings().nightMode"
            (ionChange)="state.updateSettings({ nightMode: $any($event).detail.checked })"
          >
            Red night mode
          </ion-toggle>
        </ion-item>

        <ion-list-header>Location</ion-list-header>
        <ion-item>
          <ion-input
            label="Latitude (°)"
            labelPlacement="stacked"
            type="number"
            [value]="settings().latitudeDeg"
            (ionChange)="setNumber('latitudeDeg', $event, -90, 90)"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            label="Longitude (°, east is positive)"
            labelPlacement="stacked"
            type="number"
            [value]="settings().longitudeDeg"
            (ionChange)="setNumber('longitudeDeg', $event, -180, 180)"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-button fill="clear" (click)="useGps()">Use my location</ion-button>
          @if (gpsMessage(); as message) {
            <ion-note slot="end">{{ message }}</ion-note>
          }
        </ion-item>
        <ion-item>
          <ion-select
            label="Sky darkness (Bortle)"
            labelPlacement="stacked"
            interface="popover"
            data-testid="bortle"
            [value]="settings().bortle"
            (ionChange)="state.updateSettings({ bortle: $any($event).detail.value })"
          >
            @for (option of bortleClasses; track option.value) {
              <ion-select-option [value]="option.value">{{ option.label }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-note class="ion-text-wrap">
            Sets how faint the eyepiece view shows stars. Class 1 is a remote dark site, 4 to 5 is countryside near a
            town or the suburbs, and 8 to 9 is a city centre.
          </ion-note>
        </ion-item>

        <ion-item>
          <ion-note class="ion-text-wrap" data-testid="equipment-moved">
            Telescope and eyepiece are set in the Eyepiece view on the Sky tab.
          </ion-note>
        </ion-item>

        <ion-list-header>Phone mount and alignment</ion-list-header>
        <ion-item>
          <ion-toggle
            data-testid="auto-solve"
            [checked]="settings().autoSolve"
            (ionChange)="state.updateSettings({ autoSolve: $any($event).detail.checked })"
          >
            Plate solve when the phone is still
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-note class="ion-text-wrap">
            Uses the camera while sensors are on. It currently works with the camera pointing straight at the sky.
          </ion-note>
        </ion-item>
        <ion-item>
          <ion-select
            label="Mount type"
            data-testid="mount"
            [value]="settings().mount"
            (ionChange)="state.updateSettings({ mount: $any($event).detail.value })"
          >
            <ion-select-option value="direct">Camera at the sky</ion-select-option>
            <ion-select-option value="clip-on">Camera with small telescope</ion-select-option>
            <ion-select-option value="mirror">Parallel with mirror</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item button detail="true" data-testid="open-alignment" (click)="openAlignment()">
          <ion-label>Telescope alignment</ion-label>
          <ion-note slot="end">{{
            state.alignment() ? 'Aligned on ' + state.alignment()!.starId : 'Not aligned'
          }}</ion-note>
        </ion-item>
      </ion-list>

      <ion-list inset="true">
        <ion-list-header>Testing</ion-list-header>
        <ion-item button detail="true" data-testid="open-device-test" (click)="openDeviceTest()">
          <ion-label>Device test: camera, sensors and plate solving</ion-label>
        </ion-item>
        <ion-item>
          <ion-toggle
            data-testid="success-toast"
            [checked]="settings().solveSuccessToast"
            (ionChange)="state.updateSettings({ solveSuccessToast: $any($event).detail.checked })"
          >
            Show a toast when plate solving succeeds
          </ion-toggle>
        </ion-item>
        <ion-item button data-testid="open-solve-log" (click)="showSolveLog.set(!showSolveLog())">
          <ion-label>Plate solving log {{ showSolveLog() ? '▴' : '▾' }}</ion-label>
          <ion-note slot="end">{{ liveSolver.log().length }}</ion-note>
        </ion-item>
        @if (showSolveLog()) {
          <!-- The latest attempts in this session, newest first, for checking on a real sky. -->
          @for (entry of liveSolver.log(); track entry.id) {
            <ion-item data-testid="solve-log-entry">
              <ion-label class="ion-text-wrap">
                <h3>{{ entry.message }}</h3>
                <p>
                  {{ entry.at | date: 'HH:mm:ss' }} · {{ entry.trigger === 'auto' ? 'Automatic' : 'Alignment' }} ·
                  {{ entry.durationMs / 1000 | number: '1.1-1' }} s · ISO {{ entry.iso }}
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
              <ion-label class="ion-text-wrap"
                >No plate solves yet. Turn sensors on and hold the phone still.</ion-label
              >
            </ion-item>
          }
        }

        <ion-list-header>Data credits</ion-list-header>
        <ion-item
          data-testid="credit-openngc"
          href="https://github.com/mattiaverga/OpenNGC"
          target="_blank"
          rel="noopener"
        >
          <ion-label class="ion-text-wrap">
            NGC and IC objects from OpenNGC by Mattia Verga, CC BY-SA 4.0. Converted and filtered for this app.
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap"
            >Stars, star names and constellation lines from XHIP and the IAU, via d3-celestial.</ion-label
          >
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap">Messier data by H. Frommert, seds.org, via d3-celestial.</ion-label>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap">Caldwell catalogue compiled by Sir Patrick Moore.</ion-label>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap">Planets, Moon and sky positions by Astronomy Engine, Don Cross.</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class SettingsPage {
  protected readonly state = inject(AppState);
  private readonly router = inject(Router);
  protected readonly settings = this.state.settings;
  protected readonly liveSolver = inject(LiveSolverService);
  protected readonly showSolveLog = signal(false);
  protected readonly gpsMessage = signal('');
  protected readonly bortleClasses = BORTLE_CLASSES;

  /** Saves a number, ignoring values that are empty or outside the sensible range. */
  protected setNumber(key: NumericSetting, event: Event, min: number, max: number): void {
    const raw = (event as CustomEvent<{ value?: string | null }>).detail.value;
    const value = Number(raw);
    if (raw !== '' && raw != null && Number.isFinite(value) && value >= min && value <= max) {
      // A typed location counts as set, just like one from GPS.
      this.state.updateSettings({ [key]: value, locationSet: true } as Partial<Settings>);
    }
  }

  protected openDeviceTest(): void {
    void this.router.navigateByUrl('/device-test');
  }

  protected openAlignment(): void {
    void this.router.navigateByUrl('/align');
  }

  protected async useGps(): Promise<void> {
    this.gpsMessage.set('Finding location…');
    this.gpsMessage.set(await this.state.locateWithGps());
  }
}
