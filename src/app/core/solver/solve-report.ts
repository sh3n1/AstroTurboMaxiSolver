// Debugging reports for sky map plate solves. With the setting on, in development only,
// every attempt is sent to the PC running the dev server, with everything needed to
// re-run it there: the raw frame, the solver's inputs, what it found, and the sensors.
//
// A report is about 11 MB, nearly all of it the raw frame. They go one at a time, and the
// frame is turned to base64 and put in the body without copies in the page's memory: built
// up as strings and passed through JSON.stringify, a field test's reports filled the
// phone's memory until Chrome reloaded the page, twice in a night (2026-11-24).

import type { Horizontal } from '../astronomy/astronomy';
import type { PreviewStretch } from '../dev-tools/sky-test';
import { previewImage, previewStretch } from '../dev-tools/sky-test';

import type { SolveRequest, SolveResponse } from './solver-messages';

/** The solver request, without the pixels, which travel separately. */
export type SolveInputs = Omit<Extract<SolveRequest, { type: 'solve' }>, 'pixels' | 'type' | 'id'>;

export interface SolveReport {
  kind: 'live-solve';
  time: string;
  browser: string;
  /** Automatic while still, or asked for by alignment. */
  trigger: 'auto' | 'alignment' | 'tap';
  outcome: 'solved' | 'failed';
  message: string;
  durationMs: number;
  /** Each frame's exposure, how many were averaged, and whether the app set the exposure. */
  camera: { exposureSeconds: number; iso: number; frames: number; manual: boolean };
  settings: Record<string, unknown>;
  alignment: unknown;
  inputs: SolveInputs;
  /** Where the sensors said the camera pointed, before and after the solve. */
  sensorsBefore: Horizontal | null;
  sensorsAfter: Horizontal | null;
  sensors: unknown;
  /** In a field test, the step this solve belongs to (dev-tools/field-log.ts). */
  fieldStep?: number | null;
  /** In a field test, the solve's id, which its telescope picture and normal photo share. */
  fieldSolve?: string | null;
  /** The screen's orientation, which may turn the camera's frames. */
  screen: { type: string | null; angle: number | null; width: number; height: number };
  result: Omit<SolveResponse, 'id'>;
  /** The camera's frame as 32-bit floats, little-endian, row by row, base64. */
  raw: string;
  /** A stretched preview to look at, as a JPEG data URL. */
  image: string | null;
  previewStretch: PreviewStretch;
}

/** A report waiting to be sent: everything but its raw frame, and the frame itself. */
export interface PendingSolveReport {
  report: Omit<SolveReport, 'raw'>;
  pixels: Float32Array;
}

/** Base64 of the frame's raw bytes, made by the browser itself rather than in strings. */
export function toBase64(pixels: Float32Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('The frame could not be read.'));
    reader.readAsDataURL(
      new Blob([new Uint8Array(pixels.buffer as ArrayBuffer, pixels.byteOffset, pixels.byteLength)]),
    );
  });
}

/**
 * The report's body as a Blob, in the receiver's JSON: the rest of the report, then the
 * frame's base64 added as the "raw" field without passing through JSON.stringify.
 */
export function reportBody(report: Omit<SolveReport, 'raw'>, rawBase64: string): Blob {
  const rest = JSON.stringify(report);
  return new Blob([rest.slice(0, -1), ',"raw":"', rawBase64, '"}'], { type: 'application/json' });
}

/** Builds a report from a finished attempt. `pixels` must be a copy kept before solving. */
export function buildSolveReport(
  details: Omit<SolveReport, 'kind' | 'time' | 'browser' | 'screen' | 'raw' | 'image' | 'previewStretch' | 'result'>,
  pixels: Float32Array,
  response: SolveResponse,
): PendingSolveReport {
  const { id: _id, ...result } = response;
  const stretch = previewStretch(response.background, response.noise);
  const report: Omit<SolveReport, 'raw'> = {
    kind: 'live-solve',
    time: new Date().toISOString(),
    browser: navigator.userAgent,
    ...details,
    screen: {
      type: screen.orientation?.type ?? null,
      angle: screen.orientation?.angle ?? null,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    result,
    image: previewImage(pixels, details.inputs.width, details.inputs.height, stretch),
    previewStretch: stretch,
  };
  return { report, pixels };
}

let sending = false;
/** At most one report waits while another is sent: a newer one takes its place. */
let waiting: PendingSolveReport | null = null;

/**
 * Sends a report to the dev server's receiver, one at a time. Failures are only logged:
 * it's for debugging. While one is being sent, only the newest waits; older ones are
 * dropped, so a slow network can't pile frames up in memory.
 */
export async function sendSolveReport(pending: PendingSolveReport): Promise<void> {
  if (sending) {
    if (waiting) console.warn('Solve report dropped: the one before is still being sent');
    waiting = pending;
    return;
  }
  sending = true;
  try {
    for (let next: PendingSolveReport | null = pending; next; next = waiting, waiting = null) {
      await postReport(next);
    }
  } finally {
    sending = false;
  }
}

async function postReport({ report, pixels }: PendingSolveReport): Promise<void> {
  try {
    const response = await fetch('/device-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: reportBody(report, await toBase64(pixels)),
    });
    if (!response.ok) console.warn(`Solve report rejected: ${response.status}`);
  } catch (error) {
    console.warn('Solve report not sent', error);
  }
}
