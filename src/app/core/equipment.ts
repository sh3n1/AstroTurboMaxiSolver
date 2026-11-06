// Telescope and eyepiece combinations, with no Angular dependency.

export type TelescopeType = 'newtonian' | 'refractor' | 'cassegrain';

/** One telescope and eyepiece combination, as the user sets it up. */
export interface Equipment {
  telescopeType: TelescopeType;
  telescopeFocalMm: number;
  telescopeApertureMm: number;
  eyepieceFocalMm: number;
  eyepieceFieldDeg: number; // The eyepiece's apparent field of view
}

export const EQUIPMENT_KEYS = [
  'telescopeType',
  'telescopeFocalMm',
  'telescopeApertureMm',
  'eyepieceFocalMm',
  'eyepieceFieldDeg',
] as const satisfies readonly (keyof Equipment)[];

/** How many recent combinations to keep. */
export const RECENT_EQUIPMENT_COUNT = 5;

export function sameEquipment(a: Equipment, b: Equipment): boolean {
  return EQUIPMENT_KEYS.every((key) => a[key] === b[key]);
}

export function pickEquipment(source: Equipment): Equipment {
  const { telescopeType, telescopeFocalMm, telescopeApertureMm, eyepieceFocalMm, eyepieceFieldDeg } = source;
  return { telescopeType, telescopeFocalMm, telescopeApertureMm, eyepieceFocalMm, eyepieceFieldDeg };
}

/** Puts a combination at the front of the recent list, without repeats. */
export function rememberEquipment(recent: readonly Equipment[], current: Equipment): Equipment[] {
  const picked = pickEquipment(current);
  return [picked, ...recent.filter((item) => !sameEquipment(item, picked))].slice(0, RECENT_EQUIPMENT_COUNT);
}

/** A short label, such as "130/650 · 25 mm". */
export function equipmentLabel(equipment: Equipment): string {
  return `${equipment.telescopeApertureMm}/${equipment.telescopeFocalMm} · ${equipment.eyepieceFocalMm} mm`;
}
