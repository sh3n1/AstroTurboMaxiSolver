import { Injectable, computed, inject, untracked } from '@angular/core';

import { AppState } from '../app-state.service';
import type { Matrix3 } from '../astronomy/astronomy';
import { equatorialToHorizontal, skyRotation, sunAltitudeDeg } from '../astronomy/astronomy';
import type { Target } from '../catalog/targets';
import type { BestTonight } from '../lists/list-order';
import { bestOfNight } from '../lists/list-order';

import { nightWindow } from './tonight';

/**
 * How finely the night is checked. Coarser than the details' chart, since a list may ask
 * for thousands of targets, and a best time to the nearest twenty minutes is enough.
 */
const STEP_MINUTES = 20;

/** The checks of one night: their times, the sky's turn at each, and whether the Sun is down. */
interface NightChecks {
  times: Date[];
  rotations: Matrix3[];
  dark: boolean[];
  /** Each target's best moment, kept once worked out. */
  best: Map<string, BestTonight | null>;
}

/**
 * Each target's best moment tonight, for ordering and filtering the lists. Worked out
 * once per target and night, and kept, because the lists ask again every minute.
 */
@Injectable({ providedIn: 'root' })
export class TonightService {
  private readonly state = inject(AppState);

  /** Names the night and the place. The checks below are only redone when it changes. */
  private readonly nightKey = computed(() => {
    const { latitudeDeg, longitudeDeg } = this.state.settings();
    return `${nightWindow(this.state.now()).start.getTime()}|${latitudeDeg}|${longitudeDeg}`;
  });

  private readonly checks = computed<NightChecks>(() => {
    this.nightKey();
    // Read without following, so a new minute of the same night keeps what is worked out.
    const { start, end } = nightWindow(untracked(() => this.state.now()));
    const { latitudeDeg, longitudeDeg } = untracked(() => this.state.settings());
    const times: Date[] = [];
    for (let t = start.getTime(); t <= end.getTime(); t += STEP_MINUTES * 60_000) times.push(new Date(t));
    return {
      times,
      rotations: times.map((time) => skyRotation(time, latitudeDeg, longitudeDeg)),
      dark: times.map((time) => sunAltitudeDeg(time, latitudeDeg, longitudeDeg) <= 0),
      best: new Map(),
    };
  });

  /** When the target is highest tonight while the Sun is down, or null if it stays down. */
  best(target: Pick<Target, 'id' | 'raDeg' | 'decDeg' | 'body'>): BestTonight | null {
    const night = this.checks();
    let best = night.best.get(target.id);
    if (best === undefined) {
      const altitudes = night.times.map((time, i) =>
        // Planets and the Moon move through the night. The rest only turn with the sky.
        target.body
          ? this.state.positionAt(target, time).altDeg
          : equatorialToHorizontal(night.rotations[i], target.raDeg, target.decDeg).altDeg,
      );
      best = bestOfNight(night.times, altitudes, night.dark);
      night.best.set(target.id, best);
    }
    return best;
  }
}
