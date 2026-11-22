import { Injectable, inject } from '@angular/core';

import { newAlignment, offsetAngleDeg, suggestAlignmentStars } from '../alignment/alignment';
import { AppState } from '../app-state.service';
import { compassShort } from '../astronomy/astronomy';
import type { Target } from '../catalog/targets';
import { num, t } from '../i18n/t';
import { rearCameraDirection } from '../sensors/attitude';
import { cameraPointing } from '../sensors/device-orientation';
import { alignmentStarLimit } from '../sky-conditions/sky-quality';
import { LiveSolverService } from '../solver/live-solver.service';

/** How many of the easiest stars the puck offers, as the app's Align page. */
const SUGGESTED_STARS = 4;

/**
 * `{ t: 'alignStars' }`: the puck's Alignment page. `current` says what the phone is aligned
 * on, or is empty; `remove` and `removeAgain` are the words of its Remove chip, before and
 * after a first tap. Each star's `sub` is where it is and how bright: "E 60° · mag 0.0".
 */
export interface PuckAlignStarsMessage {
  t: 'alignStars';
  current: string;
  remove: string;
  removeAgain: string;
  stars: { id: string; name: string; sub: string }[];
}

/**
 * `{ t: 'alignStatus' }`: where the puck's alignment is, with the words to show over its
 * map: centre the star, solving, failed (with why, and Align again), or done.
 */
export interface PuckAlignStatusMessage {
  t: 'alignStatus';
  step: 'centre' | 'solving' | 'failed' | 'done';
  text: string;
}

/**
 * Guided alignment from the puck (docs/puck.md, "Alignment"), as the app's Align page does
 * it: a star is chosen and becomes the target, so both maps guide to it; once it is centred
 * in the eyepiece, a plate solve measures how the camera sits.
 */
@Injectable({ providedIn: 'root' })
export class PuckAlignService {
  private readonly state = inject(AppState);
  private readonly liveSolver = inject(LiveSolverService);
  private chosen: Target | null = null;

  /** The selected target first, while it's up (any object in view can be solved), then the easiest stars. */
  private candidates(): Target[] {
    const selected = this.state.selectedTarget();
    const up = selected && this.state.positionOf(selected).altDeg > 0 ? [selected] : [];
    const stars = suggestAlignmentStars(
      this.state
        .targets()
        .filter((target) => target.kind === 'Star')
        .map((star) => ({ star, mag: star.mag, position: this.state.positionOf(star) })),
      SUGGESTED_STARS,
      alignmentStarLimit(this.state.settings().bortle),
    ).map(({ star }) => star);
    return [...up, ...stars.filter((star) => star.id !== selected?.id)];
  }

  starsMessage(): PuckAlignStarsMessage {
    const alignment = this.state.alignment();
    return {
      t: 'alignStars',
      current: alignment ? t('settings.alignedOn', { star: alignment.starId }) : '',
      remove: t('align.remove'),
      removeAgain: t('align.removeQuestion'),
      stars: this.candidates().map((target) => {
        const { altDeg, azDeg } = this.state.positionOf(target);
        const where = `${compassShort(azDeg)} ${Math.round(altDeg)}°`;
        return { id: target.id, name: target.id, sub: `${where} · ${t('details.mag', { mag: num(target.mag, 1) })}` };
      }),
    };
  }

  /** A star chosen on the puck: it becomes the target, to centre. Null if it isn't offered. */
  choose(id: string): PuckAlignStatusMessage | null {
    const target = this.candidates().find((candidate) => candidate.id === id);
    if (!target) return null;
    this.chosen = target;
    this.state.selectedTargetId.set(target.id);
    return { t: 'alignStatus', step: 'centre', text: t('align.centre', { name: target.id }) };
  }

  /** The words while the plate solve runs. */
  solvingMessage(): PuckAlignStatusMessage {
    return { t: 'alignStatus', step: 'solving', text: t('align.solving') };
  }

  /** The chosen star is centred in the eyepiece: a plate solve shows how the camera sits. */
  async alignNow(): Promise<PuckAlignStatusMessage> {
    const star = this.chosen;
    if (!star) return { t: 'alignStatus', step: 'failed', text: t('align.failed') };
    const result = await this.liveSolver.solveNow();
    if (!result.ok) return { t: 'alignStatus', step: 'failed', text: `${t('align.failed')}. ${result.reason}` };
    const camera = cameraPointing(rearCameraDirection(result.attitude));
    const alignment = newAlignment(star.id, this.state.positionOf(star), camera, 'plate-solve');
    this.state.alignment.set(alignment);
    const offset = t('align.offset', { degrees: num(offsetAngleDeg(alignment.offset), 1) });
    return { t: 'alignStatus', step: 'done', text: `${t('settings.alignedOn', { star: star.id })} · ${offset}` };
  }

  remove(): void {
    this.state.alignment.set(null);
  }
}
