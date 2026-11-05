import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
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
import { magnification, trueFieldDeg } from '../core/astronomy';

type NumericSetting = 'latitudeDeg' | 'longitudeDeg' | 'telescopeFocalMm' | 'eyepieceFocalMm' | 'eyepieceFieldDeg';

/** Display, location and equipment settings. */
@Component({
  selector: 'app-settings',
  imports: [
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
          <ion-toggle
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

        <ion-list-header>Telescope and eyepiece</ion-list-header>
        <ion-item>
          <ion-select
            label="Telescope type"
            [value]="settings().telescopeType"
            (ionChange)="state.updateSettings({ telescopeType: $any($event).detail.value })"
          >
            <ion-select-option value="newtonian">Newtonian</ion-select-option>
            <ion-select-option value="refractor">Refractor with diagonal</ion-select-option>
            <ion-select-option value="cassegrain">Cassegrain with diagonal</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-input
            label="Telescope focal length (mm)"
            labelPlacement="stacked"
            type="number"
            [value]="settings().telescopeFocalMm"
            (ionChange)="setNumber('telescopeFocalMm', $event, 50, 10000)"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            label="Eyepiece focal length (mm)"
            labelPlacement="stacked"
            type="number"
            [value]="settings().eyepieceFocalMm"
            (ionChange)="setNumber('eyepieceFocalMm', $event, 2, 60)"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            label="Eyepiece apparent field (°)"
            labelPlacement="stacked"
            type="number"
            [value]="settings().eyepieceFieldDeg"
            (ionChange)="setNumber('eyepieceFieldDeg', $event, 20, 120)"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-note
            >{{ power() | number: '1.0-0' }}× magnification · {{ field() | number: '1.1-2' }}° field of view</ion-note
          >
        </ion-item>

        <ion-list-header>Phone mount and alignment</ion-list-header>
        <ion-item>
          <ion-select
            label="Mount type"
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
          <ion-label>Test this phone's camera and sensors</ion-label>
        </ion-item>

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
          <ion-label class="ion-text-wrap">Stars and star names from the XHIP catalogue, via d3-celestial.</ion-label>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap">Messier data by H. Frommert, seds.org, via d3-celestial.</ion-label>
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
  protected readonly gpsMessage = signal('');

  protected readonly power = computed(() =>
    magnification(this.settings().telescopeFocalMm, this.settings().eyepieceFocalMm),
  );
  protected readonly field = computed(() =>
    trueFieldDeg(this.settings().telescopeFocalMm, this.settings().eyepieceFocalMm, this.settings().eyepieceFieldDeg),
  );

  /** Saves a number, ignoring values that are empty or outside the sensible range. */
  protected setNumber(key: NumericSetting, event: Event, min: number, max: number): void {
    const raw = (event as CustomEvent<{ value?: string | null }>).detail.value;
    const value = Number(raw);
    if (raw !== '' && raw != null && Number.isFinite(value) && value >= min && value <= max) {
      this.state.updateSettings({ [key]: value } as Partial<Settings>);
    }
  }

  protected openDeviceTest(): void {
    void this.router.navigateByUrl('/device-test');
  }

  protected openAlignment(): void {
    void this.router.navigateByUrl('/align');
  }

  protected useGps(): void {
    if (!('geolocation' in navigator)) {
      this.gpsMessage.set('Not available on this device');
      return;
    }
    this.gpsMessage.set('Finding location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.state.updateSettings({
          latitudeDeg: Number(coords.latitude.toFixed(2)),
          longitudeDeg: Number(coords.longitude.toFixed(2)),
        });
        this.gpsMessage.set('Location updated');
      },
      () => this.gpsMessage.set('Location unavailable'),
      { timeout: 15_000 },
    );
  }
}
