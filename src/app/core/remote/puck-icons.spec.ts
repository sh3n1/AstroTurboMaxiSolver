import { describe, expect, it } from 'vitest';

import { DISC_RADIUS, ICON_BODIES, KIND_ICONS, circle } from '../catalog/target-icons';
import type { Target } from '../catalog/targets';

import { flattenPath, iconMessage, iconMessages } from './puck-icons';

describe('puck icons', () => {
  it('flattens a circle into points on it, closed', () => {
    const [line] = flattenPath(circle(12, 12, DISC_RADIUS));
    for (const [x, y] of line) expect(Math.hypot(x - 12, y - 12)).toBeCloseTo(DISC_RADIUS, 5);
    expect(line[0]).toEqual(line[line.length - 1]);
    expect(line.length).toBeGreaterThan(16);
  });

  it('follows lines, relative moves and curves to their ends', () => {
    expect(flattenPath('M5.6 9.4H18.4')).toEqual([
      [
        [5.6, 9.4],
        [18.4, 9.4],
      ],
    ]);
    const [curve] = flattenPath('M9 6.2Q12 8 15 6.2');
    expect(curve[curve.length - 1]).toEqual([15, 6.2]);
    const lines = flattenPath('M5.4 13.6H11.4M16.6 13.6H18.6');
    expect(lines).toHaveLength(2);
  });

  it('sends every body with an icon, each small enough for the puck', () => {
    const moon = { id: 'Moon', name: '', kind: 'Moon', body: 'Moon', raDeg: 0, decDeg: 0, mag: -12 } as Target;
    const messages = iconMessages([{ ...moon, phase: { litFraction: 0.3, litOnRight: true } }]);
    expect(messages.map((m) => m.body)).toEqual([...ICON_BODIES, 'Moon', ...Object.keys(KIND_ICONS)]);
    for (const message of messages) {
      expect(message.paths.length).toBeGreaterThan(0);
      expect(JSON.stringify(message).length).toBeLessThan(4000);
      for (const line of message.paths) expect(line.p.length % 2).toBe(0);
    }
  });

  it('keeps dashed and filled lines as they are', () => {
    const message = iconMessage('Test', [
      { d: 'M1 1L2 2', dashed: true },
      { d: circle(5, 5, 1), fill: true },
    ]);
    expect(message.paths[0]).toMatchObject({ dashed: true });
    expect(message.paths[1]).toMatchObject({ fill: true });
  });
});
