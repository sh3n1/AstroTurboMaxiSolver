// The QR scanner's exposure steps (qr-scanner.component.ts). In the dark, auto exposure
// brightens the mostly black picture and a bright screen's code burns out white, so the
// scanner tries darker exposures too. A plain function, so it can be tested alone.

/**
 * The exposure compensations the scanner steps through, in stops: normal, one darker and
 * two darker, kept within what the camera allows.
 */
export function darkerExposures(min: number, max: number): number[] {
  const steps = [0, -1, -2].map((stops) => Math.min(max, Math.max(min, stops)));
  return [...new Set(steps)];
}
