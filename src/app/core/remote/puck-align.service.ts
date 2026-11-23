import { Injectable, inject } from '@angular/core';

import { newAlignment, offsetAngleDeg, suggestAlignmentStars } from '../alignment/alignment';
import { AppState } from '../app-state.service';
import { compassPoint } from '../astronomy/astronomy';
import type { Target } from '../catalog/targets';
import { num, t } from '../i18n/t';
import { rearCameraDirection } from '../sensors/attitude';
import { cameraPointing } from '../sensors/device-orientation';
import { alignmentStarLimit } from '../sky-conditions/sky-quality';
import { LiveSolverService } from '../solver/live-solver.service';

import type { PuckTargetRow } from './puck-lists';
import { targetRow } from './puck-lists';

/** How many of the easiest stars the puck offers, as the app's Align page. */
const SUGGESTED_STARS = 4;

/**
 * `{ t: 'alignStars' }`: the puck's Alignment page. `current` says what the phone is aligned
 * on, or is empty; `remove` and `removeAgain` are the words of its Remove chip, before and
 * after a first tap. Each star is a row as a list's (puck-lists.ts), how bright under it.
 */
export interface PuckAlignStarsMessage {
  t: 'alignStars';
  current: string;
  remove: string;
  removeAgain: string;
  stars: PuckTargetRow[];
}

/**
 * `{ t: 'alignStatus' }`: where the puck's alignment is, with the words of its page, as the
 * Align page's steps: the heading (centre the star, solving, failed, aligned), a line or two
 * under it (where the star is and the hint, hold still, why it failed, the offset), and the
 * big round button's word (Align, Solving…, Retry, Done).
 */
export interface PuckAlignStatusMessage {
  t: 'alignStatus';
  step: 'centre' | 'solving' | 'failed' | 'done';
  text: string;
  detail: string;
  button: string;
}

/**
 * Guided alignment from the puck (docs/puck.md, "Alignment"), as the app's Align page does
 * it: a star is chosen, the user centres it in the eyepiece by eye (it doesn't become the
 * target: the map, not yet aligned, would guide the camera onto it, not the telescope), and
 * a plate solve then measures how the camera sits.
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
      // Named by id, as the Align page; how bright under it, and where, as a list's rows.
      stars: this.candidates().map((target) => ({
        ...targetRow(target, this.state.positionOf(target), t('details.mag', { mag: num(target.mag, 1) })),
        name: target.id,
      })),
    };
  }

  /** A star chosen on the puck, to centre in the eyepiece. Null if it isn't offered. */
  choose(id: string): PuckAlignStatusMessage | null {
    const target = this.candidates().find((candidate) => candidate.id === id);
    if (!target) return null;
    this.chosen = target;
    const position = this.state.positionOf(target);
    const where = t('align.position', {
      direction: compassPoint(position.azDeg),
      degrees: Math.round(position.altDeg),
    });
    return {
      t: 'alignStatus',
      step: 'centre',
      text: t('align.centre', { name: target.id }),
      detail: `${where}. ${t('align.centreHint')}`,
      button: t('align.align'),
    };
  }

  /** The words while the plate solve runs. */
  solvingMessage(): PuckAlignStatusMessage {
    return {
      t: 'alignStatus',
      step: 'solving',
      text: t('align.solving'),
      detail: t('align.holdStill'),
      button: t('align.solvingShort'),
    };
  }

  /** The chosen star is centred in the eyepiece: a plate solve shows how the camera sits. */
  async alignNow(): Promise<PuckAlignStatusMessage> {
    const star = this.chosen;
    if (!star) return this.failed('');
    const result = await this.liveSolver.solveNow();
    if (!result.ok) return this.failed(result.reason);
    const camera = cameraPointing(rearCameraDirection(result.attitude));
    const alignment = newAlignment(star.id, this.state.positionOf(star), camera, 'plate-solve');
    this.state.alignment.set(alignment);
    return {
      t: 'alignStatus',
      step: 'done',
      text: t('settings.alignedOn', { star: star.id }),
      detail: t('align.offset', { degrees: num(offsetAngleDeg(alignment.offset), 1) }),
      button: t('common.done'),
    };
  }

  private failed(reason: string): PuckAlignStatusMessage {
    return { t: 'alignStatus', step: 'failed', text: t('align.failed'), detail: reason, button: t('align.retry') };
  }

  remove(): void {
    this.state.alignment.set(null);
  }
}
