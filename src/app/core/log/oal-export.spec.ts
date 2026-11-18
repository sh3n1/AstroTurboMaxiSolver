import { describe, expect, it } from 'vitest';

import type { Target } from '../catalog/targets';
import { DEFAULT_KIT } from '../equipment/equipment';
import type { Equipment } from '../equipment/equipment';

import { exportLogOal, oalFileName } from './oal-export';
import type { LogEntry } from './observing-log';

const EQUIPMENT: Equipment = {
  telescopeType: 'newtonian',
  telescopeFocalMm: 1200,
  telescopeApertureMm: 200,
  eyepieceFocalMm: 25,
  eyepieceFieldDeg: 52,
  filter: 'UHC <narrow>',
};

const entry = (id: string, targetId: string, rating: LogEntry['rating'], time: string, note = ''): LogEntry => ({
  id,
  targetId,
  targetName: targetId,
  time,
  rating,
  tags: rating > 0 ? ['Detail'] : [],
  note,
  conditions: {
    latitudeDeg: 39.47,
    longitudeDeg: -0.38,
    altDeg: 50,
    bortle: 8,
    moonLitPercent: 0,
    moonAltDeg: -10,
    equipment: EQUIPMENT,
  },
});

const TARGETS = new Map<string, Target>([
  [
    'M31',
    { id: 'M31', name: 'Andromeda Galaxy', aliases: 'NGC 224', kind: 'Galaxy', raDeg: 10.68, decDeg: 41.27, mag: 3.4 },
  ],
  ['Jupiter', { id: 'Jupiter', name: 'Jupiter', kind: 'Planet', raDeg: 0, decDeg: 0, mag: -2, body: 'Jupiter' }],
]);

function parse(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

const texts = (doc: Document, tag: string): string[] =>
  [...doc.getElementsByTagName(tag)].map((element) => element.textContent ?? '');

describe('exportLogOal', () => {
  const file = exportLogOal(
    [
      entry('b-2', 'Jupiter', 4, '2026-11-12T22:30:00.000Z', 'Belts & the GRS'),
      entry('a-1', 'M31', 3, '2026-11-12T21:00:00.000Z', 'Dust lane'),
      entry('c-3', 'M31', 0, '2026-11-13T21:00:00.000Z'),
    ],
    TARGETS,
    { name: 'Jose', surname: 'Observer' },
    DEFAULT_KIT,
  );
  const doc = parse(file);

  it('is an OAL 2.1 file with the observer named', () => {
    expect(doc.documentElement.localName).toBe('observations');
    expect(doc.documentElement.getAttribute('version')).toBe('2.1');
    expect(texts(doc, 'name')[0]).toBe('Jose');
    expect(texts(doc, 'surname')).toEqual(['Observer']);
  });

  it('lists each place, target and piece of kit once', () => {
    const inside = (container: string, tag: string): Element[] => [
      ...doc.getElementsByTagName(container)[0].getElementsByTagName(tag),
    ];
    expect(inside('sites', 'site')).toHaveLength(1);
    expect(inside('targets', 'target')).toHaveLength(2);
    expect(inside('scopes', 'scope')).toHaveLength(1);
    expect(inside('filters', 'filter').map((f) => f.getElementsByTagName('model')[0].textContent)).toEqual([
      'UHC <narrow>',
    ]);
  });

  it('gives targets their OAL type, names and, for fixed objects, a position', () => {
    const targets = [...doc.getElementsByTagName('targets')[0].getElementsByTagName('target')];
    const m31 = targets.find((t) => t.getElementsByTagName('name')[0].textContent === 'M31')!;
    expect(m31.getAttribute('xsi:type')).toBe('oal:deepSkyGX');
    expect([...m31.getElementsByTagName('alias')].map((a) => a.textContent)).toEqual(['NGC 224', 'Andromeda Galaxy']);
    expect(m31.getElementsByTagName('ra')[0].textContent).toBe('10.68');
    const jupiter = targets.find((t) => t.getElementsByTagName('name')[0].textContent === 'Jupiter')!;
    expect(jupiter.getAttribute('xsi:type')).toBe('oal:PlanetTargetType');
    expect(jupiter.getElementsByTagName('position')).toHaveLength(0);
  });

  it('writes observations oldest first, rated on the Deep Sky Liste scale', () => {
    const observations = [...doc.getElementsByTagName('observation')];
    expect(observations.map((o) => o.getAttribute('id'))).toEqual(['o_a-1', 'o_b-2', 'o_c-3']);
    // Good is 2, not seen is 7. Jupiter's findings have no deep-sky rating.
    expect(texts(doc, 'rating')).toEqual(['2', '7']);
    expect(texts(doc, 'description')).toEqual(['Dust lane [Detail]', 'Belts & the GRS [Detail]', '']);
    expect(texts(doc, 'magnification')[0]).toBe('48');
    // Bortle 8's naked-eye limit, as the faintest star.
    expect(Number(texts(doc, 'faintestStar')[0])).toBeGreaterThan(3);
  });

  it('names the file with the date', () => {
    expect(oalFileName(new Date(2026, 10, 16))).toBe('astroturbomaxisolver-log-2026-11-16.xml');
  });
});

describe('exportLogOal with details', () => {
  const targets = new Map<string, Target>([
    ['M45', { id: 'M45', name: 'Pleiades', kind: 'Open cluster', raDeg: 56.75, decDeg: 24.12, mag: 1.6 }],
    ['STF 2486', { id: 'STF 2486', name: 'STF 2486', kind: 'Double star', raDeg: 290, decDeg: 49.9, mag: 6.6 }],
  ]);
  const withDetails = (id: string, targetId: string, details: LogEntry['details']): LogEntry => ({
    ...entry(id, targetId, 3, '2026-11-12T21:00:00.000Z'),
    details,
  });
  const doc = parse(
    exportLogOal(
      [
        withDetails('a', 'M45', {
          seeing: 2,
          faintestStar: 4.4,
          sqm: 18.3,
          appearance: ['resolved', 'colorContrasts', 'equalBrightness'],
          sizeArcmin: 110,
          minorArcmin: 90,
        }),
        withDetails('b', 'STF 2486', {
          appearance: ['equalBrightness'],
          colourMain: 'yellow',
          colourCompanion: 'blue',
        }),
      ],
      targets,
      { name: 'A', surname: 'B' },
    ),
  );
  const results = [...doc.getElementsByTagName('result')];

  it('writes the sky as given, instead of the estimate', () => {
    expect(texts(doc, 'seeing')).toEqual(['2']);
    expect(texts(doc, 'faintestStar')[0]).toBe('4.4');
    expect(doc.getElementsByTagName('sky-quality')[0].getAttribute('unit')).toBe('mags-per-squarearcsec');
  });

  it("uses an open cluster's own findings, with only the flags that type has, and the size", () => {
    const cluster = results[0];
    expect(cluster.getAttribute('xsi:type')).toBe('oal:findingsDeepSkyOCType');
    expect(cluster.getAttribute('resolved')).toBe('true');
    expect(cluster.getAttribute('colorContrasts')).toBe('true');
    expect(cluster.getAttribute('equalBrightness')).toBeNull();
    expect(cluster.getElementsByTagName('largeDiameter')[0].textContent).toBe('110');
    expect(cluster.getElementsByTagName('smallDiameter')[0].getAttribute('unit')).toBe('arcmin');
  });

  it("uses a double star's own findings, with its colours", () => {
    const double = results[1];
    expect(double.getAttribute('xsi:type')).toBe('oal:findingsDeepSkyDSType');
    expect(double.getAttribute('equalBrightness')).toBe('true');
    expect(double.getElementsByTagName('colorMain')[0].textContent).toBe('yellow');
    expect(double.getElementsByTagName('colorCompanion')[0].textContent).toBe('blue');
  });
});
