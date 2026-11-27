import { computed, Injectable, effect, inject, signal, untracked } from '@angular/core';

import { telescopePointing } from '../alignment/alignment';
import { offsetFor } from '../alignment/alignment-sync';
import { AppState } from '../app-state.service';
import { viewRollDeg } from '../astronomy/astronomy';
import { fieldEvent } from '../dev-tools/field-log';
import { t } from '../i18n/t';
import { InstallService } from '../platform/install.service';
import { NotNowError, PermissionsService } from '../platform/permissions.service';

import type { Quaternion } from './attitude';
import {
  PauseDetector,
  StillnessDetector,
  attitudeFromOrientation,
  blendAttitude,
  combineAttitudes,
  inverseAttitude,
  integrateGyroscope,
  screenUpDirection,
  rearCameraDirection,
} from './attitude';
import { cameraPointing, requestSensorPermission } from './device-orientation';
import { magneticDeclinationDeg } from './magnetic';
import { screenAngleDeg } from './sideways';

/** Share of each orientation reading blended in when it is the only source of movement. */
const ORIENTATION_ONLY_WEIGHT = 0.2;
/**
 * Share blended in when the gyroscope is handling movement. Readings arrive about 13
 * times per second on the phone measured, so this corrects drift over several seconds
 * without the compass's jitter reaching the map.
 */
const WITH_GYROSCOPE_WEIGHT = 0.02;
/**
 * Longest gap between gyroscope readings still taken as one step, at the rate the reading
 * after it gives. A page busy for a moment (the screen turning, a big upload) delays them,
 * and throwing those steps away lost the turn made meanwhile: the map then lagged, and the
 * compass dragged it back over the next seconds (field tests, 2026-11-24).
 */
const MAX_GYROSCOPE_STEP_SECONDS = 1;
/**
 * A longer gap than PAUSE_MS between any sensor readings means the page was paused, such as
 * with the screen locked. The phone's own orientation then settles again for a few seconds,
 * sweeping wildly while the telescope is still (167° in 12 s, field tests, 2026-11-24), so
 * for SETTLE_AFTER_PAUSE_MS the gyroscope alone moves the map and readings aren't blended in.
 */
const PAUSE_MS = 2000;
const SETTLE_AFTER_PAUSE_MS = 8000;
/** If no sensor data arrives by then, the phone has no usable sensors. */
const NO_DATA_TIMEOUT_MS = 3000;
/**
 * Whether this phone's own sensors were on, so they come back on when the app opens again,
 * as after the browser reloaded the page: they stayed off until tapped, and the map sat at
 * its default for a minute (field tests, 2026-11-24). This device only (docs/local-data.md).
 */
const SENSORS_ON_KEY = 'astroturbomaxisolver.sensorsOn';

/** iOS adds a compass heading to the standard orientation event. */
type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };

/**
 * Feeds the phone's sensors into the app, so moving the phone moves the map. Android
 * Chrome has been run on a real phone. The iOS path follows Apple's documented API but
 * has not yet run on a real iPhone, and iOS may report gyroscope axes differently.
 */
@Injectable({ providedIn: 'root' })
export class SensorService {
  private readonly install = inject(InstallService);
  private readonly permissions = inject(PermissionsService);
  private readonly state = inject(AppState);

  readonly error = signal('');
  /** False when headings are relative to where the phone started, not to true north. */
  readonly hasCompass = signal(true);
  /** True once the phone has stopped moving for long enough to take a long exposure. */
  readonly isStill = signal(false);

  private attitude: Quaternion | null = null;
  private lastGyroscopeTime: number | null = null;
  /** Notices the page was paused, after which readings settle: see PAUSE_MS. */
  private pauses = new PauseDetector(PAUSE_MS, SETTLE_AFTER_PAUSE_MS);
  private stillness = new StillnessDetector();
  private noDataTimer?: ReturnType<typeof setTimeout>;
  private compassOffsetDeg: number | null = null;
  /** The latest raw orientation reading, before any correction. */
  private lastReading: Quaternion | null = null;
  /** What turns a raw orientation reading into the truth, learnt from plate solves. */
  private compassCorrection: Quaternion | null = null;

  // Handlers are kept as fields so the same functions can be removed again.
  /**
   * How far magnetic north is from true north where the user is. Phones report headings
   * from magnetic north, so readings are turned by this to face true north. Without a
   * location there is nothing to correct for, so it stays zero.
   */
  private readonly declinationDeg = computed(() => {
    const { latitudeDeg, longitudeDeg, locationSet } = this.state.settings();
    return locationSet ? magneticDeclinationDeg(latitudeDeg, longitudeDeg, new Date()) : 0;
  });

  private readonly onAbsolute = (event: Event): void => {
    // A reading with no values means this event isn't really supported here.
    if ((event as DeviceOrientationEvent).alpha === null) return;
    // Absolute readings are better, so stop listening to the relative ones.
    window.removeEventListener('deviceorientation', this.onRelative);
    this.hasCompass.set(true);
    this.applyOrientation(event as DeviceOrientationEvent);
  };

  private readonly onRelative = (event: DeviceOrientationEvent): void => {
    if (event.alpha === null) return;
    const { webkitCompassHeading: heading } = event as OrientationEventWithCompass;
    if (heading !== undefined) {
      // iOS alpha starts at an arbitrary direction, so align it once with the compass.
      this.compassOffsetDeg ??= 360 - heading - event.alpha;
      this.hasCompass.set(true);
    } else {
      this.hasCompass.set(event.absolute);
    }
    this.applyOrientation(event, this.compassOffsetDeg ?? 0);
  };

  private readonly onMotion = (event: DeviceMotionEvent): void => {
    const rate = event.rotationRate;
    if (rate?.alpha == null || rate.beta == null || rate.gamma == null) return;
    this.notePause(event.timeStamp);
    const previous = this.lastGyroscopeTime;
    this.lastGyroscopeTime = event.timeStamp;
    if (previous === null || !this.attitude) return;
    const seconds = (event.timeStamp - previous) / 1000;
    if (seconds <= 0) return;
    // Noted in field tests, to see how often the page holds the readings back.
    if (seconds > 0.1) fieldEvent('gyroGap', { ms: Math.round(seconds * 1000) });
    if (seconds > MAX_GYROSCOPE_STEP_SECONDS) return;

    // Browsers report these rates about the phone's x, y and z axes respectively.
    const rates = [rate.alpha, rate.beta, rate.gamma] as const;
    this.attitude = integrateGyroscope(this.attitude, rates, seconds);
    this.isStill.set(this.stillness.update(rates, seconds));
    this.publish();
  };

  /** Whether the sensors were on when the app last closed, read before the effect below saves. */
  private readonly wereOn = readSensorsOn();

  constructor() {
    // A new alignment changes where the telescope points, even if the phone doesn't move.
    effect(() => {
      this.state.alignment();
      untracked(() => this.publish());
    });
    // Remembers whether this phone's own sensors are on; not a finder phone's, which steer
    // a screen phone only while linked.
    effect(() => saveSensorsOn(this.state.sensorsActive() && !this.state.remoteFinder()));
  }

  /**
   * Turns the sensors back on as the app opens, if they were on when it last closed. Not on
   * an iPhone, which only allows them after a tap: there the user taps the tile as usual.
   */
  resumeIfWereOn(): void {
    if (this.wereOn && !this.install.isApple) void this.start({ automatic: true });
  }

  /**
   * Must be called from a tap, because browsers only ask for permission after one.
   * Automatic starts, such as when a target is chosen, stay quiet if the device simply
   * has no sensors, like a computer. A refused permission is still told, since the user
   * chose that and may want to change it.
   */
  async start({ automatic = false }: { automatic?: boolean } = {}): Promise<void> {
    // A finder phone on the telescope steers the map: this phone's sensors aren't on it.
    if (this.state.remoteFinder()) return;
    this.error.set('');
    try {
      // Only iPhones ask for the motion sensors, so only they get the reason first.
      const allowed = this.install.isApple
        ? await this.permissions.ask('motion', requestSensorPermission)
        : await requestSensorPermission();
      if (!allowed) {
        this.error.set(t('sensors.off'));
        // How to allow them again, when the user asked for them: not on a start of the app's own.
        if (!automatic) void this.permissions.showBlocked('motion');
        return;
      }
    } catch (error) {
      // "Not now" was the user's own choice: nothing to say.
      if (!automatic && !(error instanceof NotNowError)) this.error.set(t('sensors.notRequested'));
      return;
    }

    this.attitude = null;
    this.lastGyroscopeTime = null;
    this.pauses = new PauseDetector(PAUSE_MS, SETTLE_AFTER_PAUSE_MS);
    this.stillness = new StillnessDetector();
    this.isStill.set(false);
    this.compassOffsetDeg = null;
    this.lastReading = null;
    this.compassCorrection = null;
    this.state.sensorsActive.set(true);
    window.addEventListener('deviceorientationabsolute', this.onAbsolute);
    window.addEventListener('deviceorientation', this.onRelative);
    window.addEventListener('devicemotion', this.onMotion);
    this.noDataTimer = setTimeout(() => {
      this.stop();
      if (!automatic) {
        this.error.set(t('sensors.noData'));
      }
    }, NO_DATA_TIMEOUT_MS);
  }

  stop(): void {
    // Steered by a finder phone, which only unlinking stops.
    if (this.state.remoteFinder()) return;
    clearTimeout(this.noDataTimer);
    window.removeEventListener('deviceorientationabsolute', this.onAbsolute);
    window.removeEventListener('deviceorientation', this.onRelative);
    window.removeEventListener('devicemotion', this.onMotion);
    this.state.sensorsActive.set(false);
    this.state.cameraPointing.set(null);
    this.state.viewRollDeg.set(0);
    this.isStill.set(false);
  }

  /** Notes a reading's time, to notice the page was paused: see PAUSE_MS. */
  private notePause(timeStamp: number): void {
    const pausedMs = this.pauses.note(timeStamp);
    if (pausedMs) fieldEvent('sensorPause', { ms: Math.round(pausedMs) });
  }

  private applyOrientation(event: DeviceOrientationEvent, alphaOffsetDeg = 0): void {
    clearTimeout(this.noDataTimer);
    this.notePause(event.timeStamp);
    // Alpha grows turning left, against compass headings, so an eastward declination is
    // taken off it to turn the magnetic reading to true north.
    const alphaDeg = (event.alpha ?? 0) + alphaOffsetDeg - this.declinationDeg();
    this.lastReading = attitudeFromOrientation(alphaDeg, event.beta ?? 0, event.gamma ?? 0);
    // After a plate solve, the compass's known error is removed from every reading.
    const reading = this.compassCorrection
      ? combineAttitudes(this.compassCorrection, this.lastReading)
      : this.lastReading;
    // Just after a pause the reading is still settling: the gyroscope alone moves the map.
    if (this.attitude && this.lastGyroscopeTime !== null && this.pauses.settling(event.timeStamp)) return;
    // Follow the gyroscope if it is running, and otherwise steady the jittery reading.
    const weight = this.lastGyroscopeTime === null ? ORIENTATION_ONLY_WEIGHT : WITH_GYROSCOPE_WEIGHT;
    this.attitude = this.attitude ? blendAttitude(this.attitude, reading, weight) : reading;
    this.publish();
  }

  /**
   * Takes a plate-solved attitude as the truth. The difference from the compass at that
   * moment is the compass's error, which then corrects every later reading, so the
   * position stays true between solves instead of drifting back to the compass.
   * With the sensors off, the map only moves to the solved position, once.
   */
  applyPlateSolve(solved: Quaternion): void {
    if (!this.state.sensorsActive()) {
      this.show(solved);
      return;
    }
    this.attitude = solved;
    if (this.lastReading) this.compassCorrection = combineAttitudes(solved, inverseAttitude(this.lastReading));
    this.publish();
  }

  /** The sensors' inner state, for debugging reports. Quaternions are [w, x, y, z]. */
  snapshot(): {
    attitude: Quaternion | null;
    rawReading: Quaternion | null;
    compassCorrection: Quaternion | null;
    hasCompass: boolean;
    isStill: boolean;
    gyroscope: boolean;
    declinationDeg: number;
  } {
    return {
      attitude: this.attitude,
      rawReading: this.lastReading,
      compassCorrection: this.compassCorrection,
      hasCompass: this.hasCompass(),
      isStill: this.isStill(),
      gyroscope: this.lastGyroscopeTime !== null,
      declinationDeg: this.declinationDeg(),
    };
  }

  /** Updates where the camera and the telescope point, using any saved alignment. */
  private publish(): void {
    if (!this.attitude || !this.state.sensorsActive()) return;
    this.show(this.attitude);
  }

  /** Shows the phone's attitude on the map: where the camera points, and the telescope. */
  private show(attitude: Quaternion): void {
    const camera = cameraPointing(rearCameraDirection(attitude));
    this.state.cameraPointing.set(camera);
    // The map turns with the screen's picture, which the browser turns when the phone is
    // on its side, so up on the map stays up on the screen.
    this.state.viewRollDeg.set(viewRollDeg(camera, screenUpDirection(attitude, screenAngleDeg())));
    const alignment = this.state.alignment();
    // The alignment, corrected by any syncs near where the camera points.
    this.state.pointing.set(alignment ? telescopePointing(camera, offsetFor(alignment, camera, new Date())) : camera);
  }
}

/** Whether the sensors were on when the app last closed. Blocked storage counts as off. */
function readSensorsOn(): boolean {
  try {
    return localStorage.getItem(SENSORS_ON_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveSensorsOn(on: boolean): void {
  try {
    localStorage.setItem(SENSORS_ON_KEY, String(on));
  } catch {
    // Blocked storage: the sensors simply stay off next time.
  }
}
