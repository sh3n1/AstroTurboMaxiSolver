// Debugging reports for sky map plate solves. With the setting on, in development only,
// every attempt is sent to the PC running the dev server, with everything needed to
// re-run it there: the raw frame, the solver's inputs, what it found, and the sensors.

import type { Horizontal } from './astronomy';
import type { PreviewStretch } from './sky-test';
import { previewImage, previewStretch } from './sky-test';
import type { SolveRequest, SolveResponse } from './solver-messages';

/** The solver request, without the pixels, which travel separately. */
export type SolveInputs = Omit<Extract<SolveRequest, { type: 'solve' }>, 'pixels' | 'type' | 'id'>;

export interface SolveReport {
  kind: 'live-solve';
  time: string;
  browser: string;
  /** Automatic while still, or asked for by alignment. */
  trigger: 'auto' | 'alignment';
  outcome: 'solved' | 'failed';
  message: string;
  durationMs: number;
  camera: { exposureSeconds: number; iso: number; frames: number };
  settings: Record<string, unknown>;
  alignment: unknown;
  inputs: SolveInputs;
  /** Where the sensors said the camera pointed, before and after the solve. */
  sensorsBefore: Horizontal | null;
  sensorsAfter: Horizontal | null;
  sensors: unknown;
  /** The screen's orientation, which may turn the camera's frames. */
  screen: { type: string | null; angle: number | null; width: number; height: number };
  result: Omit<SolveResponse, 'id'>;
  /** The camera's frame as 32-bit floats, little-endian, row by row, base64. */
  raw: string;
  /** A stretched preview to look at, as a JPEG data URL. */
  image: string | null;
  previewStretch: PreviewStretch;
}

/** Base64 of the frame's raw bytes, in chunks, because one huge call can overflow the stack. */
function toBase64(pixels: Float32Array): string {
  const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  let text = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(text);
}

/** Builds a report from a finished attempt. `pixels` must be a copy kept before solving. */
export function buildSolveReport(
  details: Omit<SolveReport, 'kind' | 'time' | 'browser' | 'screen' | 'raw' | 'image' | 'previewStretch' | 'result'>,
  pixels: Float32Array,
  response: SolveResponse,
): SolveReport {
  const { id: _id, ...result } = response;
  const stretch = previewStretch(response.background, response.noise);
  return {
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
    raw: toBase64(pixels),
    image: previewImage(pixels, details.inputs.width, details.inputs.height, stretch),
    previewStretch: stretch,
  };
}

/** Sends a report to the dev server's receiver. Failures are only logged: it's for debugging. */
export async function sendSolveReport(report: SolveReport): Promise<void> {
  try {
    const response = await fetch('/device-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    if (!response.ok) console.warn(`Solve report rejected: ${response.status}`);
  } catch (error) {
    console.warn('Solve report not sent', error);
  }
}
