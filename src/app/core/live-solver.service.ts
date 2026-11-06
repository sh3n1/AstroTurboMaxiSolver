import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AppState } from './app-state.service';
import type { Vector3 } from './astronomy';
import { applyMatrix, horizontalVector, localToEquatorial, equatorialVector } from './astronomy';
import type { Quaternion } from './attitude';
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

/** The result of a plate solve the user asked for, such as during alignment. */
export type SolveNowResult = { ok: true; attitude: Quaternion; matched: number } | { ok: false; reason: string };

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
/** The user is waiting on purpose during alignment, so allow the solver longer. */
const SOLVE_NOW_TIME_LIMIT_MS = 8000;
const MAX_ISO_REDUCTIONS = 6;
/** A learnt field of view outside this range would mean a bad solve, so it is ignored. */
const MIN_FOCAL_FACTOR = 0.7;
const MAX_FOCAL_FACTOR = 1.3;

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

  /** One short line about the last solve, which the sky map shows as a toast when it fails. */
  readonly statusText = computed(() => {
    switch (this.status()) {
      case 'off':
        return '';
      case 'waiting':
        // Nothing to say until the first solve: the user needn't be told to hold still.
        return this.lastSolvedAt() ? `Solved, ${this.lastMatched()} stars` : '';
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
        this.retrySoon(FAILED_PAUSE_MS / 5);
        return;
      }
      // If the phone moved during the exposure, the stars are smeared.
      if (!this.sensors.isStill()) {
        this.retrySoon(0);
        return;
      }

      const response = await this.solve(frame.pixels, frame.width, frame.height);
      if (response.solution && this.status() === 'solving') {
        const rotation = this.state.skyRotation();
        const [x, y, z] = response.solution.axes.map((axis) => applyMatrix(rotation, axis));
        this.sensors.applyPlateSolve(attitudeFromImageAxes(x, y, z));
        this.lastSolvedAt.set(new Date());
        this.lastMatched.set(response.solution.matched);
        this.learnFieldOfView(response.solution.focalPx, frame.width, frame.height);
      }
      this.finish(!!response.solution, response.starCount, response.solution ? SOLVED_PAUSE_MS : FAILED_PAUSE_MS);
    } catch {
      this.finish(false, 0, FAILED_PAUSE_MS);
    }
  }

  /**
   * Gives up on this frame without calling it a failure, because the camera only needed a
   * new setting or the phone moved. That is no reason to tell the user the solve failed.
   */
  private retrySoon(pauseMs: number): void {
    this.state.plateSolving.set(false);
    this.nextAttemptAt = Date.now() + pauseMs;
    if (this.status() === 'solving') this.status.set('waiting');
  }

  private finish(solved: boolean, starCount: number, pauseMs: number): void {
    this.state.plateSolving.set(false);
    this.lastStarCount.set(starCount);
    this.nextAttemptAt = Date.now() + pauseMs;
    if (this.status() === 'solving') this.status.set(solved ? 'solved' : 'failed');
  }

  /**
   * Plate solves straight away, without waiting for the phone to be still, because the
   * user has just said the telescope is still. Used by alignment. It works whether or not
   * the sensors are on, and corrects them if they are.
   */
  async solveNow(): Promise<SolveNowResult> {
    if (this.state.settings().mount !== 'direct') {
      return { ok: false, reason: 'Plate solving only works with the camera pointing straight at the sky so far.' };
    }
    // Let an automatic solve that is already running finish first.
    for (let waited = 0; this.status() === 'solving' && waited < 10_000; waited += 100) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const wasRunning = !!this.timer;
    this.status.set('solving');
    this.state.plateSolving.set(true);
    try {
      const camera = await this.ensureCamera();
      let frame = await captureStack(camera.video, { exposureSeconds: EXPOSURE_SECONDS, iso: this.iso, frames: 1 });
      // Come down in ISO until the sky is no longer close to clipping.
      for (let i = 0; i < MAX_ISO_REDUCTIONS && averageLevel(frame.pixels) > MAX_SKY_LEVEL && this.iso > MIN_ISO; i++) {
        this.iso = Math.max(MIN_ISO, Math.round(this.iso / 2));
        await applyCameraSettings(camera.track, { exposureSeconds: EXPOSURE_SECONDS, iso: this.iso, frames: 1 });
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
        frame = await captureStack(camera.video, { exposureSeconds: EXPOSURE_SECONDS, iso: this.iso, frames: 1 });
      }
      if (averageLevel(frame.pixels) > MAX_SKY_LEVEL) {
        return { ok: false, reason: 'The sky is too bright for the camera to see stars. Keep lights out of view.' };
      }

      const response = await this.solve(frame.pixels, frame.width, frame.height, SOLVE_NOW_TIME_LIMIT_MS);
      this.lastStarCount.set(response.starCount);
      if (!response.solution) {
        return {
          ok: false,
          reason:
            response.starCount > 0
              ? `The camera found ${response.starCount} stars but couldn't match them to the sky. Check that the sky is clear.`
              : 'The camera found no stars. Check that the sky is clear and that the camera has a clear view.',
        };
      }

      const rotation = this.state.skyRotation();
      const [x, y, z] = response.solution.axes.map((axis) => applyMatrix(rotation, axis));
      const attitude = attitudeFromImageAxes(x, y, z);
      this.sensors.applyPlateSolve(attitude);
      this.lastSolvedAt.set(new Date());
      this.lastMatched.set(response.solution.matched);
      this.learnFieldOfView(response.solution.focalPx, frame.width, frame.height);
      return { ok: true, attitude, matched: response.solution.matched };
    } catch (error) {
      return {
        ok: false,
        reason: `The camera could not be used. ${error instanceof Error ? error.message : ''}`.trim(),
      };
    } finally {
      this.state.plateSolving.set(false);
      this.nextAttemptAt = Date.now() + SOLVED_PAUSE_MS;
      if (wasRunning) {
        this.status.set('waiting');
      } else {
        // Nothing else needs the camera, so release it.
        closeCamera(this.camera);
        this.camera = null;
        this.status.set('off');
      }
    }
  }

  /**
   * Remembers the camera's real field of view from a successful solve. Searching for it
   * is slow, so starting from the right value keeps later solves within their time limit.
   */
  private learnFieldOfView(focalPx: number, width: number, height: number): void {
    const factor = focalPx / (FOCAL_SHARE_OF_LONG_SIDE * Math.max(width, height));
    if (Number.isFinite(factor) && factor > MIN_FOCAL_FACTOR && factor < MAX_FOCAL_FACTOR) {
      this.state.updateSettings({ cameraFocalFactor: Number(factor.toFixed(4)) });
    }
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

  private async solve(
    pixels: Float32Array,
    width: number,
    height: number,
    timeLimitMs = SOLVE_TIME_LIMIT_MS,
  ): Promise<SolveResponse> {
    const worker = await this.ensureWorker();
    const id = ++this.requestId;
    const request: SolveRequest = {
      type: 'solve',
      id,
      pixels,
      width,
      height,
      focalPx: FOCAL_SHARE_OF_LONG_SIDE * Math.max(width, height) * this.state.settings().cameraFocalFactor,
      flipped: false,
      hint: this.hint(),
      timeLimitMs,
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
