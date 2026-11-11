import { Injectable, effect, inject, isDevMode, signal } from '@angular/core';

import { AppState } from './app-state.service';
import type { Horizontal, Vector3 } from './astronomy';
import { apparentAxes, horizontalVector, localToEquatorial, equatorialVector, separationDeg } from './astronomy';
import type { Quaternion } from './attitude';
import { attitudeFromImageAxes } from './attitude';
import type { CaptureMode, CapturePlan, CaptureSettings, OpenCamera } from './camera';
import {
  FOCAL_SHARE_OF_LONG_SIDE,
  planCapture,
  longestExposureSeconds,
  applyCameraSettings,
  averageLevel,
  captureStack,
  closeCamera,
  openRearCamera,
} from './camera';
import { SensorService } from './sensor.service';
import type { SolveInputs } from './solve-report';
import { buildSolveReport, sendSolveReport } from './solve-report';
import type { SolveRequest, SolveResponse } from './solver-messages';

type Status = 'off' | 'waiting' | 'solving' | 'solved' | 'failed';

/** One plate solve attempt, as the log in Settings shows it. */
export interface SolveLogEntry {
  /** Counts up, so a new entry can be told apart from one already seen. */
  id: number;
  at: Date;
  /** Automatic while the phone is still, or asked for by alignment. */
  trigger: 'auto' | 'alignment';
  /** A retry means the frame was unusable, such as too bright, so it tries again soon. */
  outcome: 'solved' | 'failed' | 'retry';
  /** One short line for a toast or the log, such as "No match in 14 stars". */
  message: string;
  starCount: number;
  matched: number;
  iso: number;
  /** How many frames were averaged into the picture. */
  frames: number;
  durationMs: number;
  /** After a solve, how far the sensors were from the true position. */
  sensorErrorDeg: number | null;
}

/** The result of a plate solve the user asked for, such as during alignment. */
export type SolveNowResult = { ok: true; attitude: Quaternion; matched: number } | { ok: false; reason: string };

/**
 * The longest exposure to use, if the phone allows it. Longer shows fainter stars, but
 * makes each solve slower and a hand-held phone more likely to blur.
 */
const MAX_EXPOSURE_SECONDS = 1;
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
/** How many attempts the log keeps. */
const LOG_LENGTH = 20;
/** The camera must move at least this far before another automatic attempt. */
const SAME_POSITION_DEG = 1;

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
  /**
   * The latest attempts, newest first, kept in memory for this session. The sky map
   * shows a toast for each new one, and Settings lists them for debugging.
   */
  readonly log = signal<SolveLogEntry[]>([]);

  /**
   * Where the camera pointed at the last finished attempt. Trying again from the same
   * place would give the same answer, so the next automatic attempt waits for a move.
   */
  private lastAttemptPointing: Horizontal | null = null;

  private camera: OpenCamera | null = null;
  private opening = false;
  private iso = START_ISO;
  /** How pictures are taken, decided from the camera's limits when it opens. */
  private plan: CapturePlan = { frames: 1, frameSeconds: MAX_EXPOSURE_SECONDS, manual: false };
  /** The capture mode the open camera was set up for. A change in Settings reopens it. */
  private cameraMode: CaptureMode | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private nextAttemptAt = 0;
  private worker: Worker | null = null;
  private workerReady: Promise<void> | null = null;
  private requestId = 0;
  private logCount = 0;
  private readonly pending = new Map<number, (response: SolveResponse) => void>();

  constructor() {
    // Run only while the sensors are on, automatic solving is allowed, and the camera
    // looks straight at the sky. Mirror and clip-on mounts need their own geometry first.
    // Not while planning: the camera sees the real sky, not the one at the chosen time.
    effect(() => {
      const shouldRun =
        this.state.sensorsActive() &&
        this.state.settings().autoSolve &&
        this.state.settings().mount === 'direct' &&
        !this.state.planning();
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
    // A fresh start always gets a first attempt, wherever the phone points.
    this.lastAttemptPointing = null;
  }

  private async tick(): Promise<void> {
    if (this.status() === 'solving' || this.opening || Date.now() < this.nextAttemptAt) return;
    if (!this.sensors.isStill()) return;
    // Solved or failed, a second try from the same place would only repeat the answer.
    const here = this.state.cameraPointing();
    if (here && this.lastAttemptPointing && separationDeg(here, this.lastAttemptPointing) < SAME_POSITION_DEG) return;
    await this.attempt();
  }

  private async attempt(): Promise<void> {
    this.status.set('solving');
    this.state.plateSolving.set(true);
    // Where the sensors say the camera points, before any correction.
    const before = this.state.cameraPointing();
    const entry = { trigger: 'auto' as const, startedAt: Date.now(), iso: this.iso };
    try {
      const camera = await this.ensureCamera();
      const frame = await captureStack(camera.video, this.captureSettings());

      // A sky near clipping hides stars, so come down in ISO for next time. With
      // automatic exposure the phone does that itself.
      if (this.plan.manual && averageLevel(frame.pixels) > MAX_SKY_LEVEL && this.iso > MIN_ISO) {
        this.iso = Math.max(MIN_ISO, Math.round(this.iso / 2));
        await applyCameraSettings(camera.track, this.captureSettings());
        this.record({ ...entry, outcome: 'retry', message: `Too bright, ISO lowered to ${this.iso}` });
        this.retrySoon(FAILED_PAUSE_MS / 5);
        return;
      }
      // If the phone moved during the exposure, the stars are smeared.
      if (!this.sensors.isStill()) {
        this.record({ ...entry, outcome: 'retry', message: 'The phone moved during the exposure' });
        this.retrySoon(0);
        return;
      }

      // The worker takes the pixels, so keep a copy if this attempt will be reported.
      const kept = this.reporting() ? frame.pixels.slice() : null;
      const { response, inputs } = await this.solve(frame.pixels, frame.width, frame.height);
      const report = (outcome: 'solved' | 'failed', message: string): void =>
        this.report({ trigger: 'auto', outcome, message, startedAt: entry.startedAt, before, kept, inputs, response });
      if (response.solution && this.status() === 'solving') {
        const rotation = this.state.realSkyRotation();
        const [x, y, z] = apparentAxes(rotation, response.solution.axes);
        this.sensors.applyPlateSolve(attitudeFromImageAxes(x, y, z));
        this.learnFieldOfView(response.solution.focalPx, frame.width, frame.height);
        // The sensors now show the solved position, so that is where this attempt was.
        const after = this.state.cameraPointing();
        this.lastAttemptPointing = after ?? before;
        this.record({
          ...entry,
          outcome: 'solved',
          message: `Plate solved, ${response.solution.matched} stars matched`,
          starCount: response.starCount,
          matched: response.solution.matched,
          sensorErrorDeg: before && after ? separationDeg(before, after) : null,
        });
        report('solved', `Plate solved, ${response.solution.matched} stars matched`);
        this.finish(true, SOLVED_PAUSE_MS);
        return;
      }
      this.lastAttemptPointing = before;
      this.record({
        ...entry,
        outcome: 'failed',
        message: failureMessage(response.starCount),
        starCount: response.starCount,
      });
      report('failed', failureMessage(response.starCount));
      this.finish(false, FAILED_PAUSE_MS);
    } catch (error) {
      this.lastAttemptPointing = before;
      this.record({ ...entry, outcome: 'failed', message: cameraErrorMessage(error) });
      this.finish(false, FAILED_PAUSE_MS);
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

  private finish(solved: boolean, pauseMs: number): void {
    this.state.plateSolving.set(false);
    this.nextAttemptAt = Date.now() + pauseMs;
    if (this.status() === 'solving') this.status.set(solved ? 'solved' : 'failed');
  }

  /** Adds an attempt to the top of the log, dropping the oldest once it is full. */
  private record(entry: {
    trigger: SolveLogEntry['trigger'];
    startedAt: number;
    iso: number;
    outcome: SolveLogEntry['outcome'];
    message: string;
    starCount?: number;
    matched?: number;
    sensorErrorDeg?: number | null;
  }): void {
    const newest: SolveLogEntry = {
      id: ++this.logCount,
      at: new Date(),
      trigger: entry.trigger,
      outcome: entry.outcome,
      message: entry.message,
      starCount: entry.starCount ?? 0,
      matched: entry.matched ?? 0,
      iso: entry.iso,
      frames: this.plan.frames,
      durationMs: Date.now() - entry.startedAt,
      sensorErrorDeg: entry.sensorErrorDeg ?? null,
    };
    this.log.update((log) => [newest, ...log].slice(0, LOG_LENGTH));
  }

  /**
   * Plate solves straight away, without waiting for the phone to be still, because the
   * user has just said the telescope is still. Used by alignment. It works whether or not
   * the sensors are on, and corrects them if they are.
   */
  async solveNow(): Promise<SolveNowResult> {
    if (this.state.planning()) {
      return { ok: false, reason: 'Paused while showing another time. Go back to now to solve.' };
    }
    if (this.state.settings().mount !== 'direct') {
      return { ok: false, reason: 'Only works with the camera pointing straight at the sky, for now.' };
    }
    // Let an automatic solve that is already running finish first.
    for (let waited = 0; this.status() === 'solving' && waited < 10_000; waited += 100) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const wasRunning = !!this.timer;
    this.status.set('solving');
    this.state.plateSolving.set(true);
    const startedAt = Date.now();
    const before = this.state.cameraPointing();
    try {
      const camera = await this.ensureCamera();
      let frame = await captureStack(camera.video, this.captureSettings());
      // Come down in ISO until the sky is no longer close to clipping. With automatic
      // exposure the phone does that itself.
      for (
        let i = 0;
        this.plan.manual && i < MAX_ISO_REDUCTIONS && averageLevel(frame.pixels) > MAX_SKY_LEVEL && this.iso > MIN_ISO;
        i++
      ) {
        this.iso = Math.max(MIN_ISO, Math.round(this.iso / 2));
        await applyCameraSettings(camera.track, this.captureSettings());
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
        frame = await captureStack(camera.video, this.captureSettings());
      }
      const entry = { trigger: 'alignment' as const, startedAt, iso: this.iso };
      if (averageLevel(frame.pixels) > MAX_SKY_LEVEL) {
        this.record({ ...entry, outcome: 'failed', message: 'Too bright to see stars' });
        return { ok: false, reason: 'Too bright for the camera. Keep lights out of view.' };
      }

      const kept = this.reporting() ? frame.pixels.slice() : null;
      const { response, inputs } = await this.solve(frame.pixels, frame.width, frame.height, SOLVE_NOW_TIME_LIMIT_MS);
      const report = (outcome: 'solved' | 'failed', message: string): void =>
        this.report({ trigger: 'alignment', outcome, message, startedAt, before, kept, inputs, response });
      if (!response.solution) {
        this.record({
          ...entry,
          outcome: 'failed',
          message: failureMessage(response.starCount),
          starCount: response.starCount,
        });
        report('failed', failureMessage(response.starCount));
        return {
          ok: false,
          reason:
            response.starCount > 0
              ? `The camera saw ${response.starCount} stars but couldn't match them. Is the sky clear?`
              : 'The camera saw no stars. Is the sky clear?',
        };
      }

      const rotation = this.state.realSkyRotation();
      const [x, y, z] = apparentAxes(rotation, response.solution.axes);
      const attitude = attitudeFromImageAxes(x, y, z);
      this.sensors.applyPlateSolve(attitude);
      this.learnFieldOfView(response.solution.focalPx, frame.width, frame.height);
      const after = this.state.cameraPointing();
      // Automatic solving needn't repeat this one from the same place.
      this.lastAttemptPointing = after ?? before;
      this.record({
        ...entry,
        outcome: 'solved',
        message: `Plate solved, ${response.solution.matched} stars matched`,
        starCount: response.starCount,
        matched: response.solution.matched,
        sensorErrorDeg: before && after ? separationDeg(before, after) : null,
      });
      report('solved', `Plate solved, ${response.solution.matched} stars matched`);
      return { ok: true, attitude, matched: response.solution.matched };
    } catch (error) {
      this.record({
        trigger: 'alignment',
        startedAt,
        iso: this.iso,
        outcome: 'failed',
        message: cameraErrorMessage(error),
      });
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

  /** Whether each attempt is sent to the PC: a debugging setting, only in development. */
  private reporting(): boolean {
    return isDevMode() && this.state.settings().sendSolves;
  }

  /** Sends a finished attempt, with its frame, to the PC. Does nothing unless reporting. */
  private report(attempt: {
    trigger: 'auto' | 'alignment';
    outcome: 'solved' | 'failed';
    message: string;
    startedAt: number;
    before: Horizontal | null;
    kept: Float32Array | null;
    inputs: SolveInputs;
    response: SolveResponse;
  }): void {
    if (!attempt.kept) return;
    const report = buildSolveReport(
      {
        trigger: attempt.trigger,
        outcome: attempt.outcome,
        message: attempt.message,
        durationMs: Date.now() - attempt.startedAt,
        camera: {
          exposureSeconds: this.plan.frameSeconds,
          iso: this.iso,
          frames: this.plan.frames,
          manual: this.plan.manual,
        },
        settings: { ...this.state.settings() },
        alignment: this.state.alignment(),
        inputs: attempt.inputs,
        sensorsBefore: attempt.before,
        sensorsAfter: this.state.cameraPointing(),
        sensors: this.sensors.snapshot(),
      },
      attempt.kept,
      attempt.response,
    );
    void sendSolveReport(report);
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
    const mode = this.state.settings().captureMode;
    if (this.camera && this.cameraMode === mode) return this.camera;
    // The capture mode changed in Settings: start again from a fresh camera, because one
    // set to manual exposure can't always be put back to automatic.
    closeCamera(this.camera);
    this.camera = null;
    this.opening = true;
    try {
      const camera = await openRearCamera();
      // Forced stacking leaves the exposure to the phone, like phones that don't allow
      // manual exposure, so that case can be tested on a phone that does.
      const longest = longestExposureSeconds(camera.track, MAX_EXPOSURE_SECONDS);
      const manual =
        mode !== 'stack' &&
        (await applyCameraSettings(camera.track, { exposureSeconds: longest, iso: this.iso, frames: 1 }));
      const frameRate = camera.track.getSettings?.().frameRate;
      this.plan = planCapture(mode, manual ? longest : null, frameRate);
      this.cameraMode = mode;
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      this.camera = camera;
      return camera;
    } finally {
      this.opening = false;
    }
  }

  /** The settings for the next picture, from the plan and the current ISO. */
  private captureSettings(): CaptureSettings {
    return { exposureSeconds: this.plan.frameSeconds, iso: this.iso, frames: this.plan.frames };
  }

  /** Where the sensors say the camera points, as the solver's hint. */
  private hint(): { direction: Vector3; radiusDeg: number } | null {
    const camera = this.state.cameraPointing();
    if (!camera) return null;
    const { raDeg, decDeg } = localToEquatorial(this.state.realSkyRotation(), horizontalVector(camera));
    return { direction: equatorialVector(raDeg, decDeg), radiusDeg: HINT_RADIUS_DEG };
  }

  private async solve(
    pixels: Float32Array,
    width: number,
    height: number,
    timeLimitMs = SOLVE_TIME_LIMIT_MS,
  ): Promise<{ response: SolveResponse; inputs: SolveInputs }> {
    const worker = await this.ensureWorker();
    const id = ++this.requestId;
    const inputs: SolveInputs = {
      width,
      height,
      focalPx: FOCAL_SHARE_OF_LONG_SIDE * Math.max(width, height) * this.state.settings().cameraFocalFactor,
      // A mirror mount flips the image.
      flipped: this.state.settings().mount === 'mirror',
      hint: this.hint(),
      timeLimitMs,
    };
    const request: SolveRequest = { type: 'solve', id, pixels, ...inputs };
    return new Promise((resolve) => {
      this.pending.set(id, (response) => resolve({ response, inputs }));
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

/** What to tell the user when the solver ran but found no answer. */
function failureMessage(starCount: number): string {
  return starCount > 0 ? `No match in ${starCount} stars` : 'No stars found';
}

/** What to tell the user when the camera could not take a picture. */
function cameraErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? `Camera unavailable: ${error.message}` : 'Camera unavailable';
}
