import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AppState } from './app-state.service';
import type { Vector3 } from './astronomy';
import { applyMatrix, horizontalVector, localToEquatorial, equatorialVector } from './astronomy';
import { attitudeFromImageAxes } from './attitude';
import type { OpenCamera } from './camera';
import {
  FOCAL_SHARE_OF_LONG_SIDE,
  applyCameraSettings,
  averageLevel,
  captureStack,
  closeCamera,
  openRearCamera,
} from './camera';
import { SensorService } from './sensor.service';
import type { SolveRequest, SolveResponse } from './solver-messages';

type Status = 'off' | 'waiting' | 'solving' | 'solved' | 'failed';

const EXPOSURE_SECONDS = 1 / 3; // The longest the measured phone allows in the browser
const START_ISO = 3200;
const MIN_ISO = 100;
const MAX_SKY_LEVEL = 170; // Above this average the sky is close to clipping
const CHECK_INTERVAL_MS = 500;
/** After a good solve, wait a while before the next. Drift builds up slowly. */
const SOLVED_PAUSE_MS = 15_000;
/** After a failed attempt, try again sooner, since conditions may have changed. */
const FAILED_PAUSE_MS = 5_000;
const SOLVE_TIME_LIMIT_MS = 4000;
/** The sensors are rarely this far out, so the solver only searches this close to them. */
const HINT_RADIUS_DEG = 25;
const SETTLE_MS = 800;

/**
 * Plate solves automatically whenever the sensors are on and the phone is still, then
 * corrects the sensors with the result. This is the app's core idea: sensors for live
 * movement, and plate solving to keep them true.
 */
@Injectable({ providedIn: 'root' })
export class LiveSolverService {
  private readonly state = inject(AppState);
  private readonly sensors = inject(SensorService);

  readonly status = signal<Status>('off');
  readonly lastStarCount = signal(0);
  readonly lastSolvedAt = signal<Date | null>(null);
  readonly lastMatched = signal(0);

  /** One short line for the sky map's readout. */
  readonly statusText = computed(() => {
    switch (this.status()) {
      case 'off':
        return '';
      case 'waiting':
        return this.lastSolvedAt() ? `Solved, ${this.lastMatched()} stars` : 'Hold still to plate solve';
      case 'solving':
        return 'Plate solving…';
      case 'solved':
        return `Solved, ${this.lastMatched()} stars`;
      case 'failed':
        return this.lastStarCount() > 0 ? `No match in ${this.lastStarCount()} stars` : 'No stars found';
    }
  });

  private camera: OpenCamera | null = null;
  private opening = false;
  private iso = START_ISO;
  private timer?: ReturnType<typeof setInterval>;
  private nextAttemptAt = 0;
  private worker: Worker | null = null;
  private workerReady: Promise<void> | null = null;
  private requestId = 0;
  private readonly pending = new Map<number, (response: SolveResponse) => void>();

  constructor() {
    // Run only while the sensors are on, automatic solving is allowed, and the camera
    // looks straight at the sky. Mirror and clip-on mounts need their own geometry first.
    effect(() => {
      const shouldRun =
        this.state.sensorsActive() && this.state.settings().autoSolve && this.state.settings().mount === 'direct';
      if (shouldRun) this.start();
      else this.stop();
    });
  }

  private start(): void {
    if (this.timer) return;
    this.status.set('waiting');
    this.nextAttemptAt = 0;
    this.timer = setInterval(() => void this.tick(), CHECK_INTERVAL_MS);
  }

  private stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    closeCamera(this.camera);
    this.camera = null;
    this.status.set('off');
    this.state.plateSolving.set(false);
  }

  private async tick(): Promise<void> {
    if (this.status() === 'solving' || this.opening || Date.now() < this.nextAttemptAt) return;
    if (!this.sensors.isStill()) return;
    await this.attempt();
  }

  private async attempt(): Promise<void> {
    this.status.set('solving');
    this.state.plateSolving.set(true);
    try {
      const camera = await this.ensureCamera();
      const frame = await captureStack(camera.video, { exposureSeconds: EXPOSURE_SECONDS, iso: this.iso, frames: 1 });

      // A sky near clipping hides stars, so come down in ISO for next time.
      if (averageLevel(frame.pixels) > MAX_SKY_LEVEL && this.iso > MIN_ISO) {
        this.iso = Math.max(MIN_ISO, Math.round(this.iso / 2));
        await applyCameraSettings(camera.track, { exposureSeconds: EXPOSURE_SECONDS, iso: this.iso, frames: 1 });
        this.finish(false, 0, FAILED_PAUSE_MS / 5);
        return;
      }
      // If the phone moved during the exposure, the stars are smeared.
      if (!this.sensors.isStill()) {
        this.finish(false, 0, 0);
        return;
      }

      const response = await this.solve(frame.pixels, frame.width, frame.height);
      if (response.solution && this.status() === 'solving') {
        const rotation = this.state.skyRotation();
        const [x, y, z] = response.solution.axes.map((axis) => applyMatrix(rotation, axis));
        this.sensors.applyPlateSolve(attitudeFromImageAxes(x, y, z));
        this.lastSolvedAt.set(new Date());
        this.lastMatched.set(response.solution.matched);
      }
      this.finish(!!response.solution, response.starCount, response.solution ? SOLVED_PAUSE_MS : FAILED_PAUSE_MS);
    } catch {
      this.finish(false, 0, FAILED_PAUSE_MS);
    }
  }

  private finish(solved: boolean, starCount: number, pauseMs: number): void {
    this.state.plateSolving.set(false);
    this.lastStarCount.set(starCount);
    this.nextAttemptAt = Date.now() + pauseMs;
    if (this.status() === 'solving') this.status.set(solved ? 'solved' : 'failed');
  }

  private async ensureCamera(): Promise<OpenCamera> {
    if (this.camera) return this.camera;
    this.opening = true;
    try {
      this.camera = await openRearCamera();
      await applyCameraSettings(this.camera.track, { exposureSeconds: EXPOSURE_SECONDS, iso: this.iso, frames: 1 });
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      return this.camera;
    } finally {
      this.opening = false;
    }
  }

  /** Where the sensors say the camera points, as the solver's hint. */
  private hint(): { direction: Vector3; radiusDeg: number } | null {
    const camera = this.state.cameraPointing();
    if (!camera) return null;
    const { raDeg, decDeg } = localToEquatorial(this.state.skyRotation(), horizontalVector(camera));
    return { direction: equatorialVector(raDeg, decDeg), radiusDeg: HINT_RADIUS_DEG };
  }

  private async solve(pixels: Float32Array, width: number, height: number): Promise<SolveResponse> {
    const worker = await this.ensureWorker();
    const id = ++this.requestId;
    const request: SolveRequest = {
      type: 'solve',
      id,
      pixels,
      width,
      height,
      focalPx: FOCAL_SHARE_OF_LONG_SIDE * Math.max(width, height),
      flipped: false,
      hint: this.hint(),
      timeLimitMs: SOLVE_TIME_LIMIT_MS,
    };
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      // The pixels move to the worker rather than being copied, which is much faster.
      worker.postMessage(request, [pixels.buffer]);
    });
  }

  private ensureWorker(): Promise<Worker> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./solver.worker', import.meta.url), { type: 'module' });
      this.worker.addEventListener('message', ({ data }: MessageEvent<SolveResponse>) => {
        this.pending.get(data.id)?.(data);
        this.pending.delete(data.id);
      });
      this.workerReady = fetch('assets/data/stars.json')
        .then((response) => response.json())
        .then((starRows: number[][]) => this.worker?.postMessage({ type: 'init', starRows } satisfies SolveRequest));
    }
    const worker = this.worker;
    return this.workerReady!.then(() => worker);
  }
}
