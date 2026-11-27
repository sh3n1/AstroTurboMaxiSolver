// The latest plate solve attempts, kept in memory for this session: the sky map shows a toast
// for each new one, and Settings lists them for debugging. Split out of
// live-solver.service.ts, which makes the attempts.

import { signal } from '@angular/core';

/** What started a solve: the phone lying still, alignment, or a tap on the rings. */
export type SolveTrigger = 'auto' | 'alignment' | 'tap';

/** One plate solve attempt, as the log in Settings shows it. */
export interface SolveLogEntry {
  /** Counts up, so a new entry can be told apart from one already seen. */
  id: number;
  at: Date;
  /** Automatic while the phone is still, or asked for by alignment. */
  trigger: SolveTrigger;
  /** A retry means the frame was unusable, such as too bright, so it tries again soon. */
  outcome: 'solved' | 'failed' | 'retry';
  /** One short line for a toast or the log, such as "No match in 14 stars". */
  message: string;
  starCount: number;
  matched: number;
  iso: number;
  /** How many frames were averaged into the picture. */
  frames: number;
  durationMs: number;
  /** After a solve, how far the sensors were from the true position. */
  sensorErrorDeg: number | null;
}

/** An attempt made on this phone, as it ends: its entry is timed from when it started. */
export interface SolveAttempt {
  trigger: SolveTrigger;
  startedAt: number;
  iso: number;
  frames: number;
  outcome: SolveLogEntry['outcome'];
  message: string;
  starCount?: number;
  matched?: number;
  sensorErrorDeg?: number | null;
}

/** How many attempts the log keeps. */
export const LOG_LENGTH = 20;

export class SolveLog {
  /** Newest first. */
  readonly entries = signal<SolveLogEntry[]>([]);
  private count = 0;

  /** Adds an attempt made here to the top, dropping the oldest once the log is full. */
  add(attempt: SolveAttempt): void {
    this.push({
      at: new Date(),
      trigger: attempt.trigger,
      outcome: attempt.outcome,
      message: attempt.message,
      starCount: attempt.starCount ?? 0,
      matched: attempt.matched ?? 0,
      iso: attempt.iso,
      frames: attempt.frames,
      durationMs: Date.now() - attempt.startedAt,
      sensorErrorDeg: attempt.sensorErrorDeg ?? null,
    });
  }

  /**
   * Adds an attempt made by the finder phone, so the screen phone tells it with the same
   * toasts and lists it in Settings, as if it had made it itself.
   */
  push(entry: Omit<SolveLogEntry, 'id'>): void {
    const newest: SolveLogEntry = { ...entry, id: ++this.count };
    this.entries.update((log) => [newest, ...log].slice(0, LOG_LENGTH));
  }
}
