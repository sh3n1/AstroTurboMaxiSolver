import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, isDevMode, signal } from '@angular/core';
import { IonButton, IonText } from '@ionic/angular';

import { AppState } from './app-state.service';
import { equatorialVector, formatDec, formatRa, horizontalVector } from './astronomy';
import type { Vector3 } from './astronomy';
import type { StepReport } from './sky-test';
import { runSkyTest } from './sky-test';

/** Time to put the phone down and aim it after tapping, so the tap doesn't shake the frames. */
const COUNTDOWN_SECONDS = 5;

/**
 * The one-tap clear-sky test. It captures real frames, finds stars and tries a plate
 * solve, then shows the results and lets the user keep them. It works in any conditions
 * without crashing, so it can be tried in daylight. It only solves under stars.
 */
@Component({
  selector: 'app-sky-test-panel',
  imports: [DecimalPipe, IonButton, IonText],
  styles: `
    .countdown {
      margin: 16px 0;
      font-size: 56px;
      font-weight: bold;
      text-align: center;
    }
    .result {
      margin: 12px 0;
      padding: 10px 12px;
      border: 1px solid #232a3d;
      border-radius: 10px;
      font-size: 13px;
    }
    .solved {
      color: #6fcf9f;
      font-weight: bold;
    }
    .unsolved {
      color: #ffb454;
    }
    .result img {
      display: block;
      width: 100%;
      margin-top: 8px;
      border-radius: 6px;
    }
    .muted {
      color: #a8b0c6;
      font-size: 12px;
    }
  `,
  template: `
    @if (!reports() && !busy()) {
      <ol>
        <li>Rest the phone on something steady, with the back camera facing the clearest part of the sky.</li>
        <li>Keep streetlights and the Moon out of view.</li>
        <li>
          Tap the button. You then have 5 seconds to position the phone, so leave it untouched for about 35 seconds.
        </li>
      </ol>
      <p class="muted">
        Turn on sensors on the sky map first if you can, because that also measures your compass error. In the dark, red
        night mode from Settings keeps this screen from dazzling you.
      </p>
    }

    <ion-button expand="block" data-testid="run-sky-test" [disabled]="busy()" (click)="run()">
      {{ reports() ? 'Run again' : 'Start the test' }}
    </ion-button>

    @if (countdown() > 0) {
      <div class="countdown" data-testid="sky-test-countdown" aria-live="polite">{{ countdown() }}</div>
      <p class="ion-text-center">Position the phone now.</p>
    }
    @if (progress(); as text) {
      <p data-testid="sky-test-progress">{{ text }}</p>
    }
    @if (error(); as text) {
      <ion-text color="danger">
        <p data-testid="sky-test-error">{{ text }}</p>
      </ion-text>
    }

    @if (reports(); as results) {
      <h2 data-testid="sky-test-summary">{{ summary() }}</h2>

      @if (canSend) {
        <ion-button
          expand="block"
          data-testid="send-sky-report"
          [disabled]="sendState() === 'Sending…'"
          (click)="send()"
        >
          {{ sendState() || 'Send to this PC' }}
        </ion-button>
      }
      <ion-button expand="block" fill="outline" data-testid="save-sky-report" (click)="save()">
        Save report to this phone
      </ion-button>

      @for (result of results; track $index) {
        <div class="result" data-testid="sky-test-step">
          <strong>
            {{ result.requested.frames }} × {{ result.requested.exposureSeconds | number: '1.0-3' }} s, ISO
            {{ result.requested.iso }}
          </strong>
          @if (result.error) {
            <ion-text color="danger"
              ><p>{{ result.error }}</p></ion-text
            >
          } @else {
            <div>{{ result.starCount }} stars found</div>
            <div class="muted">
              Sky brightness {{ result.background | number: '1.0-0' }}/255, noise {{ result.noise | number: '1.1-1' }},
              {{ result.width }}×{{ result.height }}
              @if (!result.manualControl) {
                , automatic exposure
              }
            </div>
            @if (result.tooBright) {
              <div class="unsolved" data-testid="sky-test-too-bright">
                Too bright to solve, even at ISO {{ result.actual.iso }}. Try away from lights.
              </div>
            } @else if (result.solve; as solve) {
              <div class="solved" data-testid="sky-test-solved">
                Solved: RA {{ formatRa(solve.raDeg) }}, Dec {{ formatDec(solve.decDeg) }}
              </div>
              <div class="muted">
                {{ solve.matched }} of {{ solve.checked }} stars matched in {{ solve.milliseconds }} ms
                @if (solve.sensorErrorDeg !== null) {
                  · sensors were {{ solve.sensorErrorDeg }}° off
                }
              </div>
            } @else {
              <div class="unsolved">Not solved</div>
            }
          }
          @if (result.image) {
            <img alt="Stretched preview of the captured frame" [src]="result.image" />
          }
        </div>
      }
    }
  `,
})
export class SkyTestPanelComponent {
  private readonly state = inject(AppState);

  protected readonly formatRa = formatRa;
  protected readonly formatDec = formatDec;
  /** Sending needs the dev server's proxy, so it is only offered in development. */
  protected readonly canSend = isDevMode();
  protected readonly busy = signal(false);
  protected readonly progress = signal('');
  protected readonly countdown = signal(0);
  protected readonly error = signal('');
  protected readonly sendState = signal('');
  protected readonly reports = signal<StepReport[] | null>(null);

  protected readonly summary = computed(() => {
    const results = this.reports() ?? [];
    const solved = results.filter((result) => result.solve).length;
    if (solved > 0) return `Plate solved ${solved} of ${results.length} captures.`;
    if (results.every((result) => result.tooBright)) return 'Too bright to see stars here.';
    const most = Math.max(0, ...results.map((result) => result.starCount));
    return `Not solved. The most stars in one capture was ${most}.`;
  });

  private readonly fullReport = computed(() =>
    JSON.stringify({
      kind: 'sky-test',
      time: new Date().toISOString(),
      browser: navigator.userAgent,
      mount: this.state.settings().mount,
      location: { latitudeDeg: this.state.settings().latitudeDeg, longitudeDeg: this.state.settings().longitudeDeg },
      steps: this.reports(),
    }),
  );

  protected async run(): Promise<void> {
    this.busy.set(true);
    this.state.plateSolving.set(true);
    this.error.set('');
    this.sendState.set('');
    this.reports.set(null);

    // Keeps the screen on, because a phone that sleeps would stop the camera.
    let wakeLock: WakeLockSentinel | null = null;
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      // The test still works if the phone's sleep setting is long enough.
    }

    try {
      for (let remaining = COUNTDOWN_SECONDS; remaining > 0; remaining--) {
        this.countdown.set(remaining);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      this.countdown.set(0);

      const response = await fetch('assets/data/stars.json');
      const starRows = (await response.json()) as number[][];
      const results = await runSkyTest({
        starRows,
        flipped: this.state.settings().mount === 'mirror',
        sensorDirection: () => this.sensorDirection(),
        onProgress: (text) => this.progress.set(text),
        focalFactor: this.state.settings().cameraFocalFactor,
      });
      this.reports.set(results);
      // A successful solve measures the camera's real field of view, which later solves use.
      const solved = results.find((result) => result.solve);
      if (solved?.solve) this.state.updateSettings({ cameraFocalFactor: solved.solve.focalFactor });
    } catch (error) {
      this.error.set(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    } finally {
      this.countdown.set(0);
      this.progress.set('');
      this.busy.set(false);
      this.state.plateSolving.set(false);
      void wakeLock?.release();
    }
  }

  /** Where the sensors say the camera points, as a J2000 direction, or null if they are off. */
  private sensorDirection(): Vector3 | null {
    const camera = this.state.cameraPointing();
    if (!camera) return null;
    const rotation = this.state.skyRotation();
    const [east, north, up] = horizontalVector(camera);
    const x = rotation[0][0] * east + rotation[1][0] * north + rotation[2][0] * up;
    const y = rotation[0][1] * east + rotation[1][1] * north + rotation[2][1] * up;
    const z = rotation[0][2] * east + rotation[1][2] * north + rotation[2][2] * up;
    return equatorialVector(
      (Math.atan2(y, x) * 180) / Math.PI,
      (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI,
    );
  }

  protected async send(): Promise<void> {
    this.error.set('');
    this.sendState.set('Sending…');
    try {
      const response = await fetch('/device-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: this.fullReport(),
      });
      if (!response.ok) throw new Error(`The PC answered ${response.status}`);
      this.sendState.set('Sent. Send again');
    } catch (error) {
      this.sendState.set('');
      this.error.set(
        `Sending failed, so save the report to the phone instead. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Saves a file on the phone, so results survive having no connection to the PC. */
  protected save(): void {
    const url = URL.createObjectURL(new Blob([this.fullReport()], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `astrofinder-sky-test-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
