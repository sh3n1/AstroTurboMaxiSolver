import { Injectable, effect, inject, signal, untracked } from '@angular/core';

import { telescopePointing } from './alignment';
import { AppState } from './app-state.service';
import type { Vector3 } from './astronomy';
import { cameraPointing, rearCameraVector, requestSensorPermission, smoothVector } from './device-orientation';

/** Share of each new reading blended in. Lower is steadier, higher is more responsive. */
const SMOOTHING_WEIGHT = 0.2;
/** If no sensor data arrives by then, the phone has no usable sensors. */
const NO_DATA_TIMEOUT_MS = 3000;

/** iOS adds a compass heading to the standard orientation event. */
type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };

/**
 * Feeds the phone's orientation into the app, so moving the phone moves the map.
 * Android Chrome is tested. The iOS path follows Apple's documented API but has not
 * yet run on a real iPhone.
 */
@Injectable({ providedIn: 'root' })
export class SensorService {
  private readonly state = inject(AppState);

  readonly error = signal('');
  /** False when headings are relative to where the phone started, not to true north. */
  readonly hasCompass = signal(true);

  private smoothed: Vector3 | null = null;
  private noDataTimer?: ReturnType<typeof setTimeout>;
  private compassOffsetDeg: number | null = null;

  // Handlers are kept as fields so the same functions can be removed again.
  private readonly onAbsolute = (event: Event): void => {
    // A reading with no values means this event isn't really supported here.
    if ((event as DeviceOrientationEvent).alpha === null) return;
    // Absolute readings are better, so stop listening to the relative ones.
    window.removeEventListener('deviceorientation', this.onRelative);
    this.hasCompass.set(true);
    this.apply(event as DeviceOrientationEvent);
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
    this.apply(event, this.compassOffsetDeg ?? 0);
  };

  constructor() {
    // Night mode and other settings don't matter here, but a new alignment does.
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

    this.smoothed = null;
    this.compassOffsetDeg = null;
    this.state.sensorsActive.set(true);
    window.addEventListener('deviceorientationabsolute', this.onAbsolute);
    window.addEventListener('deviceorientation', this.onRelative);
    this.noDataTimer = setTimeout(() => {
      this.stop();
      this.error.set('No sensor data. This device may not have the sensors, or the page may not be on HTTPS.');
    }, NO_DATA_TIMEOUT_MS);
  }

  stop(): void {
    clearTimeout(this.noDataTimer);
    window.removeEventListener('deviceorientationabsolute', this.onAbsolute);
    window.removeEventListener('deviceorientation', this.onRelative);
    this.state.sensorsActive.set(false);
    this.state.cameraPointing.set(null);
  }

  private apply(event: DeviceOrientationEvent, alphaOffsetDeg = 0): void {
    clearTimeout(this.noDataTimer);
    const vector = rearCameraVector((event.alpha ?? 0) + alphaOffsetDeg, event.beta ?? 0, event.gamma ?? 0);
    this.smoothed = smoothVector(this.smoothed, vector, SMOOTHING_WEIGHT);
    this.publish();
  }

  /** Updates where the camera and the telescope point, using any saved alignment. */
  private publish(): void {
    if (!this.smoothed || !this.state.sensorsActive()) return;
    const camera = cameraPointing(this.smoothed);
    this.state.cameraPointing.set(camera);
    const alignment = this.state.alignment();
    this.state.pointing.set(alignment ? telescopePointing(camera, alignment.offset) : camera);
  }
}
