import { describe, expect, it } from 'vitest';

import { litOnRight, solarSystemPosition } from './astronomy';
import { iconDataUrl, phaseIcon, targetIcon } from './target-icons';
import type { Target } from './targets';
import { SOLAR_SYSTEM_BODIES } from './targets';

const VALENCIA = { lat: 39.47, lon: -0.38 };

function target(changes: Partial<Target>): Target {
  return { id: 'X', name: 'X', kind: 'Other', raDeg: 0, decDeg: 0, mag: 5, ...changes };
}

describe('target icons', () => {
  it('gives every planet its own icon', () => {
    const icons = SOLAR_SYSTEM_BODIES.filter((body) => body !== 'Moon').map((body) =>
      targetIcon(target({ kind: 'Planet', body })),
    );
    for (const icon of icons) expect(icon?.length).toBeGreaterThan(0);
    // No two planets share a drawing.
    expect(new Set(icons.map((icon) => JSON.stringify(icon))).size).toBe(icons.length);
  });

  it('has its own icons for galaxies and nebulae, and leaves the rest to standard icons', () => {
    expect(targetIcon(target({ kind: 'Galaxy' }))).not.toBeNull();
    expect(targetIcon(target({ kind: 'Nebula' }))).not.toBeNull();
    expect(targetIcon(target({ kind: 'Star' }))).toBeNull();
    expect(targetIcon(target({ kind: 'Open cluster' }))).toBeNull();
  });

  it('draws a phase from the target, for the Moon and Venus', () => {
    const moon = target({ kind: 'Moon', body: 'Moon', phase: { litFraction: 0.3, litOnRight: true } });
    expect(targetIcon(moon)).toEqual(phaseIcon(0.3, true));
  });

  it('makes an SVG image that ion-icon can show in the text colour', () => {
    const url = iconDataUrl(targetIcon(target({ kind: 'Galaxy' }))!);
    expect(url.startsWith('data:image/svg+xml;utf8,<svg')).toBe(true);
    expect(url).toContain('class="ionicon"');
    expect(url).toContain('fill="none"');
  });
});

describe('phase icons', () => {
  it('shows only the dashed outline at new moon', () => {
    expect(phaseIcon(0, true)).toEqual([expect.objectContaining({ dashed: true })]);
  });

  it('fills the lit part, and puts it on the side asked for', () => {
    const [, right] = phaseIcon(0.25, true);
    const [, left] = phaseIcon(0.25, false);
    expect(right.fill).toBe(true);
    expect(right.d).not.toBe(left.d);
  });

  it('bulges the terminator the other way once past half', () => {
    // The last arc flag is the terminator's turning direction.
    const sweep = (d: string): string => /A[^A]* 0 0 (\d) [^A]*Z$/.exec(d)![1];
    expect(sweep(phaseIcon(0.25, true)[1].d)).not.toBe(sweep(phaseIcon(0.75, true)[1].d));
  });
});

describe('phases from the sky', () => {
  it('finds the Moon fully lit at a full moon', () => {
    // A full moon, 13 January 2025 at 22:27 UTC.
    const { litFraction } = solarSystemPosition('Moon', new Date('2025-01-13T22:27:00Z'), VALENCIA.lat, VALENCIA.lon);
    expect(litFraction).toBeGreaterThan(0.99);
  });

  it('lights the side facing the Sun, which depends on the hemisphere', () => {
    // An evening Moon is east of the Sun, at a larger right ascension.
    expect(litOnRight(60, 20, VALENCIA.lat)).toBe(true);
    expect(litOnRight(60, 20, -33.9)).toBe(false);
    // A morning Moon is west of the Sun. This also checks the wrap past 0h.
    expect(litOnRight(350, 20, VALENCIA.lat)).toBe(false);
  });
});
