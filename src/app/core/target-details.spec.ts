import {
  constellationName,
  equatorialSeparationDeg,
  hubbleText,
  moonNote,
  objectTypeText,
  otherNames,
  sizeText,
  skyPass,
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

describe('the pass across the sky', () => {
  const hour = 3_600_000;
  const start = new Date('2026-11-08T00:00:00Z');
  const at = (hours: number) => new Date(start.getTime() + hours * hour);
  // A height that rises at 2 h, is highest at 50° at 8 h and sets at 14 h, once a day.
  const wave = (time: Date) => {
    const hours = (time.getTime() - start.getTime()) / hour;
    return 50 * Math.sin(((hours - 2) / 12) * Math.PI);
  };
  const near = (date: Date | null, hours: number) =>
    expect(Math.abs(date!.getTime() - at(hours).getTime())).toBeLessThanOrEqual(5 * 60_000);

  it('gives the pass it is on, when up now', () => {
    const pass = skyPass(wave, at(5));
    near(pass.rise, 2);
    near(pass.highest!.time, 8);
    expect(pass.highest!.altDeg).toBeCloseTo(50, 0);
    near(pass.set, 14);
  });

  it('gives the next pass, when down now', () => {
    const pass = skyPass(wave, at(16));
    near(pass.rise, 26);
    near(pass.highest!.time, 32);
    near(pass.set, 38);
  });

  it('says when it never sets, or never rises', () => {
    const circumpolar = skyPass(() => 30, at(0));
    expect(circumpolar.rise).toBeNull();
    expect(circumpolar.set).toBeNull();
    expect(circumpolar.highest?.altDeg).toBe(30);
    expect(skyPass(() => -10, at(0))).toEqual({ rise: null, highest: null, set: null });
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
