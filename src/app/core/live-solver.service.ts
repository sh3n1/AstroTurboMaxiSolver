import { Injectable, effect, inject, isDevMode, signal } from '@angular/core';

import { AppState } from './app-state.service';
import type { Horizontal, Vector3 } from './astronomy';
import { apparentAxes, horizontalVector, localToEquatorial, equatorialVector, separationDeg } from './astronomy';
import type { Quaternion } from './attitude';
import { attitudeFromImageAxes } from './attitude';
import type { CaptureMode, CapturePlan, CaptureSettings, CapturedFrame, OpenCamera } from './camera';
import {
  FOCAL_SHARE_OF_LONG_SIDE,
  planCapture,
  highestIso,
  startingIso,
  longestExposureSeconds,
  applyCameraSettings,
  averageLevel,
  captureStack,
  closeCamera,
  openRearCamera,
} from './camera';
import { isPermissionDenied } from './permission-help';
import { NotNowError, PermissionsService } from './permissions.service';
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
  trigger: SolveTrigger;
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

/** What started a solve: the phone lying still, alignment, or a tap on the rings. */
export type SolveTrigger = 'auto' | 'alignment' | 'tap';

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
/**
 * A learnt field of view this close to the current one isn't saved. Each solve measures it
 * slightly differently, and every change means a new solver index and a settings write.
 */
const FOCAL_FACTOR_TOLERANCE = 0.005;
/** How many attempts the log keeps. */
const LOG_LENGTH = 20;
/** The camera must move at least this far before another automatic attempt. */
const SAME_POSITION_DEG = 1;
/**
 * When one long exposure finds no match, this many are averaged for a second try.
 * Measured in a city sky: single frames at 1/3 s solved about half the time, six averaged
 * every time. Averaging doesn't show fainter stars, but it clears the noise that the star
 * finder takes for stars, which confuses the matching. It takes longer, so it comes second.
 */
const FALLBACK_STACK_FRAMES = 6;

/**
 * Plate solves automatically whenever the sensors are on and the phone is still, then
 * corrects the sensors with the result. This is the app's core idea: sensors for live
 * movement, and plate solving to keep them true.
 */
@Injectable({ providedIn: 'root' })
export class LiveSolverService {
  private readonly state = inject(AppState);
  private readonly permissions = inject(PermissionsService);
  private readonly sensors = inject(SensorService);

  readonly status = signal<Status>('off');
  /**
   * The latest attempts, newest first, kept in memory for this session. The sky map
   * shows a toast for each new one, and Settings lists them for debugging.
   */
  readonly log = signal<SolveLogEntry[]>([]);

  /**
   * On a screen phone linked to a finder phone, solves are asked of the finder, whose
   * camera sees the sky. Set by RemoteService while linked, null otherwise.
   */
  remoteSolve: ((trigger: Exclude<SolveTrigger, 'auto'>) => Promise<SolveNowResult>) | null = null;

  /**
   * Where the camera pointed at the last finished attempt. Trying again from the same
   * place would give the same answer, so the next automatic attempt waits for a move.
   */
  private lastAttemptPointing: Horizontal | null = null;

  private camera: OpenCamera | null = null;
  private opening = false;
  /**
   * The camera was refused, or put off with "Not now": automatic solving waits, rather than
   * asking or failing again every few seconds, until the user asks for a solve themselves.
   */
  private readonly cameraRefused = signal(false);
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
    // Run only while the sensors are on and automatic solving is allowed.
    // Not while planning: the camera sees the real sky, not the one at the chosen time.
    // Not while another tab is on show either: a solve only corrects the map, and the
    // camera and the solving would slow the page the user is on and drain the battery.
    effect(() => {
      const allowed =
        this.state.sensorsActive() &&
        // A screen phone's own camera isn't on the telescope: the finder phone solves.
        !this.state.remoteFinder() &&
        this.state.settings().autoSolve &&
        !this.cameraRefused() &&
        !this.state.planning();
      if (allowed && this.state.mapOnShow()) this.start();
      else if (allowed) this.rest();
      else this.stop();
    });
  }

  private start(): void {
    if (this.timer) return;
    // Back from a rest, it carries on where it was: the same pause, the same last place.
    if (!this.resting) {
      this.status.set('waiting');
      this.nextAttemptAt = 0;
    }
    this.resting = false;
    this.timer = setInterval(() => void this.tick(), CHECK_INTERVAL_MS);
  }

  /**
   * Rests while the map is hidden behind another tab: no new attempts, and the camera is
   * freed. An attempt already under way finishes first, so it isn't logged as a failure
   * for being cut short. It remembers where it last tried, so coming back to the map in
   * the same place doesn't try, and say so, all over again.
   */
  private rest(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    this.resting = true;
    if (this.status() !== 'solving') this.freeCamera();
  }
  private resting = false;

  private freeCamera(): void {
    closeCamera(this.camera);
    this.camera = null;
  }

  private stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.resting = false;
    this.freeCamera();
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
    const entry = { trigger: 'auto' as const, startedAt: Date.now(), iso: this.iso, frames: this.plan.frames };
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

      const { response, inputs, kept, frames } = await this.solveWithFallback(camera, frame, true);
      entry.frames = frames;
      const report = (outcome: 'solved' | 'failed', message: string): void =>
        this.report({
          trigger: 'auto',
          outcome,
          message,
          startedAt: entry.startedAt,
          before,
          kept,
          inputs,
          response,
          frames,
        });
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
      this.record({ ...entry, outcome: 'failed', message: this.cameraFailed(error) });
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
    // The map was hidden meanwhile: the camera was only kept for this attempt.
    if (this.resting) this.freeCamera();
  }

  private finish(solved: boolean, pauseMs: number): void {
    this.state.plateSolving.set(false);
    this.nextAttemptAt = Date.now() + pauseMs;
    if (this.status() === 'solving') this.status.set(solved ? 'solved' : 'failed');
    if (this.resting) this.freeCamera();
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
    /** How many frames were averaged, if not the plan's usual number. */
    frames?: number;
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
      frames: entry.frames ?? this.plan.frames,
      durationMs: Date.now() - entry.startedAt,
      sensorErrorDeg: entry.sensorErrorDeg ?? null,
    };
    this.log.update((log) => [newest, ...log].slice(0, LOG_LENGTH));
  }

  /**
   * Adds an attempt made by the finder phone, so the screen phone tells it with the same
   * toasts and lists it in Settings, as if it had made it itself.
   */
  addRemoteEntry(entry: Omit<SolveLogEntry, 'id'>): void {
    const newest: SolveLogEntry = { ...entry, id: ++this.logCount };
    this.log.update((log) => [newest, ...log].slice(0, LOG_LENGTH));
  }

  /**
   * Plate solves straight away, without waiting for the phone to be still, because the
   * user has just said the telescope is still. Used by alignment. It works whether or not
   * the sensors are on, and corrects them if they are. The trigger says who asked, for the
   * log, and so the sky map can tell a tap's result as it tells automatic ones.
   */
  async solveNow(trigger: Exclude<SolveTrigger, 'auto'> = 'alignment'): Promise<SolveNowResult> {
    if (this.remoteSolve) return this.remoteSolve(trigger);
    // Asked for by the user: the camera may be asked for again, and automatic solving resumes.
    this.cameraRefused.set(false);
    if (this.state.planning()) {
      return { ok: false, reason: 'Paused while showing another time. Go back to now to solve.' };
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
      const entry = { trigger, startedAt, iso: this.iso, frames: this.plan.frames };
      if (averageLevel(frame.pixels) > MAX_SKY_LEVEL) {
        this.record({ ...entry, outcome: 'failed', message: 'Too bright to see stars' });
        return { ok: false, reason: 'Too bright for the camera. Keep lights out of view.' };
      }

      // The user holds the telescope still on purpose, so no need to ask the sensors.
      const { response, inputs, kept, frames } = await this.solveWithFallback(
        camera,
        frame,
        false,
        SOLVE_NOW_TIME_LIMIT_MS,
      );
      entry.frames = frames;
      const report = (outcome: 'solved' | 'failed', message: string): void =>
        this.report({ trigger, outcome, message, startedAt, before, kept, inputs, response, frames });
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
      const message = this.cameraFailed(error);
      this.record({ trigger, startedAt, iso: this.iso, outcome: 'failed', message });
      const refused = error instanceof NotNowError || isPermissionDenied(error);
      return {
        ok: false,
        reason: refused
          ? message
          : `The camera could not be used. ${error instanceof Error ? error.message : ''}`.trim(),
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
    trigger: SolveTrigger;
    outcome: 'solved' | 'failed';
    message: string;
    startedAt: number;
    before: Horizontal | null;
    kept: Float32Array | null;
    inputs: SolveInputs;
    response: SolveResponse;
    /** How many frames the reported picture averages. */
    frames: number;
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
          frames: attempt.frames,
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
    const current = this.state.settings().cameraFocalFactor;
    if (Math.abs(factor - current) <= current * FOCAL_FACTOR_TOLERANCE) return;
    if (Number.isFinite(factor) && factor > MIN_FOCAL_FACTOR && factor < MAX_FOCAL_FACTOR) {
      this.state.updateSettings({ cameraFocalFactor: Number(factor.toFixed(4)) });
    }
  }

  /**
   * What to say when the camera couldn't be used. Refused or put off, automatic solving
   * waits for the user, and a refusal shows how to allow the camera again.
   */
  private cameraFailed(error: unknown): string {
    if (error instanceof NotNowError || isPermissionDenied(error)) this.cameraRefused.set(true);
    if (isPermissionDenied(error)) void this.permissions.showBlocked('camera');
    return cameraErrorMessage(error);
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
      // The first time, a line says why the camera is needed. Not on a finder phone, whose
      // screen is on the telescope: there the browser's own question has to do.
      const camera = await (this.state.finderMode()
        ? openRearCamera()
        : this.permissions.ask('camera', openRearCamera));
      // Forced stacking leaves the exposure to the phone, like phones that don't allow
      // manual exposure, so that case can be tested on a phone that does.
      const longest = longestExposureSeconds(camera.track, MAX_EXPOSURE_SECONDS);
      const manual =
        mode !== 'stack' &&
        (await applyCameraSettings(camera.track, { exposureSeconds: longest, iso: this.iso, frames: 1 }));
      const frameRate = camera.track.getSettings?.().frameRate;
      this.plan = planCapture(mode, manual ? longest : null, frameRate);
      // Stacked short frames need all the brightness the camera has: see startingIso.
      // Otherwise it keeps the current ISO, which may have been lowered for a bright sky.
      const iso = startingIso(this.plan, highestIso(camera.track), this.iso);
      if (iso !== this.iso) {
        this.iso = iso;
        await applyCameraSettings(camera.track, this.captureSettings());
      }
      this.cameraMode = mode;
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      this.camera = camera;
      return camera;
    } finally {
      this.opening = false;
    }
  }

  /**
   * Solves a frame. If one long exposure found no match, takes several at the same
   * settings, averages them and tries once more: see FALLBACK_STACK_FRAMES. Not when the
   * plan already stacks, nor when Settings forces single exposures for testing. For an
   * automatic attempt the phone must still be still, or the stack would be smeared.
   * Returns the pixels to report, if reporting, and how many frames the answer came from.
   */
  private async solveWithFallback(
    camera: OpenCamera,
    frame: CapturedFrame,
    mustStayStill: boolean,
    timeLimitMs?: number,
  ): Promise<{ response: SolveResponse; inputs: SolveInputs; kept: Float32Array | null; frames: number }> {
    // The worker takes the pixels, so keep a copy if this attempt will be reported.
    let kept = this.reporting() ? frame.pixels.slice() : null;
    let frames = this.plan.frames;
    let { response, inputs } = await this.solve(frame.pixels, frame.width, frame.height, timeLimitMs);

    const canStack = this.plan.manual && this.plan.frames === 1 && this.cameraMode === 'normal';
    if (response.solution || !canStack || (mustStayStill && !this.sensors.isStill())) {
      return { response, inputs, kept, frames };
    }
    const stack = await captureStack(camera.video, { ...this.captureSettings(), frames: FALLBACK_STACK_FRAMES });
    if (mustStayStill && !this.sensors.isStill()) return { response, inputs, kept, frames };
    frames = FALLBACK_STACK_FRAMES;
    kept = this.reporting() ? stack.pixels.slice() : null;
    ({ response, inputs } = await this.solve(stack.pixels, stack.width, stack.height, timeLimitMs));
    return { response, inputs, kept, frames };
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
  if (error instanceof NotNowError) return 'Camera not in use yet';
  if (isPermissionDenied(error)) return 'Camera is off';
  return error instanceof Error && error.message ? `Camera unavailable: ${error.message}` : 'Camera unavailable';
}
