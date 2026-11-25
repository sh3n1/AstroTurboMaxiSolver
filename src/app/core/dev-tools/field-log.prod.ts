// field-log.ts in a production build (angular.json, fileReplacements): never on, and each
// call does nothing, so no field test code is in it. Its functions and types must match
// field-log.ts's: the production build's type check fails if they don't.

export interface FieldEvent {
  at: number;
  kind: string;
  [field: string]: unknown;
}

export interface FieldSolve {
  id: string;
  step: number | null;
  trigger: string;
}

export interface FieldSolveTags {
  fieldStep: number | null;
  fieldSolve: string | null;
}

export const MAX_WAITING = 0;

export function fieldActive(): boolean {
  return false;
}

export function fieldEvent(_kind: string, _fields: Record<string, unknown> = {}): void {
  // Nothing.
}

export function setFieldActive(_on: boolean): void {
  // Nothing.
}

export function setFieldStep(_value: number | null): void {
  // Nothing.
}

export function takeFieldEvents(): FieldEvent[] {
  return [];
}

export function fieldSolveStarted(_trigger: string): void {
  // Nothing.
}

export function fieldSolveDone(): void {
  // Nothing.
}

export function onFieldSolveDone(_listener: (solve: FieldSolve) => void): void {
  // Nothing.
}

export function fieldSolveTags(): FieldSolveTags {
  return { fieldStep: null, fieldSolve: null };
}
