import { Injectable, computed, effect, inject, signal } from '@angular/core';

import type { AlignmentSync } from './alignment/alignment-sync';
import type { Horizontal, Vector3 } from './astronomy/astronomy';
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
} from './astronomy/astronomy';
import { MINOR_PLANETS, minorPlanet } from './astronomy/minor-planets';
import { joinCaldwell } from './catalog/caldwell';
import { CatalogLoaderService } from './catalog/catalog-loader.service';
import { EXTRA_TARGETS } from './catalog/extra-targets';
import type { Target, TargetKind } from './catalog/targets';
import { PHASED_BODIES, SOLAR_SYSTEM_BODIES } from './catalog/targets';
import type { KitItem, KitKind, KitRecord, KitSelection } from './equipment/equipment';
import {
  DEFAULT_SELECTION,
  activeEquipment,
  equipmentPower,
  equipmentTrueField,
  isDefaultItem,
  kitFromRecords,
  newKitId,
  resolveSelection,
} from './equipment/equipment';
import { i18n } from './i18n/t';
import { LOCATION_BLOCKED, LOCATION_UPDATED, isPermissionDenied } from './platform/permission-help';
import { telescopeLimit } from './sky-conditions/sky-quality';
import type { CaptureMode } from './solver/camera';
import { LocalDb } from './storage/local-db';
import { settingsWithoutKit } from './storage/storage-migration';
import { contentOf } from './storage/sync-record';
import { SyncedStore } from './storage/synced-store';

export type { TelescopeType } from './equipment/equipment';
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
  /**
   * Which telescope, eyepiece, Barlow and filter are in use on this device, picked in the
   * eyepiece view. The kit itself is in the database (AppState.kit), shared by the devices.
   */
  kitSelection: KitSelection;
  nightMode: boolean;
  /** How large text is shown. */
  textSize: TextSize;
  /** Plate solve automatically whenever sensors are on and the phone is still. */
  autoSolve: boolean;
  /** Show where the view points in right ascension and declination, on the sky map. */
  showEquatorial: boolean;
  /** Keep the phone's screen on while the app is open. */
  keepScreenOn: boolean;
  /** A Bluetooth camera shutter remote aligns on the Align page, and plate solves on the sky map. */
  shutterAligns: boolean;
  /** Show a toast for successful plate solves too, with the stars matched. For debugging. */
  solveSuccessToast: boolean;
  /** A soft camera shutter sound whenever the sky map plate solves. */
  solveSound: boolean;
  /** Send every sky map plate solve, with its frame, to the PC running the dev server. For debugging. */
  sendSolves: boolean;
  /** How the sky map takes pictures: normal, or forced to one long exposure or a stack. For debugging. */
  captureMode: CaptureMode;
  /** How dark the observer's sky is, on the Bortle scale from 1 (darkest) to 9. */
  bortle: number;
  /** Set the Bortle class from the location, with the light pollution atlas: see sky-brightness.service.ts. */
  bortleAuto: boolean;
  /**
   * The app's language: 'auto' follows the phone's, or a language's code, such as 'es', chosen
   * in Settings. See core/i18n/languages.ts.
   */
  language: string;
  /** The faintest stars the eyepiece view shows, or null to work it out from the sky. */
  eyepieceStarLimit: number | null;
  /**
   * How the camera's real field of view compares with the estimate from its published
   * specs. Learnt from the first successful plate solve, so later solves start from it.
   */
  cameraFocalFactor: number;
  /** Sync the log, lists and kit with the linked phone, when it has this on too. */
  linkSync: boolean;
}

/** How an alignment measured the camera's direction. Plate solving is the accurate one. */
export type AlignmentMethod = 'plate-solve' | 'sensors' | 'simulated';

/**
 * A completed alignment. It stays valid while the phone stays fixed on the telescope. The
 * phone's camera always looks straight at the sky, with no mirror or add-on lens.
 */
export interface Alignment {
  starId: string;
  alignedAt: string; // ISO date
  offset: Vector3; // The telescope's direction in the camera's axes
  /** Missing on alignments saved before plate solving existed, which used the sensors. */
  method?: AlignmentMethod;
  /** Where the telescope pointed when aligned. Missing on alignments saved before syncs. */
  position?: Horizontal;
  /** Corrections made since, each with a target centred in the eyepiece: see alignment-sync.ts. */
  syncs?: AlignmentSync[];
}

// Starts with no location of its own, and a common beginner telescope and eyepiece.
const DEFAULT_SETTINGS: Settings = {
  // A neutral place on the equator, used only until the user sets their location.
  latitudeDeg: 0,
  longitudeDeg: 0,
  locationSet: false,
  kitSelection: DEFAULT_SELECTION,
  nightMode: false,
  // Larger than usual by default, because many observers are past forty.
  textSize: 'large',
  autoSolve: true,
  solveSuccessToast: false,
  // Off by default: a sound at night shouldn't come as a surprise.
  solveSound: false,
  // Off by default: it only works with the dev server, and sends large frames.
  sendSolves: false,
  captureMode: 'normal',
  showEquatorial: false,
  // On by default: at the telescope the phone sits untouched, and a sleeping screen stops the sensors.
  keepScreenOn: true,
  // Off by default: a remote's Enter or volume key would otherwise act on the Align page unasked.
  shutterAligns: false,
  // The middle of the scale, a suburban sky, until the user sets their own.
  bortle: 5,
  // On by default: the atlas knows the sky better than a guess, and choosing a class turns it off.
  bortleAuto: true,
  // The phone's language, where the app has it; English otherwise.
  language: 'auto',
  eyepieceStarLimit: null,
  cameraFocalFactor: 1,
  // Off by default: a phone linked for one night may belong to someone else.
  linkSync: false,
};

const SETTINGS_KEY = 'astroturbomaxisolver.settings';
/** How often the live sky's time moves on. The sky turns about 0.004° in a second. */
const SKY_TIME_STEP_MS = 1000;
const ALIGNMENT_KEY = 'astroturbomaxisolver.alignment';

/**
 * A saved alignment, unless it was made with the mirror or add-on lens mounts the app once
 * offered: the camera sat differently then, so it no longer fits.
 */
function directAlignment(saved: unknown): Alignment | null {
  if (!saved || typeof saved !== 'object') return null;
  const { mount, ...alignment } = saved as Alignment & { mount?: string };
  return mount === undefined || mount === 'direct' ? alignment : null;
}

// Browser storage can be blocked or cleared, so the app must work without it.
function load<T extends object>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? { ...fallback, ...JSON.parse(stored) } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Loads the settings. Earlier versions kept the kit in them too: it stays there until the
 * database has taken it (see LocalDb), and AppState then drops it.
 */
function loadSettings(): Settings {
  return load(SETTINGS_KEY, DEFAULT_SETTINGS);
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
  private readonly localDb = inject(LocalDb);

  readonly settings = signal<Settings>(loadSettings());

  /** The user's telescopes, eyepieces, Barlows and filters, one database record each. */
  private readonly kitStore = new SyncedStore<KitRecord>(
    this.localDb,
    (db) => db.kit,
    (old) => old.kit,
  );

  /**
   * Resolves once the kit is read. The app waits for it before it starts. When the kit has
   * just moved out of the settings, the selection takes the kit's new ids.
   */
  readonly kitReady = this.kitStore.load().then(() => {
    const moved = this.localDb.movedKitSelection;
    if (moved) this.settings.update((settings) => ({ ...settingsWithoutKit(settings), kitSelection: moved }));
  });

  /** The kit, in the order it was added, with a built-in telescope and eyepiece until the user adds one. */
  readonly kit = computed(() =>
    kitFromRecords([...this.kitStore.records()].sort((a, b) => a.createdAt - b.createdAt).map(contentOf)),
  );

  /** The ids of the items in use, each one sure to be in the kit. */
  readonly equipmentIds = computed(() => resolveSelection(this.kit(), this.settings().kitSelection));
  /** The telescope, eyepiece, and maybe Barlow and filter in use. */
  readonly equipment = computed(() => activeEquipment(this.kit(), this.settings().kitSelection));
  /** The magnification in use. */
  readonly power = computed(() => equipmentPower(this.equipment()));
  /** The width of sky the eyepiece shows, in degrees. */
  readonly trueField = computed(() => equipmentTrueField(this.equipment()));

  /**
   * True while the phone's sensors are steering the map instead of dragging. On a screen
   * phone linked to a finder phone, the finder's sensors steer it, and this is true too.
   */
  readonly sensorsActive = signal(false);

  /**
   * True on a screen phone while a finder phone on the telescope steers the map and plate
   * solves for it (RemoteService). This phone's own sensors and camera then stay off.
   */
  readonly remoteFinder = signal(false);

  /**
   * True on a finder phone while linked to a screen phone. The sky map then shows no
   * buttons and takes no touches, so nothing done by accident changes what the screen shows.
   */
  readonly finderMode = signal(false);

  /** Where the camera points according to the sensors, or null when they are off. */
  readonly cameraPointing = signal<Horizontal | null>(null);

  /** Where the telescope points. Set by the sensors, or by dragging when they are off. */
  readonly pointing = signal<Horizontal>({ altDeg: 45, azDeg: 90 });

  /** How far the map is turned to match the phone. Zero when sensors are off. */
  readonly viewRollDeg = signal(0);

  /** True while a plate solve is running, which makes the reticle pulse. */
  readonly plateSolving = signal(false);

  readonly selectedTargetId = signal<string | null>(null);

  /** The catalogue files, which load in the background so the map comes first: see CatalogLoaderService. */
  private readonly loader = inject(CatalogLoaderService);
  /** Fixed objects from the catalogue files. It grows as they load. */
  private readonly catalog = this.loader.catalog;
  /** The Caldwell catalogue, which adds its numbers to NGC and IC objects. Null until loaded. */
  private readonly caldwell = this.loader.caldwell;
  /** Resolves once every catalogue file is in, not just the brightest objects. */
  readonly catalogComplete = this.loader.whenComplete;

  /**
   * The catalogue objects with their Caldwell numbers, plus the Caldwell objects that
   * have no NGC or IC number. Kept apart from targets, which changes every minute, so
   * this join only runs again when a file finishes loading.
   */
  private readonly catalogWithCaldwell = computed(() => {
    const caldwell = this.caldwell();
    const base = caldwell ? [...joinCaldwell(this.catalog(), caldwell), ...caldwell.extraTargets] : this.catalog();
    // Plus the few objects no catalogue file has, such as NGC 206.
    return [...base, ...EXTRA_TARGETS];
  });
  readonly selectedTarget = computed(() => this.targets().find((t) => t.id === this.selectedTargetId()) ?? null);

  readonly alignment = signal<Alignment | null>(
    directAlignment(load<{ value: unknown }>(ALIGNMENT_KEY, { value: null }).value),
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
  /**
   * Whether the sky map is the tab on show. The map and the live plate solver stay alive
   * behind the other tabs, and rest while it is hidden: see the sky page and the solver.
   */
  readonly mapOnShow = signal(true);

  /** The real time, refreshed each minute and each second. */
  private readonly realMinute = signal(new Date());
  private readonly realSecond = signal(new Date());
  /** The real time, refreshed each minute, even while planning. For the observing log. */
  readonly realNow = this.realMinute.asReadonly();

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
  readonly skyStarLimit = computed(() => telescopeLimit(this.settings().bortle, this.equipment().telescopeApertureMm));

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
    effect(() => save(SETTINGS_KEY, this.settings()));
    effect(() => save(ALIGNMENT_KEY, { value: this.alignment() }));
    // CSS in global.scss turns the whole app red when this class is present.
    effect(() => document.documentElement.classList.toggle('night', this.settings().nightMode));
    // Page styles read the text size through this variable. The sky map reads textScale.
    effect(() => document.documentElement.style.setProperty('--af-scale', String(this.textScale())));
  }

  updateSettings(changes: Partial<Settings>): void {
    this.settings.update((current) => ({ ...current, ...changes }));
  }

  /**
   * Saves the settings at once, rather than when the saving effect next runs: for a change
   * that reloads the app straight after, such as the language.
   */
  saveSettingsNow(): void {
    save(SETTINGS_KEY, this.settings());
  }

  /**
   * Sets the location from the phone's GPS. Resolves with a short message for the user,
   * since it can take a while, be refused, or be unavailable.
   */
  locateWithGps(): Promise<string> {
    if (!('geolocation' in navigator)) return Promise.resolve(i18n('location.notAvailable'));
    return new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          // Two decimals is about a kilometre, plenty for the sky, and keeps the exact place private.
          this.updateSettings({
            latitudeDeg: Number(coords.latitude.toFixed(2)),
            longitudeDeg: Number(coords.longitude.toFixed(2)),
            locationSet: true,
          });
          resolve(LOCATION_UPDATED);
        },
        // Refused is told apart from no signal: only the phone's settings can undo a refusal.
        (error) => resolve(isPermissionDenied(error) ? LOCATION_BLOCKED : i18n('location.unavailable')),
        { timeout: 15_000 },
      ),
    );
  }

  /** Picks what is in use: a telescope, an eyepiece, a Barlow or none, a filter or none. */
  selectKit(changes: Partial<KitSelection>): void {
    this.updateSettings({ kitSelection: { ...this.settings().kitSelection, ...changes } });
  }

  /**
   * Adds an item to the kit, or changes the one with its id. A built-in default, once
   * edited, becomes the user's own item. Adding another item next to a built-in default
   * keeps the default too, as the user's own, so it doesn't vanish from the list.
   */
  saveKitItem(kind: KitKind, item: KitItem): void {
    const shown = this.kit()[kind] as KitItem[];
    const onlyDefault = shown.length === 1 && isDefaultItem(shown[0].id);
    if (onlyDefault && shown[0].id !== item.id) this.makeOwn(kind, shown[0]);
    if (isDefaultItem(item.id)) this.makeOwn(kind, item);
    else this.kitStore.save([{ ...item, kind }]);
  }

  /** Saves a built-in default as the user's own item, with its own id, still in use if it was. */
  private makeOwn(kind: KitKind, item: KitItem): void {
    const id = newKitId();
    this.kitStore.save([{ ...item, id, kind }]);
    const selection = this.settings().kitSelection;
    if (selection.telescopeId === item.id) this.selectKit({ telescopeId: id });
    if (selection.eyepieceId === item.id) this.selectKit({ eyepieceId: id });
  }

  /**
   * Removes an item from the kit. There is always a telescope and an eyepiece, so the last
   * of either stays. One in use is replaced by the first left, or by none for a Barlow or
   * filter. Returns whether it was removed.
   */
  removeKitItem(kind: KitKind, id: string): boolean {
    const left = (this.kit()[kind] as KitItem[]).filter((i) => i.id !== id);
    if (left.length === 0 && (kind === 'telescopes' || kind === 'eyepieces')) return false;
    const selection = { ...this.settings().kitSelection };
    if (kind === 'telescopes' && selection.telescopeId === id) selection.telescopeId = left[0].id;
    if (kind === 'eyepieces' && selection.eyepieceId === id) selection.eyepieceId = left[0].id;
    if (kind === 'modifiers' && selection.modifierId === id) selection.modifierId = null;
    if (kind === 'filters' && selection.filterId === id) selection.filterId = null;
    this.kitStore.remove([id]);
    this.updateSettings({ kitSelection: selection });
    return true;
  }

  /** Puts a removed item back, and what was in use before, for Undo. */
  restoreKitItem(kind: KitKind, item: KitItem, selection: KitSelection): void {
    this.kitStore.save([{ ...item, kind }]);
    this.updateSettings({ kitSelection: selection });
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
