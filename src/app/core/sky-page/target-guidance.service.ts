import { Injectable, computed, inject } from '@angular/core';

import { AppState } from '../app-state.service';
import { azimuthChangeDeg, separationDeg } from '../astronomy/astronomy';

/**
 * How to get from where the telescope points to the selected target: how far it is, whether
 * it is there already, and which way to move. Shared by the sky map, which draws the
 * guidance, and the target's bar, which says it in words.
 */
@Injectable({ providedIn: 'root' })
export class TargetGuidanceService {
  private readonly state = inject(AppState);

  /** The angle from where the telescope points to the selected target, or 0 with none. */
  readonly distanceDeg = computed(() => {
    const target = this.state.selectedTarget();
    return target ? separationDeg(this.state.pointing(), this.state.positionOf(target)) : 0;
  });

  readonly belowHorizon = computed(() => {
    const target = this.state.selectedTarget();
    return !!target && this.state.positionOf(target).altDeg < 0;
  });

  /** On target means it would be in the eyepiece, which is what the user cares about. */
  readonly isOnTarget = computed(
    () => !!this.state.selectedTarget() && this.distanceDeg() < this.state.trueField() / 2,
  );

  /** Which way to move the telescope, in the terms an alt-az mount uses. */
  readonly directions = computed(() => {
    const target = this.state.selectedTarget();
    if (!target) return '';
    if (this.isOnTarget()) return 'On target';
    const position = this.state.positionOf(target);
    const pointing = this.state.pointing();
    const altChange = position.altDeg - pointing.altDeg;
    const azChange = azimuthChangeDeg(pointing.azDeg, position.azDeg);
    const vertical = `${altChange >= 0 ? 'Up' : 'Down'} ${Math.abs(altChange).toFixed(0)}°`;
    const horizontal = `${azChange >= 0 ? 'Right' : 'Left'} ${Math.abs(azChange).toFixed(0)}°`;
    return `${vertical} · ${horizontal}`;
  });
}
