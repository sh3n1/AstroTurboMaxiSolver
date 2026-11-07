import { computed, Injectable, effect, inject, signal, untracked } from '@angular/core';

import { telescopePointing } from './alignment';
import { AppState } from './app-state.service';
import { viewRollDeg } from './astronomy';
import type { Quaternion } from './attitude';
import {
  StillnessDetector,
  attitudeFromOrientation,
  blendAttitude,
  combineAttitudes,
  inverseAttitude,
  integrateGyroscope,
  phoneUpDirection,
  rearCameraDirection,
} from './attitude';
import { cameraPointing, requestSensorPermission } from './device-orientation';
import { magneticDeclinationDeg } from './magnetic';

/** Share of each orientation reading blended in when it is the only source of movement. */
const ORIENTATION_ONLY_WEIGHT = 0.2;
/**
 * Share blended in when the gyroscope is handling movement. Readings arrive about 13
 * times per second on the phone measured, so this corrects drift over several seconds
 * without the compass's jitter reaching the map.
 */
const WITH_GYROSCOPE_WEIGHT = 0.02;
/** Longest gap between gyroscope readings to trust. A longer one means the page paused. */
const MAX_GYROSCOPE_STEP_SECONDS = 0.1;
/** If no sensor data arrives by then, the phone has no usable sensors. */
const NO_DATA_TIMEOUT_MS = 3000;

/** iOS adds a compass heading to the standard orientation event. */
type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };

/**
 * Feeds the phone's sensors into the app, so moving the phone moves the map. Android
 * Chrome has been run on a real phone. The iOS path follows Apple's documented API but
 * has not yet run on a real iPhone, and iOS may report gyroscope axes differently.
 */
@Injectable({ providedIn: 'root' })
export class SensorService {
  private readonly state = inject(AppState);

  readonly error = signal('');
  /** False when headings are relative to where the phone started, not to true north. */
  readonly hasCompass = signal(true);
  /** True once the phone has stopped moving for long enough to take a long exposure. */
  readonly isStill = signal(false);

  private attitude: Quaternion | null = null;
  private lastGyroscopeTime: number | null = null;
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
    const previous = this.lastGyroscopeTime;
    this.lastGyroscopeTime = event.timeStamp;
    if (previous === null || !this.attitude) return;
    const seconds = (event.timeStamp - previous) / 1000;
    if (seconds <= 0 || seconds > MAX_GYROSCOPE_STEP_SECONDS) return;

    // Browsers report these rates about the phone's x, y and z axes respectively.
    const rates = [rate.alpha, rate.beta, rate.gamma] as const;
    this.attitude = integrateGyroscope(this.attitude, rates, seconds);
    this.isStill.set(this.stillness.update(rates, seconds));
    this.publish();
  };

  constructor() {
    // A new alignment changes where the telescope points, even if the phone doesn't move.
    effect(() => {
      this.state.alignment();
      untracked(() => this.publish());
    });
  }

  /** Must be called from a tap, because browsers only ask for permission after one. */
  async start(): Promise<void> {
    this.error.set('');
    try {
      if (!(await requestSensorPermission())) {
        this.error.set('Sensor access was not allowed.');
        return;
      }
    } catch {
      this.error.set('Sensor access could not be requested.');
      return;
    }

    this.attitude = null;
    this.lastGyroscopeTime = null;
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
      this.error.set('No sensor data. This device may not have the sensors, or the page may not be on HTTPS.');
    }, NO_DATA_TIMEOUT_MS);
  }

  stop(): void {
    clearTimeout(this.noDataTimer);
    window.removeEventListener('deviceorientationabsolute', this.onAbsolute);
    window.removeEventListener('deviceorientation', this.onRelative);
    window.removeEventListener('devicemotion', this.onMotion);
    this.state.sensorsActive.set(false);
    this.state.cameraPointing.set(null);
    this.state.viewRollDeg.set(0);
    this.isStill.set(false);
  }

  private applyOrientation(event: DeviceOrientationEvent, alphaOffsetDeg = 0): void {
    clearTimeout(this.noDataTimer);
    // Alpha grows turning left, against compass headings, so an eastward declination is
    // taken off it to turn the magnetic reading to true north.
    const alphaDeg = (event.alpha ?? 0) + alphaOffsetDeg - this.declinationDeg();
    this.lastReading = attitudeFromOrientation(alphaDeg, event.beta ?? 0, event.gamma ?? 0);
    // After a plate solve, the compass's known error is removed from every reading.
    const reading = this.compassCorrection
      ? combineAttitudes(this.compassCorrection, this.lastReading)
      : this.lastReading;
    // Follow the gyroscope if it is running, and otherwise steady the jittery reading.
    const weight = this.lastGyroscopeTime === null ? ORIENTATION_ONLY_WEIGHT : WITH_GYROSCOPE_WEIGHT;
    this.attitude = this.attitude ? blendAttitude(this.attitude, reading, weight) : reading;
    this.publish();
  }

  /**
   * Takes a plate-solved attitude as the truth. The difference from the compass at that
   * moment is the compass's error, which then corrects every later reading, so the
   * position stays true between solves instead of drifting back to the compass.
   */
  applyPlateSolve(solved: Quaternion): void {
    if (!this.state.sensorsActive()) return;
    this.attitude = solved;
    if (this.lastReading) this.compassCorrection = combineAttitudes(solved, inverseAttitude(this.lastReading));
    this.publish();
  }

  /** Updates where the camera and the telescope point, using any saved alignment. */
  private publish(): void {
    if (!this.attitude || !this.state.sensorsActive()) return;
    const camera = cameraPointing(rearCameraDirection(this.attitude));
    this.state.cameraPointing.set(camera);
    this.state.viewRollDeg.set(viewRollDeg(camera, phoneUpDirection(this.attitude)));
    const alignment = this.state.alignment();
    this.state.pointing.set(alignment ? telescopePointing(camera, alignment.offset) : camera);
  }
}
