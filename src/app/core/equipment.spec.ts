import type { Equipment } from './equipment';
import { equipmentLabel, rememberEquipment } from './equipment';

const setup = (eyepieceFocalMm: number): Equipment => ({
  telescopeType: 'newtonian',
  telescopeFocalMm: 650,
  telescopeApertureMm: 130,
  eyepieceFocalMm,
  eyepieceFieldDeg: 52,
});

describe('recent equipment', () => {
  it('puts the newest combination first', () => {
    const recent = rememberEquipment([setup(25)], setup(10));
    expect(recent.map((e) => e.eyepieceFocalMm)).toEqual([10, 25]);
  });

  it('moves a repeated combination to the front instead of listing it twice', () => {
    const recent = rememberEquipment([setup(10), setup(25)], setup(25));
    expect(recent.map((e) => e.eyepieceFocalMm)).toEqual([25, 10]);
  });

  it('keeps only five', () => {
    let recent: Equipment[] = [];
    for (const focal of [32, 25, 20, 15, 10, 6]) recent = rememberEquipment(recent, setup(focal));
    expect(recent.map((e) => e.eyepieceFocalMm)).toEqual([6, 10, 15, 20, 25]);
  });

  it('keeps only equipment fields, even if given more', () => {
    const recent = rememberEquipment([], { ...setup(25), nightMode: true } as Equipment);
    expect(Object.keys(recent[0])).not.toContain('nightMode');
  });

  it('labels a combination briefly', () => {
    expect(equipmentLabel(setup(25))).toBe('130/650 · 25 mm');
  });
});
