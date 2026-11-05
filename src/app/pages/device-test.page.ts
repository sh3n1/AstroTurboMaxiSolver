import { Component, computed, isDevMode, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import type { CameraReport, SensorReport } from '../core/device-test';
import { runCameraTest, runSensorTest } from '../core/device-test';

const SENSOR_TEST_SECONDS = 30;

/**
 * Measures this phone's real camera and sensor limits, and produces a report to copy.
 * Developer tooling for the feasibility work in todo.md, reached from Settings.
 */
@Component({
  selector: 'app-device-test',
  imports: [IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonText, IonTitle, IonToolbar],
  styles: `
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 11px;
      user-select: text;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/settings" text="" aria-label="Back"></ion-back-button>
        </ion-buttons>
        <ion-title>Device test</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <p>These tests measure what this phone can really do. They don't need a clear sky.</p>

      <h2>1. Camera</h2>
      <p>Point the phone at something with some light and detail, and allow camera access. The screen may look odd.</p>
      <ion-button expand="block" data-testid="run-camera-test" [disabled]="busy()" (click)="testCamera()">
        Test cameras
      </ion-button>

      <h2>2. Sensors</h2>
      <p>Rest the phone somewhere still, away from metal, and don't touch it for {{ sensorSeconds }} seconds.</p>
      <ion-button expand="block" data-testid="run-sensor-test" [disabled]="busy()" (click)="testSensors()">
        Test sensors
      </ion-button>

      @if (progress(); as text) {
        <p data-testid="test-progress">{{ text }}</p>
      }
      @if (error(); as text) {
        <ion-text color="danger">
          <p data-testid="test-error">{{ text }}</p>
        </ion-text>
      }

      @if (report(); as text) {
        <h2>Report</h2>
        @if (canSend) {
          <ion-button expand="block" data-testid="send-report" [disabled]="sendState() === 'Sending…'" (click)="send()">
            {{ sendState() || 'Send to this PC' }}
          </ion-button>
        }
        <ion-button expand="block" fill="outline" data-testid="copy-report" (click)="copy()">
          {{ copied() ? 'Copied' : 'Copy report' }}
        </ion-button>
        <pre data-testid="test-report">{{ text }}</pre>
      }
    </ion-content>
  `,
})
export class DeviceTestPage {
  protected readonly sensorSeconds = SENSOR_TEST_SECONDS;
  protected readonly busy = signal(false);
  protected readonly progress = signal('');
  protected readonly error = signal('');
  protected readonly copied = signal(false);
  /** Sending needs the dev server's proxy, so it is only offered in development. */
  protected readonly canSend = isDevMode();
  protected readonly sendState = signal('');

  private readonly cameras = signal<CameraReport[] | null>(null);
  private readonly sensors = signal<SensorReport | null>(null);

  protected readonly report = computed(() => {
    const [cameras, sensors] = [this.cameras(), this.sensors()];
    if (!cameras && !sensors) return '';
    return JSON.stringify({ browser: navigator.userAgent, cameras, sensors }, null, 1);
  });

  protected testCamera(): Promise<void> {
    return this.run(async () => this.cameras.set(await runCameraTest((text) => this.progress.set(text))));
  }

  protected testSensors(): Promise<void> {
    return this.run(async () => {
      this.progress.set(`Recording for ${SENSOR_TEST_SECONDS} seconds. Keep the phone still…`);
      this.sensors.set(await runSensorTest(SENSOR_TEST_SECONDS));
    });
  }

  /** Sends the report to the PC running the dev server. */
  protected async send(): Promise<void> {
    this.error.set('');
    this.sendState.set('Sending…');
    try {
      const response = await fetch('/device-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: this.report(),
      });
      if (!response.ok) throw new Error(`The PC answered ${response.status}`);
      this.sendState.set('Sent. Send again');
    } catch (error) {
      this.sendState.set('');
      this.error.set(`Sending failed. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.report());
      this.copied.set(true);
    } catch {
      this.error.set('Copying failed. Select the report text and copy it by hand.');
    }
  }

  private async run(test: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.copied.set(false);
    this.error.set('');
    try {
      await test();
    } catch (error) {
      this.error.set(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    } finally {
      this.progress.set('');
      this.busy.set(false);
    }
  }
}
