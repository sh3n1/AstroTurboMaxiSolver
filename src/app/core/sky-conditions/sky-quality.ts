// How faint a star the observer can see, with no Angular dependency.

/**
 * The faintest star visible to the naked eye for each Bortle class, 1 to 9. These are
 * the usual published approximations. Index 0 is unused so the class reads directly.
 */
const NAKED_EYE_LIMIT_BY_BORTLE = [0, 7.8, 7.3, 6.8, 6.3, 5.8, 5.3, 4.8, 4.3, 4.0];

/** Short descriptions, for choosing a class. */
export const BORTLE_CLASSES = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => ({
  value,
  // The class in words, such as "9: inner city sky": a text key, under bortle in en.json.
  label: `bortle.${value}`,
}));

/** A dark-adapted eye's pupil, which a telescope's aperture is compared with. */
const EYE_PUPIL_MM = 7;

export function nakedEyeLimit(bortle: number): number {
  const index = Math.min(9, Math.max(1, Math.round(bortle)));
  return NAKED_EYE_LIMIT_BY_BORTLE[index];
}

/**
 * The faintest objects worth recommending. Galaxies and nebulae spread their light over
 * an area, so they need to be about a magnitude brighter than the faintest visible star.
 */
export function recommendationLimit(bortle: number, apertureMm: number): number {
  return telescopeLimit(bortle, apertureMm) - 1;
}

/**
 * The faintest stars worth offering for alignment: ones easy to spot and recognise by
 * eye. About two magnitudes brighter than the naked-eye limit, but never fainter than
 * 3.5, since faint stars are hard to tell apart even under a dark sky.
 */
export function alignmentStarLimit(bortle: number): number {
  return Math.min(3.5, Math.max(2, nakedEyeLimit(bortle) - 1.8));
}

/**
 * The faintest star a telescope shows, by a common rule of thumb: the naked-eye limit,
 * improved by how much more light the aperture gathers than the eye. Real results also
 * depend on magnification, seeing and the observer's experience, so this is a guide.
 */
export function telescopeLimit(bortle: number, apertureMm: number): number {
  const gain = 5 * Math.log10(Math.max(apertureMm, EYE_PUPIL_MM) / EYE_PUPIL_MM);
  return Math.round((nakedEyeLimit(bortle) + gain) * 10) / 10;
}
