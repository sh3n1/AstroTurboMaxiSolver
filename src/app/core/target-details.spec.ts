import {
  constellationName,
  equatorialSeparationDeg,
  hubbleText,
  moonNote,
  nightPlan,
  objectTypeText,
  otherNames,
  sizeText,
  starColourName,
} from './target-details';
import type { Target } from './targets';

const target = (fields: Partial<Target>): Target => ({
  id: 'X',
  name: 'X',
  kind: 'Galaxy',
  raDeg: 0,
  decDeg: 0,
  mag: 5,
  ...fields,
});

describe('object types in words', () => {
  it('reads Hubble codes, keeping the code where it adds detail', () => {
    expect(hubbleText('SBb')).toBe('Barred spiral galaxy (SBb)');
    expect(hubbleText('SABc')).toBe('Weakly barred spiral galaxy (SABc)');
    expect(hubbleText('Sbc')).toBe('Spiral galaxy (Sbc)');
    expect(hubbleText('S0-a')).toBe('Lenticular galaxy (S0-a)');
    expect(hubbleText('E-S0')).toBe('Elliptical or lenticular galaxy (E-S0)');
    expect(hubbleText('IB')).toBe('Irregular galaxy (IB)');
    // Messier's plain codes say nothing more than the words.
    expect(hubbleText('S')).toBe('Spiral galaxy');
    expect(hubbleText('E')).toBe('Elliptical galaxy');
  });

  it('names star colours from blue-white Rigel to red Antares', () => {
    expect(starColourName(-0.235)).toBe('Blue'); // Spica
    expect(starColourName(-0.03)).toBe('Blue-white'); // Rigel
    expect(starColourName(0.009)).toBe('White'); // Sirius
    expect(starColourName(0.42)).toBe('Yellow-white'); // Procyon
    expect(starColourName(0.65)).toBe('Yellow'); // like the Sun
    expect(starColourName(1.239)).toBe('Orange'); // Arcturus
    expect(starColourName(1.5)).toBe('Orange-red'); // Betelgeuse
    expect(starColourName(1.865)).toBe('Red'); // Antares
  });

  it('says what each object is, as specifically as the catalogues allow', () => {
    expect(objectTypeText(target({ kind: 'Nebula', type: 'PN' }))).toBe('Planetary nebula');
    expect(objectTypeText(target({ kind: 'Nebula', type: 'HII' }))).toBe('Star-forming nebula');
    expect(objectTypeText(target({ kind: 'Galaxy', type: 'GPair', hubble: 'Sc' }))).toBe('Galaxy pair');
    expect(objectTypeText(target({ kind: 'Galaxy', hubble: 'SBb' }))).toBe('Barred spiral galaxy (SBb)');
    expect(objectTypeText(target({ kind: 'Star', bv: 1.5 }))).toBe('Orange-red star');
    expect(objectTypeText(target({ kind: 'Star' }))).toBe('Star');
    expect(objectTypeText(target({ kind: 'Globular cluster' }))).toBe('Globular cluster');
  });
});

describe('object sizes', () => {
  it('gives both sides of an oval object', () => {
    expect(sizeText({ sizeArcmin: 66, minorArcmin: 60 })).toBe('66′ × 60′');
    expect(sizeText({ sizeArcmin: 4.5, minorArcmin: 0.5 })).toBe('4.5′ × 30″');
  });

  it('gives one size for a round object, and none when unknown', () => {
    expect(sizeText({ sizeArcmin: 13 })).toBe('13′ across');
    expect(sizeText({ sizeArcmin: 8, minorArcmin: 8 })).toBe('8′ across');
    expect(sizeText({})).toBeNull();
  });
});

describe('constellations', () => {
  it('finds the constellation by the official boundaries', () => {
    expect(constellationName(83.82, -5.39)).toBe('Orion'); // M42
    expect(constellationName(10.68, 41.27)).toBe('Andromeda'); // M31
    expect(constellationName(279.23, 38.78)).toBe('Lyra'); // Vega
  });
});

describe('other names', () => {
  it('leaves out the names the heading already shows', () => {
    expect(otherNames('NGC 1976 Orion Nebula', ['M42', 'NGC 1976', 'Orion Nebula'])).toBe('');
    expect(otherNames('HIP 32349', ['Sirius', 'α CMa'])).toBe('HIP 32349');
    expect(otherNames('C20 North America Nebula Pelican', ['C20', 'NGC 7000', 'North America Nebula'])).toBe('Pelican');
    expect(otherNames(undefined, ['M1'])).toBe('');
  });

  it('measures angles between catalogue positions', () => {
    expect(equatorialSeparationDeg({ raDeg: 10, decDeg: 0 }, { raDeg: 40, decDeg: 0 })).toBeCloseTo(30, 9);
    expect(equatorialSeparationDeg({ raDeg: 0, decDeg: 89 }, { raDeg: 180, decDeg: 89 })).toBeCloseTo(2, 9);
  });
});

describe("tonight's plan", () => {
  const hour = 3_600_000;
  const start = new Date('2026-11-08T18:00:00Z');
  const at = (hours: number) => new Date(start.getTime() + hours * hour);
  // A height that rises at 20:00, peaks at 50° at 02:00 and sets at 08:00, in a day-long wave.
  const wave = (time: Date) => {
    const hours = (time.getTime() - start.getTime()) / hour;
    return 50 * Math.sin(((hours - 2) / 12) * Math.PI);
  };

  it('finds the rise, the best time in darkness and the set', () => {
    const plan = nightPlan(wave, at(1), at(12));
    expect(Math.abs(plan.best!.time.getTime() - at(8).getTime())).toBeLessThanOrEqual(5 * 60_000);
    expect(plan.best!.altDeg).toBeCloseTo(50, 0);
    expect(Math.abs(plan.rise!.getTime() - at(2).getTime())).toBeLessThan(2 * 60_000);
    expect(Math.abs(plan.set!.getTime() - at(14).getTime())).toBeLessThan(2 * 60_000);
  });

  it('uses the highest moment of darkness when it peaks in daylight', () => {
    // Darkness from 11 to 13 hours: falling all the time, so best at the start.
    const plan = nightPlan(wave, at(11), at(13));
    expect(plan.best!.time.getTime()).toBe(at(11).getTime());
  });

  it('says when it never rises during darkness, or never sets', () => {
    expect(nightPlan(() => -10, at(0), at(10))).toEqual({ rise: null, best: null, set: null });
    const circumpolar = nightPlan(() => 30, at(0), at(10));
    expect(circumpolar.rise).toBeNull();
    expect(circumpolar.set).toBeNull();
    expect(circumpolar.best?.altDeg).toBe(30);
  });
});

describe('the Moon note', () => {
  it('warns when a bright Moon is close', () => {
    expect(moonNote(15, 30, 0.85)).toEqual({
      text: 'Bright Moon 15° away, 85% lit: faint detail will be hard to see',
      warn: true,
    });
  });

  it('only informs when the Moon is far, thin or down', () => {
    expect(moonNote(90, 30, 0.85)).toEqual({ text: 'Moon 90° away, 85% lit', warn: false });
    expect(moonNote(15, 30, 0.1).warn).toBe(false);
    expect(moonNote(15, -5, 0.9)).toEqual({ text: 'Moon below the horizon now', warn: false });
  });
});
