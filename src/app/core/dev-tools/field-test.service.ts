import { effect, inject, Injectable, isDevMode } from '@angular/core';

import { AppState } from '../app-state.service';
import { equatorialToHorizontal, separationDeg } from '../astronomy/astronomy';
import { PuckLinkService } from '../remote/puck-link.service';
import { SensorService } from '../sensors/sensor.service';
import { closeCamera, openRearCamera } from '../solver/camera';
import { LiveSolverService } from '../solver/live-solver.service';

import type { FieldSolve } from './field-log';
import { fieldActive, fieldEvent, onFieldSolveDone, setFieldActive, setFieldStep, takeFieldEvents } from './field-log';

/** How often the events go to the collector, and the pointing is noted. */
const SEND_INTERVAL_MS = 1000;
const POSE_INTERVAL_MS = 500;
/** How often to look for a collector while there is none. */
const LOOK_INTERVAL_MS = 15_000;
/** Failed asks in a row before the collector is taken to be gone. */
const GONE_AFTER_FAILURES = 3;

interface FieldCommand {
  id: number;
  t: 'snapshot' | 'solve' | 'photo' | 'config';
  step?: number;
  /** With `config`: whether a normal photo follows every plate solve. */
  photoEverySolve?: boolean;
}

const round = (value: number, places = 3): number => Number(value.toFixed(places));

/** Longest side of a normal photo: enough to see trees and street lights, small to send. */
const NORMAL_PHOTO_PX = 1280;
/** Time for the phone's automatic exposure to settle after the camera opens. */
const NORMAL_PHOTO_SETTLE_MS = 2000;

/**
 * A photo in colour with the phone's own automatic exposure, as a JPEG data URL: what is in
 * front of the camera, such as trees, street lights or clouds. The solver's camera must be
 * free (LiveSolverService.withCameraFree).
 */
async function takeNormalPhoto(): Promise<string> {
  const camera = await openRearCamera();
  try {
    await new Promise((resolve) => setTimeout(resolve, NORMAL_PHOTO_SETTLE_MS));
    const { videoWidth: width, videoHeight: height } = camera.video;
    if (!width || !height) throw new Error('The camera gave no picture.');
    const scale = Math.min(1, NORMAL_PHOTO_PX / Math.max(width, height));
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = [Math.round(width * scale), Math.round(height * scale)];
    canvas.getContext('2d')?.drawImage(camera.video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    closeCamera(camera);
  }
}

/**
 * Field tests (docs/field-tests.md), in development only: while the laptop's
 * collector answers through the dev server's proxy, it sends what the app does (where it
 * points, the target, solves, alignment, the puck's link) and carries out the agent's
 * commands, such as a step's normal photo and plate solve. With no collector it only looks
 * for one now and then, and the app works as always.
 */
@Injectable({ providedIn: 'root' })
export class FieldTestService {
  private readonly state = inject(AppState);
  private readonly solver = inject(LiveSolverService);
  private readonly puck = inject(PuckLinkService);
  private readonly sensors = inject(SensorService);
  private lastCommand = 0;
  private failures = 0;
  /** A normal photo after every plate solve, automatic ones too: the agent can turn it off. */
  private photoEverySolve = true;
  private photoBusy = false;

  constructor() {
    if (!isDevMode()) return;
    // Changes, as they happen. Before a collector answers these note nothing; once one
    // does, a full snapshot goes first.
    effect(() => fieldEvent('puckStatus', { status: this.puck.status(), error: this.puck.error() }));
    effect(() => {
      const target = this.state.selectedTarget();
      fieldEvent('target', { id: target?.id ?? null, name: target?.name ?? null });
    });
    effect(() => fieldEvent('alignment', { alignment: this.state.alignment() }));
    effect(() => fieldEvent('viewMode', { mode: this.state.viewMode() }));
    effect(() => fieldEvent('sensors', { on: this.state.sensorsActive(), finder: this.state.finderMode() }));
    effect(() => fieldEvent('equipment', { equipment: this.state.equipment() }));
    effect(() => {
      const newest = this.solver.log()[0];
      if (newest) fieldEvent('solve', { ...newest });
    });
    // Every solve's telescope picture is taken by the collector as it starts; its normal
    // photo follows here as it ends.
    onFieldSolveDone((solve) => void this.afterSolve(solve));
    void this.look();
  }

  /** The normal photo after a plate solve, in the same folder as its frame. */
  private async afterSolve(solve: FieldSolve): Promise<void> {
    if (!this.photoEverySolve || this.photoBusy) return;
    await this.photo({ solve: solve.id, step: solve.step, trigger: solve.trigger });
  }

  /** A normal photo, with what the app showed as it was taken, sent to the collector. */
  private async photo(about: Record<string, unknown>): Promise<void> {
    this.photoBusy = true;
    try {
      const snapshot = this.snapshot();
      const image = await this.solver.withCameraFree(takeNormalPhoto).catch(() => null);
      await this.post('/field/context', { ...about, at: Date.now(), image, snapshot });
    } catch (error) {
      fieldEvent('photoFailed', { ...about, error: String(error) });
    } finally {
      this.photoBusy = false;
    }
  }

  /** Says hello to the collector, and starts when it answers. */
  private async look(): Promise<void> {
    try {
      const answer = await this.post('/field/hello', {
        browser: navigator.userAgent,
        screen: { width: screen.width, height: screen.height, ratio: devicePixelRatio },
        settings: this.state.settings(),
        equipment: this.state.equipment(),
      });
      this.lastCommand = (answer as { lastCommand?: number }).lastCommand ?? 0;
    } catch {
      setTimeout(() => void this.look(), LOOK_INTERVAL_MS);
      return;
    }
    this.failures = 0;
    setFieldActive(true);
    fieldEvent('snapshot', this.snapshot());
    const send = setInterval(() => void this.send(), SEND_INTERVAL_MS);
    const pose = setInterval(() => fieldEvent('pose', this.pose()), POSE_INTERVAL_MS);
    await this.obeyCommands();
    // The collector is gone: stop, and look for it again.
    clearInterval(send);
    clearInterval(pose);
    setFieldActive(false);
    setTimeout(() => void this.look(), LOOK_INTERVAL_MS);
  }

  private async send(): Promise<void> {
    const events = takeFieldEvents();
    if (!events.length) return;
    try {
      await this.post('/field/events', { events });
    } catch {
      // Lost with this batch; the commands' loop notices a collector that is gone.
    }
  }

  /** Asks for the agent's commands, waiting for each, until the collector stops answering. */
  private async obeyCommands(): Promise<void> {
    while (fieldActive() && this.failures < GONE_AFTER_FAILURES) {
      let commands: FieldCommand[];
      try {
        const response = await fetch(`/field/commands?after=${this.lastCommand}`);
        if (!response.ok) throw new Error(String(response.status));
        commands = ((await response.json()) as { commands: FieldCommand[] }).commands;
        this.failures = 0;
      } catch {
        this.failures++;
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      for (const command of commands) {
        this.lastCommand = command.id;
        await this.obey(command);
      }
    }
  }

  private async obey(command: FieldCommand): Promise<void> {
    const step = command.step ?? null;
    fieldEvent('commandStart', { command });
    setFieldStep(step);
    try {
      // The user said a step is done: what the app shows at that moment. The app solves by
      // itself once the telescope stops, and each solve brings its pictures.
      if (command.t === 'snapshot') fieldEvent('snapshot', { step, ...this.snapshot() });
      // A solve asked for, should the agent want one.
      if (command.t === 'solve') {
        const result = await this.solver.solveNow('tap');
        fieldEvent('solveNow', { step, result, after: this.snapshot() });
      }
      if (command.t === 'photo') await this.photo({ step });
      if (command.t === 'config' && command.photoEverySolve !== undefined) {
        this.photoEverySolve = command.photoEverySolve;
      }
    } catch (error) {
      fieldEvent('commandFailed', { command, error: String(error) });
    } finally {
      setFieldStep(null);
      fieldEvent('commandDone', { command });
    }
  }

  /** Where the telescope and camera point, and how far the target is. */
  private pose(): Record<string, unknown> {
    const pointing = this.state.pointing();
    const camera = this.state.cameraPointing();
    const target = this.state.selectedTarget();
    const at = target ? equatorialToHorizontal(this.state.skyRotation(), target.raDeg, target.decDeg) : null;
    return {
      alt: round(pointing.altDeg),
      az: round(pointing.azDeg),
      roll: round(this.state.viewRollDeg(), 1),
      camera: camera ? { alt: round(camera.altDeg), az: round(camera.azDeg) } : null,
      targetDistance: at ? round(separationDeg(pointing, at)) : null,
      targetAt: at ? { alt: round(at.altDeg), az: round(at.azDeg) } : null,
      still: this.sensors.isStill(),
      solving: this.state.plateSolving(),
    };
  }

  /** Everything at once: at the start, and at each step. */
  private snapshot(): Record<string, unknown> {
    const target = this.state.selectedTarget();
    return {
      ...this.pose(),
      target: target ? { id: target.id, name: target.name, raDeg: target.raDeg, decDeg: target.decDeg } : null,
      alignment: this.state.alignment(),
      viewMode: this.state.viewMode(),
      puck: this.puck.status(),
      sensorsOn: this.state.sensorsActive(),
      finder: this.state.finderMode(),
      remoteFinder: this.state.remoteFinder(),
      equipment: this.state.equipment(),
      sensors: this.sensors.snapshot(),
    };
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  }
}
