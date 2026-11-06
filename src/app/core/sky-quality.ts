// How faint a star the observer can see, with no Angular dependency.

/**
 * The faintest star visible to the naked eye for each Bortle class, 1 to 9. These are
 * the usual published approximations. Index 0 is unused so the class reads directly.
 */
const NAKED_EYE_LIMIT_BY_BORTLE = [0, 7.8, 7.3, 6.8, 6.3, 5.8, 5.3, 4.8, 4.3, 4.0];

/** Short descriptions, for choosing a class. */
export const BORTLE_CLASSES = [
  { value: 1, label: '1: excellent dark site' },
  { value: 2, label: '2: truly dark site' },
  { value: 3, label: '3: rural sky' },
  { value: 4, label: '4: rural and suburban transition' },
  { value: 5, label: '5: suburban sky' },
  { value: 6, label: '6: bright suburban sky' },
  { value: 7, label: '7: suburban and city transition' },
  { value: 8, label: '8: city sky' },
  { value: 9, label: '9: inner city sky' },
] as const;

/** A dark-adapted eye's pupil, which a telescope's aperture is compared with. */
const EYE_PUPIL_MM = 7;

export function nakedEyeLimit(bortle: number): number {
  const index = Math.min(9, Math.max(1, Math.round(bortle)));
  return NAKED_EYE_LIMIT_BY_BORTLE[index];
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
