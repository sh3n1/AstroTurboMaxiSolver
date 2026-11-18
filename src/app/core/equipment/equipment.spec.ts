import type { Equipment, Kit } from './equipment';
import {
  DEFAULT_EYEPIECE,
  DEFAULT_SELECTION,
  DEFAULT_TELESCOPE,
  activeEquipment,
  equipmentLabel,
  equipmentPower,
  equipmentTrueField,
  kitFromOldSettings,
  kitFromRecords,
  modifierLabel,
  resolveSelection,
} from './equipment';

const kit: Kit = {
  telescopes: [
    { id: 't1', name: '', type: 'newtonian', apertureMm: 130, focalMm: 650 },
    { id: 't2', name: 'Dobson', type: 'newtonian', apertureMm: 254, focalMm: 1200 },
  ],
  eyepieces: [
    { id: 'e1', name: '', focalMm: 25, fieldDeg: 52 },
    { id: 'e2', name: '', focalMm: 10, fieldDeg: 52 },
  ],
  modifiers: [{ id: 'm1', name: '', factor: 2 }],
  filters: [{ id: 'f1', name: 'UHC' }],
};

describe('active equipment', () => {
  it('combines the telescope and eyepiece picked', () => {
    const equipment = activeEquipment(kit, { telescopeId: 't2', eyepieceId: 'e2', modifierId: null, filterId: null });
    expect(equipment).toEqual({
      telescopeType: 'newtonian',
      telescopeFocalMm: 1200,
      telescopeApertureMm: 254,
      eyepieceFocalMm: 10,
      eyepieceFieldDeg: 52,
    });
    expect(equipmentPower(equipment)).toBe(120);
  });

  it('multiplies the magnification with a Barlow, narrowing the field, and records the filter', () => {
    const equipment = activeEquipment(kit, { telescopeId: 't1', eyepieceId: 'e1', modifierId: 'm1', filterId: 'f1' });
    expect(equipmentPower(equipment)).toBe(52);
    expect(equipmentTrueField(equipment)).toBeCloseTo(1);
    expect(equipmentLabel(equipment)).toBe('130/650 · 25 mm · 2× Barlow · UHC');
  });

  it('falls back to the first telescope and eyepiece, and to none, when an item is gone', () => {
    expect(
      resolveSelection(kit, { telescopeId: 'gone', eyepieceId: 'gone', modifierId: 'gone', filterId: 'gone' }),
    ).toEqual({ telescopeId: 't1', eyepieceId: 'e1', modifierId: null, filterId: null });
  });
});

describe('kit from its records', () => {
  it('uses the built-in telescope and eyepiece until the user saves one', () => {
    expect(kitFromRecords([])).toEqual({
      telescopes: [DEFAULT_TELESCOPE],
      eyepieces: [DEFAULT_EYEPIECE],
      modifiers: [],
      filters: [],
    });
    const own = kitFromRecords([
      { kind: 'telescopes', ...kit.telescopes[1] },
      { kind: 'filters', ...kit.filters[0] },
    ]);
    expect(own.telescopes).toEqual([kit.telescopes[1]]);
    expect(own.eyepieces).toEqual([DEFAULT_EYEPIECE]);
    expect(own.filters).toEqual(kit.filters);
  });
});

describe('labels', () => {
  it('names a Barlow or reducer by what it does, without a name of its own', () => {
    expect(modifierLabel({ id: 'm', name: '', factor: 2 })).toBe('2× Barlow');
    expect(modifierLabel({ id: 'm', name: '', factor: 0.63 })).toBe('0.63× reducer');
    expect(modifierLabel({ id: 'm', name: 'Powermate', factor: 2.5 })).toBe('Powermate');
  });

  it('labels a combination briefly, without a Barlow or filter when there is none', () => {
    const equipment = activeEquipment(kit, DEFAULT_SELECTION);
    expect(equipmentLabel(equipment)).toBe('130/650 · 25 mm');
  });
});

describe('kit from old settings', () => {
  const old = (telescopeApertureMm: number, eyepieceFocalMm: number): Equipment => ({
    telescopeType: 'newtonian',
    telescopeFocalMm: telescopeApertureMm * 5,
    telescopeApertureMm,
    eyepieceFocalMm,
    eyepieceFieldDeg: 52,
  });

  it('keeps every telescope and eyepiece once, and picks the ones in use', () => {
    const { kit: made, selection } = kitFromOldSettings(old(130, 10), [old(130, 10), old(200, 25), old(130, 25)]);
    expect(made.telescopes.map((t) => t.apertureMm)).toEqual([130, 200]);
    // Eyepieces from the widest to the most powerful.
    expect(made.eyepieces.map((e) => e.focalMm)).toEqual([25, 10]);
    const equipment = activeEquipment(made, selection);
    expect([equipment.telescopeApertureMm, equipment.eyepieceFocalMm]).toEqual([130, 10]);
  });
});
