import { describe, expect, it } from 'vitest';

import type { Target } from '../catalog/targets';

import { kindCode } from './puck-catalog';
import { objectsMessage } from './puck-objects';

const moon: Target = {
  id: 'Moon',
  name: "Earth's Moon",
  kind: 'Moon',
  raDeg: 10.123456,
  decDeg: 5.5,
  mag: -12.34,
  sizeArcmin: 31,
  body: 'Moon',
  phase: { litFraction: 0.4567, litOnRight: true },
};
const jupiter: Target = {
  id: 'Jupiter',
  name: 'Planet',
  kind: 'Planet',
  raDeg: 100,
  decDeg: 22,
  mag: -2.5,
  body: 'Jupiter',
};
const crab: Target = { id: 'M1', name: 'Crab Nebula', kind: 'Nebula', raDeg: 83.6, decDeg: 22, mag: 8.4 };

describe('puck objects', () => {
  const message = objectsMessage([moon, jupiter, crab], { raDeg: 236.12346, decDeg: -19.9 });

  it('sends only what moves, the fixed objects being in the catalogue', () => {
    expect(message.items.map((item) => item.id)).toEqual(['Moon', 'Jupiter']);
  });

  it('writes each as the puck reads it, rounded', () => {
    expect(message.items[0]).toEqual({
      id: 'Moon',
      label: 'Moon',
      kind: kindCode('Moon'),
      raDeg: 10.1235,
      decDeg: 5.5,
      mag: -12.3,
      sizeArcmin: 31,
      showBelowFieldDeg: 255,
      phase: 0.457,
    });
    expect(message.items[1].phase).toBeUndefined();
    expect(message.items[1].sizeArcmin).toBeNull();
    expect(message.sun).toEqual({ raDeg: 236.1235, decDeg: -19.9 });
  });

  it('stays small enough for one message', () => {
    expect(JSON.stringify(message).length).toBeLessThan(1000);
  });
});
