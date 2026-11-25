// The field test's record (docs/field-tests.md), in development only: events wait here
// until FieldTestService sends them to the laptop's collector. With no collector it stays
// off, and every call does nothing. A production build swaps this file for
// field-log.prod.ts (angular.json, fileReplacements), whose calls all do nothing.

export interface FieldEvent {
  /** This phone's clock, in milliseconds. */
  at: number;
  kind: string;
  [field: string]: unknown;
}

/** A plate solve in a field test: its telescope picture and normal photo share its id. */
export interface FieldSolve {
  id: string;
  step: number | null;
  trigger: string;
}

/** What a solve report carries in a field test (solve-report.ts). */
export interface FieldSolveTags {
  fieldStep: number | null;
  fieldSolve: string | null;
}

/** At most this many wait, if the collector stops answering: the oldest go first. */
export const MAX_WAITING = 5000;

let active = false;
let step: number | null = null;
let waiting: FieldEvent[] = [];
/** The plate solve under way, if a field test is on: only one runs at a time. */
let solving: FieldSolve | null = null;
let solveDoneListeners: ((solve: FieldSolve) => void)[] = [];

/** Whether a field test is being recorded. */
export function fieldActive(): boolean {
  return active;
}

/** Notes something that happened, if a field test is on. */
export function fieldEvent(kind: string, fields: Record<string, unknown> = {}): void {
  if (!active) return;
  waiting.push({ at: Date.now(), kind, ...fields });
  if (waiting.length > MAX_WAITING) waiting.shift();
}

export function setFieldActive(on: boolean): void {
  active = on;
  if (!on) {
    waiting = [];
    solving = null;
  }
}

/** The step being captured, so its solve report goes in that step's folder. */
export function setFieldStep(value: number | null): void {
  step = value;
}

/** Everything noted since the last call. */
export function takeFieldEvents(): FieldEvent[] {
  const taken = waiting;
  waiting = [];
  return taken;
}

/**
 * A plate solve starts. The collector hears at once, not with the next batch, so the
 * telescope's camera takes its picture while this phone's camera exposes.
 */
export function fieldSolveStarted(trigger: string): void {
  if (!active) return;
  solving = { id: String(Date.now()), step, trigger };
  void fetch('/field/solve-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...solving, at: Date.now() }),
  }).catch(() => undefined);
}

/** The solve is over, solved or not: its normal photo can follow (field-test.service.ts). */
export function fieldSolveDone(): void {
  const done = solving;
  solving = null;
  if (done) for (const listener of solveDoneListeners) listener(done);
}

export function onFieldSolveDone(listener: (solve: FieldSolve) => void): void {
  solveDoneListeners = [...solveDoneListeners, listener];
}

/** The solve under way's step and id, for its report, so the collector files it. */
export function fieldSolveTags(): FieldSolveTags {
  return { fieldStep: solving?.step ?? step, fieldSolve: solving?.id ?? null };
}
