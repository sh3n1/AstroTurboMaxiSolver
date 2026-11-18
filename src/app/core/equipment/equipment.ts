// The user's equipment: telescopes, eyepieces, Barlows and reducers, and filters, defined
// once in Settings and picked from at the telescope. No Angular dependency.

import { magnification, trueFieldDeg } from '../astronomy/astronomy';
import { nameUuid, newUuid } from '../storage/sync-record';

export type TelescopeType = 'newtonian' | 'refractor' | 'cassegrain';

/** A telescope in the user's kit. The name is optional: without one, its numbers are shown. */
export interface Telescope {
  id: string;
  name: string;
  type: TelescopeType;
  apertureMm: number;
  focalMm: number;
}

export interface Eyepiece {
  id: string;
  name: string;
  focalMm: number;
  /** The eyepiece's apparent field of view. */
  fieldDeg: number;
}

/**
 * Something between the telescope and the eyepiece that changes the magnification: a
 * Barlow multiplies it (2 for a 2× Barlow), a focal reducer divides it (0.63).
 */
export interface Modifier {
  id: string;
  name: string;
  factor: number;
}

/** A filter changes nothing on the map. It is recorded in the log, where it helps later. */
export interface Filter {
  id: string;
  name: string;
}

/** Everything the user has, as set in Settings. */
export interface Kit {
  telescopes: Telescope[];
  eyepieces: Eyepiece[];
  modifiers: Modifier[];
  filters: Filter[];
}

export type KitKind = keyof Kit;
export type KitItem = Kit[KitKind][number];

/** An item as saved in the database: all kinds in one table, each marked with its kind. */
export type KitRecord = KitItem & { kind: KitKind };

/** What is in use now. A telescope and an eyepiece always; a Barlow and a filter only maybe. */
export interface KitSelection {
  telescopeId: string;
  eyepieceId: string;
  modifierId: string | null;
  filterId: string | null;
}

/**
 * One combination in use, as worked out from the kit and recorded in each log entry.
 * The modifier and filter are only there when one is used.
 */
export interface Equipment {
  telescopeType: TelescopeType;
  telescopeFocalMm: number;
  telescopeApertureMm: number;
  eyepieceFocalMm: number;
  eyepieceFieldDeg: number; // The eyepiece's apparent field of view
  modifier?: { name: string; factor: number };
  filter?: string;
}

/**
 * A common beginner telescope and eyepiece, used until the user adds their own. They are
 * built in, never saved, so a new phone doesn't add another copy of them to a synced kit.
 * Editing one saves the user's own item, which then takes its place.
 */
export const DEFAULT_TELESCOPE: Telescope = {
  id: nameUuid('astroturbomaxisolver/kit/default-telescope'),
  name: '',
  type: 'newtonian',
  apertureMm: 130,
  focalMm: 650,
};
export const DEFAULT_EYEPIECE: Eyepiece = {
  id: nameUuid('astroturbomaxisolver/kit/default-eyepiece'),
  name: '',
  focalMm: 25,
  fieldDeg: 52,
};
export const DEFAULT_KIT: Kit = {
  telescopes: [DEFAULT_TELESCOPE],
  eyepieces: [DEFAULT_EYEPIECE],
  modifiers: [],
  filters: [],
};
export const DEFAULT_SELECTION: KitSelection = {
  telescopeId: DEFAULT_TELESCOPE.id,
  eyepieceId: DEFAULT_EYEPIECE.id,
  modifierId: null,
  filterId: null,
};

/** Whether an item is one of the built-in defaults, which aren't saved. */
export const isDefaultItem = (id: string): boolean => id === DEFAULT_TELESCOPE.id || id === DEFAULT_EYEPIECE.id;

/** A new item's id, unique across devices. */
export function newKitId(): string {
  return newUuid();
}

/** The kit from its saved records, in the order given, with a default where none is saved. */
export function kitFromRecords(records: readonly KitRecord[]): Kit {
  const ofKind = <T extends KitItem>(kind: KitKind): T[] =>
    records.filter((r) => r.kind === kind).map(({ kind: _kind, ...item }) => item as unknown as T);
  const telescopes = ofKind<Telescope>('telescopes');
  const eyepieces = ofKind<Eyepiece>('eyepieces');
  return {
    telescopes: telescopes.length ? telescopes : [DEFAULT_TELESCOPE],
    eyepieces: eyepieces.length ? eyepieces : [DEFAULT_EYEPIECE],
    modifiers: ofKind<Modifier>('modifiers'),
    filters: ofKind<Filter>('filters'),
  };
}

/**
 * The selection with every id pointing at an item in the kit: a telescope or eyepiece
 * that no longer exists falls back to the first, and a Barlow or filter to none.
 */
export function resolveSelection(kit: Kit, selection: KitSelection): KitSelection {
  const has = (items: readonly { id: string }[], id: string | null): boolean => items.some((i) => i.id === id);
  return {
    telescopeId: has(kit.telescopes, selection.telescopeId) ? selection.telescopeId : kit.telescopes[0].id,
    eyepieceId: has(kit.eyepieces, selection.eyepieceId) ? selection.eyepieceId : kit.eyepieces[0].id,
    modifierId: has(kit.modifiers, selection.modifierId) ? selection.modifierId : null,
    filterId: has(kit.filters, selection.filterId) ? selection.filterId : null,
  };
}

/** The combination in use, from the kit and what is picked. */
export function activeEquipment(kit: Kit, selection: KitSelection): Equipment {
  const ids = resolveSelection(kit, selection);
  const telescope = kit.telescopes.find((t) => t.id === ids.telescopeId)!;
  const eyepiece = kit.eyepieces.find((e) => e.id === ids.eyepieceId)!;
  const modifier = kit.modifiers.find((m) => m.id === ids.modifierId);
  const filter = kit.filters.find((f) => f.id === ids.filterId);
  return {
    telescopeType: telescope.type,
    telescopeFocalMm: telescope.focalMm,
    telescopeApertureMm: telescope.apertureMm,
    eyepieceFocalMm: eyepiece.focalMm,
    eyepieceFieldDeg: eyepiece.fieldDeg,
    ...(modifier && { modifier: { name: modifierLabel(modifier), factor: modifier.factor } }),
    ...(filter && { filter: filter.name }),
  };
}

/** The magnification, with the Barlow or reducer if there is one. */
export function equipmentPower(equipment: Equipment): number {
  return magnification(equipment.telescopeFocalMm * (equipment.modifier?.factor ?? 1), equipment.eyepieceFocalMm);
}

/** The width of sky the eyepiece shows, in degrees. */
export function equipmentTrueField(equipment: Equipment): number {
  const focalMm = equipment.telescopeFocalMm * (equipment.modifier?.factor ?? 1);
  return trueFieldDeg(focalMm, equipment.eyepieceFocalMm, equipment.eyepieceFieldDeg);
}

/** A short label for the log, such as "130/650 · 25 mm · 2× Barlow · UHC". */
export function equipmentLabel(equipment: Equipment): string {
  return [
    `${equipment.telescopeApertureMm}/${equipment.telescopeFocalMm}`,
    `${equipment.eyepieceFocalMm} mm`,
    equipment.modifier?.name,
    equipment.filter,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ---- Labels for each item: its name, or its numbers without one ----

export const telescopeLabel = (t: Telescope): string => t.name.trim() || `${t.apertureMm}/${t.focalMm}`;
export const eyepieceLabel = (e: Eyepiece): string => e.name.trim() || `${e.focalMm} mm`;
/** "2× Barlow" or "0.63× reducer" without a name, since that is what each one does. */
export const modifierLabel = (m: Modifier): string =>
  m.name.trim() || `${m.factor}× ${m.factor >= 1 ? 'Barlow' : 'reducer'}`;

/** The line under an item in Settings: what it is, beyond its name. */
export function kitItemDetail(kind: KitKind, item: KitItem): string {
  switch (kind) {
    case 'telescopes': {
      const t = item as Telescope;
      return `${t.apertureMm} mm, ${t.focalMm} mm focal length, ${TELESCOPE_TYPES[t.type]}`;
    }
    case 'eyepieces': {
      const e = item as Eyepiece;
      return `${e.focalMm} mm, ${e.fieldDeg}° field`;
    }
    case 'modifiers':
      return `${(item as Modifier).factor}×`;
    case 'filters':
      return '';
  }
}

export function kitItemLabel(kind: KitKind, item: KitItem): string {
  switch (kind) {
    case 'telescopes':
      return telescopeLabel(item as Telescope);
    case 'eyepieces':
      return eyepieceLabel(item as Eyepiece);
    case 'modifiers':
      return modifierLabel(item as Modifier);
    case 'filters':
      return (item as Filter).name;
  }
}

export const TELESCOPE_TYPES: Record<TelescopeType, string> = {
  newtonian: 'Newtonian',
  refractor: 'Refractor with diagonal',
  cassegrain: 'Cassegrain with diagonal',
};

/**
 * Builds a kit from the settings of before the kit existed: the telescope and eyepiece in
 * use, and the recent combinations, each telescope and eyepiece once.
 */
export function kitFromOldSettings(
  current: Partial<Equipment>,
  recent: readonly Partial<Equipment>[] = [],
): {
  kit: Kit;
  selection: KitSelection;
} {
  const kit: Kit = { telescopes: [], eyepieces: [], modifiers: [], filters: [] };
  const selection = { ...DEFAULT_SELECTION };
  [current, ...recent].forEach((old, index) => {
    const telescope = {
      type: old.telescopeType ?? 'newtonian',
      apertureMm: old.telescopeApertureMm ?? 130,
      focalMm: old.telescopeFocalMm ?? 650,
    };
    const eyepiece = { focalMm: old.eyepieceFocalMm ?? 25, fieldDeg: old.eyepieceFieldDeg ?? 52 };
    let t = kit.telescopes.find(
      (k) => k.type === telescope.type && k.apertureMm === telescope.apertureMm && k.focalMm === telescope.focalMm,
    );
    if (!t) kit.telescopes.push((t = { id: `telescope-${kit.telescopes.length + 1}`, name: '', ...telescope }));
    let e = kit.eyepieces.find((k) => k.focalMm === eyepiece.focalMm && k.fieldDeg === eyepiece.fieldDeg);
    if (!e) kit.eyepieces.push((e = { id: `eyepiece-${kit.eyepieces.length + 1}`, name: '', ...eyepiece }));
    // The first is the combination in use.
    if (index === 0) Object.assign(selection, { telescopeId: t.id, eyepieceId: e.id });
  });
  // Eyepieces read best from the widest to the most powerful, as in a case.
  kit.eyepieces.sort((a, b) => b.focalMm - a.focalMm);
  return { kit, selection };
}
