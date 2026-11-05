import { Injectable, computed, effect, signal } from '@angular/core';

import type { Horizontal } from './astronomy';
import { equatorialToHorizontal, localSiderealDeg } from './astronomy';
import type { Target } from './targets';
import { TARGETS } from './targets';

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
};

const SETTINGS_KEY = 'astrofinder.settings';
const PLAN_KEY = 'astrofinder.plan';

// Browser storage can be blocked or cleared, so the app must work without it.
function load<T>(key: string, fallback: T): T {
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

  /** Where the telescope points. Set by dragging until real sensors are connected. */
  readonly pointing = signal<Horizontal>({ altDeg: 45, azDeg: 90 });

  readonly selectedTargetId = signal<string | null>(null);
  readonly selectedTarget = computed(() => TARGETS.find((t) => t.id === this.selectedTargetId()) ?? null);

  /** Target ids the user has added to their session plan. */
  readonly planIds = signal<string[]>(load<{ ids: string[] }>(PLAN_KEY, { ids: [] }).ids);

  /** Current time, refreshed each minute, so positions keep up with the sky. */
  readonly now = signal(new Date());

  constructor() {
    setInterval(() => this.now.set(new Date()), 60_000);
    effect(() => save(SETTINGS_KEY, this.settings()));
    effect(() => save(PLAN_KEY, { ids: this.planIds() }));
    // CSS in global.scss turns the whole app red when this class is present.
    effect(() => document.documentElement.classList.toggle('night', this.settings().nightMode));
  }

  updateSettings(changes: Partial<Settings>): void {
    this.settings.update((current) => ({ ...current, ...changes }));
  }

  togglePlan(id: string): void {
    this.planIds.update((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  /** Where a target is right now from the user's location. */
  positionOf(target: Pick<Target, 'raDeg' | 'decDeg'>): Horizontal {
    const { latitudeDeg, longitudeDeg } = this.settings();
    return equatorialToHorizontal(target.raDeg, target.decDeg, latitudeDeg, localSiderealDeg(this.now(), longitudeDeg));
  }
}
