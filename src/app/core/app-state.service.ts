import { Injectable, computed, effect, signal } from '@angular/core';

import type { Horizontal, Vector3 } from './astronomy';
import {
  equatorialToHorizontal,
  horizontalVector,
  litOnRight,
  localToEquatorial,
  skyConditions,
  skyRotation,
  solarSystemPosition,
  sunPosition,
} from './astronomy';
import type { CaldwellData } from './caldwell';
import { joinCaldwell } from './caldwell';
import type { Equipment, TelescopeType } from './equipment';
import { EQUIPMENT_KEYS, rememberEquipment } from './equipment';
import { telescopeLimit } from './sky-quality';
import type { Target } from './targets';
import { PHASED_BODIES, SOLAR_SYSTEM_BODIES } from './targets';

export type { TelescopeType } from './equipment';
export type MountType = 'direct' | 'clip-on' | 'mirror';
export type TextSize = 'standard' | 'large' | 'extra-large';

/** How much larger than standard each text size is. */
export const TEXT_SCALE: Record<TextSize, number> = { standard: 1, large: 1.2, 'extra-large': 1.45 };

/** Everything the user configures. Saved on this device. */
export interface Settings {
  latitudeDeg: number;
  longitudeDeg: number; // Positive to the east
  /**
   * Whether the user has set their location, by GPS or by typing it. Until then the
   * sky is worked out for a neutral place, and the sky map asks for the location.
   */
  locationSet: boolean;
  telescopeType: TelescopeType;
  telescopeFocalMm: number;
  telescopeApertureMm: number;
  eyepieceFocalMm: number;
  eyepieceFieldDeg: number; // The eyepiece's apparent field of view
  mount: MountType;
  nightMode: boolean;
  /** How large text is shown. */
  textSize: TextSize;
  /** Plate solve automatically whenever sensors are on and the phone is still. */
  autoSolve: boolean;
  /** Show where the view points in right ascension and declination, on the sky map. */
  showEquatorial: boolean;
  /** Show a toast for successful plate solves too, with the stars matched. For debugging. */
  solveSuccessToast: boolean;
  /** How dark the observer's sky is, on the Bortle scale from 1 (darkest) to 9. */
  bortle: number;
  /** The faintest stars the eyepiece view shows, or null to work it out from the sky. */
  eyepieceStarLimit: number | null;
  /** The latest telescope and eyepiece combinations, newest first. */
  recentEquipment: Equipment[];
  /**
   * How the camera's real field of view compares with the estimate from its published
   * specs. Learnt from the first successful plate solve, so later solves start from it.
   */
  cameraFocalFactor: number;
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

// Starts with no location of its own, and a common beginner telescope and eyepiece.
const DEFAULT_SETTINGS: Settings = {
  // A neutral place on the equator, used only until the user sets their location.
  latitudeDeg: 0,
  longitudeDeg: 0,
  locationSet: false,
  telescopeType: 'newtonian',
  telescopeFocalMm: 650,
  telescopeApertureMm: 130,
  eyepieceFocalMm: 25,
  eyepieceFieldDeg: 52,
  mount: 'direct',
  nightMode: false,
  // Larger than usual by default, because many observers are past forty.
  textSize: 'large',
  autoSolve: true,
  solveSuccessToast: false,
  showEquatorial: false,
  // The middle of the scale, a suburban sky, until the user sets their own.
  bortle: 5,
  eyepieceStarLimit: null,
  recentEquipment: [],
  cameraFocalFactor: 1,
};

const SETTINGS_KEY = 'astrofinder.settings';
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

  /** Fixed objects from the catalogue files. Empty until they have loaded. */
  private readonly catalog = signal<Target[]>([]);

  /** The Caldwell catalogue, which adds its numbers to NGC and IC objects. Null until loaded. */
  private readonly caldwell = signal<CaldwellData | null>(null);

  /**
   * The catalogue objects with their Caldwell numbers, plus the Caldwell objects that
   * have no NGC or IC number. Kept apart from targets, which changes every minute, so
   * this join only runs again when a file finishes loading.
   */
  private readonly catalogWithCaldwell = computed(() => {
    const caldwell = this.caldwell();
    return caldwell ? [...joinCaldwell(this.catalog(), caldwell), ...caldwell.extraTargets] : this.catalog();
  });
  readonly selectedTarget = computed(() => this.targets().find((t) => t.id === this.selectedTargetId()) ?? null);

  readonly alignment = signal<Alignment | null>(
    load<{ value: Alignment | null }>(ALIGNMENT_KEY, { value: null }).value,
  );

  private lastRotation?: { key: string; rotation: ReturnType<typeof skyRotation> };

  /** Current time, refreshed each minute, so positions keep up with the sky. */
  readonly now = signal(new Date());

  /** Everything the user can aim at, with planets and the Moon where they are now. */
  readonly targets = computed<Target[]>(() => {
    const { latitudeDeg, longitudeDeg } = this.settings();
    const sun = this.sunEquatorial();
    const solarSystem = SOLAR_SYSTEM_BODIES.map((body): Target => {
      const { raDeg, decDeg, mag, litFraction } = solarSystemPosition(body, this.now(), latitudeDeg, longitudeDeg);
      return {
        id: body,
        name: body === 'Moon' ? "Earth's Moon" : 'Planet',
        kind: body === 'Moon' ? 'Moon' : 'Planet',
        ...(body === 'Moon' ? { sizeArcmin: 31 } : {}),
        body,
        raDeg,
        decDeg,
        mag,
        ...(PHASED_BODIES.includes(body)
          ? { phase: { litFraction, litOnRight: litOnRight(raDeg, sun.raDeg, latitudeDeg) } }
          : {}),
      };
    });
    return [...solarSystem, ...this.catalogWithCaldwell()];
  });

  /** Where the Sun is now, in catalogue coordinates. Phases are lit from its side. */
  readonly sunEquatorial = computed(() => {
    const { latitudeDeg, longitudeDeg } = this.settings();
    return sunPosition(this.now(), latitudeDeg, longitudeDeg);
  });

  /** Rotation from catalogue positions to the local sky, right now. */
  readonly skyRotation = computed(() => this.rotationAt(this.now()));

  /** Where the telescope points, in catalogue coordinates. */
  readonly pointingEquatorial = computed(() =>
    localToEquatorial(this.skyRotation(), horizontalVector(this.pointing())),
  );

  readonly textScale = computed(() => TEXT_SCALE[this.settings().textSize] ?? TEXT_SCALE.large);

  /** The faintest stars the user's sky and telescope should show, as a starting point. */
  readonly skyStarLimit = computed(() => telescopeLimit(this.settings().bortle, this.settings().telescopeApertureMm));

  /** The faintest stars the eyepiece view shows. */
  readonly starLimit = computed(() => this.settings().eyepieceStarLimit ?? this.skyStarLimit());

  /** The darkness window and Moon, right now. */
  readonly conditions = computed(() => {
    const { latitudeDeg, longitudeDeg } = this.settings();
    return skyConditions(this.now(), latitudeDeg, longitudeDeg);
  });

  constructor() {
    setInterval(() => this.now.set(new Date()), 60_000);
    void this.loadCatalog('assets/data/targets.json');
    void this.loadCatalog('assets/data/openngc.json');
    void this.loadCaldwell();
    effect(() => save(SETTINGS_KEY, this.settings()));
    effect(() => save(ALIGNMENT_KEY, { value: this.alignment() }));
    // CSS in global.scss turns the whole app red when this class is present.
    effect(() => document.documentElement.classList.toggle('night', this.settings().nightMode));
    // Page styles read the text size through this variable. The sky map reads textScale.
    effect(() => document.documentElement.style.setProperty('--af-scale', String(this.textScale())));
  }

  updateSettings(changes: Partial<Settings>): void {
    // A different mount puts the camera at a different angle to the telescope.
    const alignment = this.alignment();
    if (changes.mount && alignment && changes.mount !== alignment.mount) this.alignment.set(null);
    this.settings.update((current) => {
      const next = { ...current, ...changes };
      // Remember both the old and new combinations, so switching back is one tap.
      if (EQUIPMENT_KEYS.some((key) => key in changes && changes[key] !== current[key])) {
        next.recentEquipment = rememberEquipment(rememberEquipment(current.recentEquipment, current), next);
      }
      return next;
    });
  }

  /**
   * Sets the location from the phone's GPS. Resolves with a short message for the user,
   * since it can take a while, be refused, or be unavailable.
   */
  locateWithGps(): Promise<string> {
    if (!('geolocation' in navigator)) return Promise.resolve('Not available on this device');
    return new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          // Two decimals is about a kilometre, plenty for the sky, and keeps the exact place private.
          this.updateSettings({
            latitudeDeg: Number(coords.latitude.toFixed(2)),
            longitudeDeg: Number(coords.longitude.toFixed(2)),
            locationSet: true,
          });
          resolve('Location updated');
        },
        () => resolve('Location unavailable'),
        { timeout: 15_000 },
      ),
    );
  }

  applyEquipment(equipment: Equipment): void {
    this.updateSettings({ ...equipment });
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

  /** Loads the Caldwell list. Without it, everything still works, just without Caldwell numbers. */
  private async loadCaldwell(): Promise<void> {
    try {
      const response = await fetch('assets/data/caldwell.json');
      this.caldwell.set((await response.json()) as CaldwellData);
    } catch {
      // Search by NGC and IC numbers still finds every Caldwell object.
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
