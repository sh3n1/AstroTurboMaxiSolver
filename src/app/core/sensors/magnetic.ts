// Magnetic declination: how far a compass's north is from true north, at a place and time.
// Phones report headings from magnetic north, but the sky is laid out around true north.
// The difference is about 1° in Valencia, but 13° in New York and 15° in Seattle.

import { model } from 'geomagnetism';

/**
 * The magnetic declination in degrees, positive when magnetic north is east of true
 * north. Uses the World Magnetic Model, valid to 2029. Later dates use the latest model,
 * which drifts slowly, by about a tenth of a degree a year.
 */
export function magneticDeclinationDeg(latitudeDeg: number, longitudeDeg: number, date: Date): number {
  return model(date, { allowOutOfBoundsModel: true }).point([latitudeDeg, longitudeDeg]).decl;
}
