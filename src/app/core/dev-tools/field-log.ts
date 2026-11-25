// The field test's record (the puck's docs/field-tests.md), in development only: events
// wait here until FieldTestService sends them to the laptop's collector. With no collector
// it stays off, and every call does nothing.

export interface FieldEvent {
  /** This phone's clock, in milliseconds. */
  at: number;
  kind: string;
  [field: string]: unknown;
}

/** At most this many wait, if the collector stops answering: the oldest go first. */
const MAX_WAITING = 5000;

let active = false;
let step: number | null = null;
let waiting: FieldEvent[] = [];

/** Whether a field test is being recorded. */
export function fieldActive(): boolean {
  return active;
}

/** The step being captured, so its solve report goes in that step's folder. */
export function fieldStep(): number | null {
  return step;
}

/** Notes something that happened, if a field test is on. */
export function fieldEvent(kind: string, fields: Record<string, unknown> = {}): void {
  if (!active) return;
  waiting.push({ at: Date.now(), kind, ...fields });
  if (waiting.length > MAX_WAITING) waiting.shift();
}

export function setFieldActive(on: boolean): void {
  active = on;
  if (!on) waiting = [];
}

export function setFieldStep(value: number | null): void {
  step = value;
}

/** Everything noted since the last call. */
export function takeFieldEvents(): FieldEvent[] {
  const taken = waiting;
  waiting = [];
  return taken;
}

/** A plate solve in a field test: its telescope picture and normal photo share its id. */
export interface FieldSolve {
  id: string;
  step: number | null;
  trigger: string;
}

let solveDoneListeners: ((solve: FieldSolve) => void)[] = [];

/**
 * A plate solve starts: the collector hears at once, not with the next batch, so the
 * telescope's camera takes its picture while this phone's camera exposes. Null when no
 * field test is on.
 */
export function fieldSolveStarted(trigger: string): FieldSolve | null {
  if (!active) return null;
  const solve: FieldSolve = { id: String(Date.now()), step, trigger };
  void fetch('/field/solve-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...solve, at: Date.now() }),
  }).catch(() => undefined);
  return solve;
}

/** The solve is over, solved or not: its normal photo can follow (field-test.service.ts). */
export function fieldSolveDone(solve: FieldSolve | null): void {
  if (solve) for (const listener of solveDoneListeners) listener(solve);
}

export function onFieldSolveDone(listener: (solve: FieldSolve) => void): void {
  solveDoneListeners = [...solveDoneListeners, listener];
}
