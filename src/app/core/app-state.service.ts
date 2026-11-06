import { Injectable, computed, effect, signal } from '@angular/core';

import type { Horizontal, Vector3 } from './astronomy';
import {
  equatorialToHorizontal,
  horizontalVector,
  localToEquatorial,
  skyConditions,
  skyRotation,
  solarSystemPosition,
} from './astronomy';
import type { Target } from './targets';
import { SOLAR_SYSTEM_BODIES } from './targets';

export type TelescopeType = 'newtonian' | 'refractor' | 'cassegrain';
export type MountType = 'direct' | 'clip-on' | 'mirror';

/** Everything the user configures. Saved on this device. */
export interface Settings {
  latitudeDeg: number;
  longitudeDeg: number; // Positive to the east
  telescopeType: TelescopeType;
  telescopeFocalMm: number;
  eyepieceFocalMm: number;
  eyepieceFieldDeg: number; // The eyepiece's apparent field of view
  mount: MountType;
  nightMode: boolean;
  /** Plate solve automatically whenever sensors are on and the phone is still. */
  autoSolve: boolean;
}

/** How an alignment measured the camera's direction. Plate solving is the accurate one. */
export type AlignmentMethod = 'plate-solve' | 'sensors' | 'simulated';

/** A completed alignment. It stays valid while the phone stays fixed in its mount. */
export interface Alignment {
  starId: string;
  alignedAt: string; // ISO date
  mount: MountType;
  offset: Vector3; // The telescope's direction in the camera's axes
  /** Missing on alignments saved before plate solving existed, which used the sensors. */
  method?: AlignmentMethod;
}

// Starts at Valencia, with a common beginner telescope and eyepiece.
const DEFAULT_SETTINGS: Settings = {
  latitudeDeg: 39.47,
  longitudeDeg: -0.38,
  telescopeType: 'newtonian',
  telescopeFocalMm: 650,
  eyepieceFocalMm: 25,
  eyepieceFieldDeg: 52,
  mount: 'direct',
  nightMode: false,
  autoSolve: true,
};

const SETTINGS_KEY = 'astrofinder.settings';
const PLAN_KEY = 'astrofinder.plan';
const ALIGNMENT_KEY = 'astrofinder.alignment';

// Browser storage can be blocked or cleared, so the app must work without it.
function load<T extends object>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? { ...fallback, ...JSON.parse(stored) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not saving is acceptable. The setting still applies until the app closes.
  }
}

/** Shared app state, kept in signals so every page updates automatically. */
@Injectable({ providedIn: 'root' })
export class AppState {
  readonly settings = signal<Settings>(load(SETTINGS_KEY, DEFAULT_SETTINGS));

  /** True while the phone's sensors are steering the map instead of dragging. */
  readonly sensorsActive = signal(false);

  /** Where the camera points according to the sensors, or null when they are off. */
  readonly cameraPointing = signal<Horizontal | null>(null);

  /** Where the telescope points. Set by the sensors, or by dragging when they are off. */
  readonly pointing = signal<Horizontal>({ altDeg: 45, azDeg: 90 });

  /** How far the map is turned to match the phone. Zero when sensors are off. */
  readonly viewRollDeg = signal(0);

  /** True while a plate solve is running, which makes the reticle pulse. */
  readonly plateSolving = signal(false);

  readonly selectedTargetId = signal<string | null>(null);

  /** Fixed objects from the catalogue file. Empty until it has loaded. */
  private readonly catalog = signal<Target[]>([]);
  readonly selectedTarget = computed(() => this.targets().find((t) => t.id === this.selectedTargetId()) ?? null);

  /** Target ids the user has added to their session plan. */
  readonly planIds = signal<string[]>(load<{ ids: string[] }>(PLAN_KEY, { ids: [] }).ids);

  readonly alignment = signal<Alignment | null>(
    load<{ value: Alignment | null }>(ALIGNMENT_KEY, { value: null }).value,
  );

  private lastRotation?: { key: string; rotation: ReturnType<typeof skyRotation> };

  /** Current time, refreshed each minute, so positions keep up with the sky. */
  readonly now = signal(new Date());

  /** Everything the user can aim at, with planets and the Moon where they are now. */
  readonly targets = computed<Target[]>(() => {
    const { latitudeDeg, longitudeDeg } = this.settings();
    const solarSystem = SOLAR_SYSTEM_BODIES.map((body): Target => ({
      id: body,
      name: body === 'Moon' ? "Earth's Moon" : 'Planet',
      kind: body === 'Moon' ? 'Moon' : 'Planet',
      ...(body === 'Moon' ? { sizeArcmin: 31 } : {}),
      body,
      ...solarSystemPosition(body, this.now(), latitudeDeg, longitudeDeg),
    }));
    return [...solarSystem, ...this.catalog()];
  });

  /** Rotation from catalogue positions to the local sky, right now. */
  readonly skyRotation = computed(() => this.rotationAt(this.now()));

  /** Where the telescope points, in catalogue coordinates. */
  readonly pointingEquatorial = computed(() =>
    localToEquatorial(this.skyRotation(), horizontalVector(this.pointing())),
  );

  /** The darkness window and Moon, right now. */
  readonly conditions = computed(() => {
    const { latitudeDeg, longitudeDeg } = this.settings();
    return skyConditions(this.now(), latitudeDeg, longitudeDeg);
  });

  constructor() {
    setInterval(() => this.now.set(new Date()), 60_000);
    void this.loadCatalog('assets/data/targets.json');
    void this.loadCatalog('assets/data/openngc.json');
    effect(() => save(SETTINGS_KEY, this.settings()));
    effect(() => save(PLAN_KEY, { ids: this.planIds() }));
    effect(() => save(ALIGNMENT_KEY, { value: this.alignment() }));
    // CSS in global.scss turns the whole app red when this class is present.
    effect(() => document.documentElement.classList.toggle('night', this.settings().nightMode));
  }

  updateSettings(changes: Partial<Settings>): void {
    // A different mount puts the camera at a different angle to the telescope.
    const alignment = this.alignment();
    if (changes.mount && alignment && changes.mount !== alignment.mount) this.alignment.set(null);
    this.settings.update((current) => ({ ...current, ...changes }));
  }

  togglePlan(id: string): void {
    this.planIds.update((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  /** Where a target is right now from the user's location. */
  positionOf(target: Pick<Target, 'raDeg' | 'decDeg'>): Horizontal {
    return equatorialToHorizontal(this.skyRotation(), target.raDeg, target.decDeg);
  }

  /** Where a target will be at a given time from the user's location. */
  positionAt(target: Pick<Target, 'raDeg' | 'decDeg' | 'body'>, date: Date): Horizontal {
    // Planets and the Moon will have moved by then, unlike the fixed catalogue objects.
    const { latitudeDeg, longitudeDeg } = this.settings();
    const { raDeg, decDeg } = target.body ? solarSystemPosition(target.body, date, latitudeDeg, longitudeDeg) : target;
    return equatorialToHorizontal(this.rotationAt(date), raDeg, decDeg);
  }

  /** Each file loads on its own, so one failing still leaves the others usable. */
  private async loadCatalog(path: string): Promise<void> {
    try {
      const response = await fetch(path);
      const targets = (await response.json()) as Target[];
      this.catalog.update((current) => [...current, ...targets]);
    } catch {
      // Planets and the Moon still work without the catalogue files.
    }
  }

  /**
   * Remembers the last result, because working out positions for thousands of
   * targets at one time would otherwise repeat this slow calculation for each one.
   */
  private rotationAt(date: Date): ReturnType<typeof skyRotation> {
    const { latitudeDeg, longitudeDeg } = this.settings();
    const key = `${date.getTime()}/${latitudeDeg}/${longitudeDeg}`;
    if (this.lastRotation?.key !== key) {
      this.lastRotation = { key, rotation: skyRotation(date, latitudeDeg, longitudeDeg) };
    }
    return this.lastRotation.rotation;
  }
}
