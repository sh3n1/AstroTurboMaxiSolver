// field-log.ts in a production build (angular.json, fileReplacements): never on, and each
// call does nothing, so no field test code is in it.

// Its own copy of the type: this file takes field-log.ts's place, so can't import from it.
export interface FieldEvent {
  at: number;
  kind: string;
  [field: string]: unknown;
}

export function fieldActive(): boolean {
  return false;
}

export function fieldStep(): number | null {
  return null;
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

export interface FieldSolve {
  id: string;
  step: number | null;
  trigger: string;
}

export function fieldSolveStarted(_trigger: string): FieldSolve | null {
  return null;
}

export function fieldSolveDone(_solve: FieldSolve | null): void {
  // Nothing.
}

export function onFieldSolveDone(_listener: (solve: FieldSolve) => void): void {
  // Nothing.
}
