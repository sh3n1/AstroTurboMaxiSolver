import { Injectable, computed, effect, signal } from '@angular/core';

import type { Horizontal, Vector3 } from './astronomy';
import {
  equatorialToHorizontal,
  horizontalVector,
  hoursUntilRise,
  litOnRight,
  nextBodyRise,
  localToEquatorial,
  skyConditions,
  skyRotation,
  solarSystemPosition,
  sunPosition,
} from './astronomy';
import type { CaldwellData } from './caldwell';
import { joinCaldwell } from './caldwell';
import { constellationTargets } from './constellations';
import type { ConstellationRow } from './constellations';
import type { DoubleRow } from './double-stars';
import type { Equipment, TelescopeType } from './equipment';
import { EQUIPMENT_KEYS, rememberEquipment } from './equipment';
import { MINOR_PLANETS, minorPlanet } from './minor-planets';
import { telescopeLimit } from './sky-quality';
import type { Target, TargetKind } from './targets';
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
  /** Keep the phone's screen on while the app is open. */
  keepScreenOn: boolean;
  /** A Bluetooth camera shutter remote presses the Align page's big round button. */
  shutterAligns: boolean;
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
  // On by default: at the telescope the phone sits untouched, and a sleeping screen stops the sensors.
  keepScreenOn: true,
  // Off by default: a remote's Enter or volume key would otherwise act on the Align page unasked.
  shutterAligns: false,
  // The middle of the scale, a suburban sky, until the user sets their own.
  bortle: 5,
  eyepieceStarLimit: null,
  recentEquipment: [],
  cameraFocalFactor: 1,
};

const SETTINGS_KEY = 'astrofinder.settings';
/** How often the live sky's time moves on. The sky turns about 0.004° in a second. */
const SKY_TIME_STEP_MS = 1000;
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

/** What kind of body each moving target is, as shown in lists and details. */
function bodyKind(body: string): TargetKind {
  if (body === 'Moon') return 'Moon';
  if (body === 'Pluto') return 'Dwarf planet';
  return minorPlanet(body)?.kind ?? 'Planet';
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

  /**
   * The time chosen for planning, or null to follow the real time. While set, the sky
   * map, the lists and the details all show the sky at that time, and it stays still.
   * Never saved, so the app always opens on the real sky.
   */
  readonly plannedTime = signal<Date | null>(null);
  /** Whether the app shows a chosen time instead of the real one. */
  readonly planning = computed(() => this.plannedTime() !== null);
  /** Whether the time control is open for changing the time, on whichever tab. */
  readonly timeControlOpen = signal(false);

  /** The real time, refreshed each minute and each second. */
  private readonly realMinute = signal(new Date());
  private readonly realSecond = signal(new Date());

  /**
   * The time the app shows, refreshed each minute, so positions keep up with the sky:
   * the real time, or the time chosen for planning.
   */
  readonly now = computed(() => this.plannedTime() ?? this.realMinute());

  /** Everything the user can aim at, with planets and the Moon where they are now. */
  readonly targets = computed<Target[]>(() => {
    const { latitudeDeg, longitudeDeg } = this.settings();
    const sun = this.sunEquatorial();
    const bodies = [...SOLAR_SYSTEM_BODIES, ...MINOR_PLANETS.map((planet) => planet.name)];
    const solarSystem = bodies.map((body): Target => {
      const { raDeg, decDeg, mag, litFraction } = solarSystemPosition(body, this.now(), latitudeDeg, longitudeDeg);
      const kind = bodyKind(body);
      return {
        id: body,
        name: body === 'Moon' ? "Earth's Moon" : kind,
        kind,
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

  /**
   * The time the live sky is shown for, updated every second. The sky turns a quarter of
   * a degree a minute, so the once-a-minute clock above would make it jump by that much,
   * half the app's accuracy target. Lists and the sky conditions don't need this, and
   * use the minute clock to save work. The sky map goes further and uses the exact time
   * of each frame it draws, so even a zoomed-in eyepiece view moves smoothly.
   */
  readonly skyTime = computed(() => this.plannedTime() ?? this.realSecond());

  /** Rotation from catalogue positions to the local sky, at the time the app shows. */
  readonly skyRotation = computed(() => this.rotationAt(this.skyTime()));

  /**
   * Rotation to the real sky, right now, even while planning. The camera always sees
   * the real sky, so plate solving and the sensor tests use this one.
   */
  readonly realSkyRotation = computed(() => this.rotationAt(this.realSecond()));

  /** The exact time to draw a frame of the sky for: the chosen time, or this very moment. */
  frameTime(): Date {
    return this.plannedTime() ?? new Date();
  }

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
    setInterval(() => this.realMinute.set(new Date()), 60_000);
    setInterval(() => this.realSecond.set(new Date()), SKY_TIME_STEP_MS);
    // Double stars go onto the named stars too, so they wait for them.
    void this.loadCatalog('assets/data/targets.json').then(() => this.loadDoubles());
    void this.loadCatalog('assets/data/openngc.json');
    void this.loadCaldwell();
    void this.loadConstellations();
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

  /** Where a target is right now from the user's location, to the second. */
  positionOf(target: Pick<Target, 'raDeg' | 'decDeg'>): Horizontal {
    return equatorialToHorizontal(this.skyRotation(), target.raDeg, target.decDeg);
  }

  /**
   * When a target below the horizon next rises, from a given time, or null if it won't
   * within a day. Fixed objects either rise within a day or never do from here.
   */
  nextRise(target: Pick<Target, 'raDeg' | 'decDeg' | 'body'>, from: Date): Date | null {
    const { latitudeDeg, longitudeDeg } = this.settings();
    if (target.body) return nextBodyRise(target.body, from, latitudeDeg, longitudeDeg);
    const hours = hoursUntilRise(this.positionAt(target, from), latitudeDeg);
    return hours === null ? null : new Date(from.getTime() + hours * 3_600_000);
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
   * Adds the double stars. Those whose main star is a named star, such as Albireo, are
   * added to that star, so it stays one target. Without them, every object still works.
   */
  private async loadDoubles(): Promise<void> {
    try {
      const response = await fetch('assets/data/doubles.json');
      const rows = (await response.json()) as DoubleRow[];
      const toStar = new Map(rows.filter((row) => row.starId).map((row) => [row.starId, row]));
      const own = rows.filter((row): row is DoubleRow & Target => !row.starId);
      this.catalog.update((current) => [
        ...current.map((target) => {
          const row = toStar.get(target.id);
          if (!row || target.kind !== 'Star') return target;
          const aliases = [target.aliases, row.aliases].filter(Boolean).join(' ');
          return { ...target, aliases, double: row.double };
        }),
        ...own,
      ]);
    } catch {
      // Everything else works without the double stars.
    }
  }

  /** Adds the constellations as targets. Without them, every object still works. */
  private async loadConstellations(): Promise<void> {
    try {
      const response = await fetch('assets/data/constellations.json');
      const targets = constellationTargets((await response.json()) as ConstellationRow[]);
      this.catalog.update((current) => [...current, ...targets]);
    } catch {
      // Searching for objects works the same without them.
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
  rotationAt(date: Date): ReturnType<typeof skyRotation> {
    const { latitudeDeg, longitudeDeg } = this.settings();
    const key = `${date.getTime()}/${latitudeDeg}/${longitudeDeg}`;
    if (this.lastRotation?.key !== key) {
      this.lastRotation = { key, rotation: skyRotation(date, latitudeDeg, longitudeDeg) };
    }
    return this.lastRotation.rotation;
  }
}
