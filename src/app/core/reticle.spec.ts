import { chevronSpacingPx, pulseOpacity } from './reticle';

describe('reticle pulse', () => {
  it('starts fully visible, and fades to its lowest halfway through', () => {
    expect(pulseOpacity(0)).toBeCloseTo(1, 9);
    expect(pulseOpacity(600)).toBeCloseTo(0.25, 9);
  });

  it('repeats', () => {
    expect(pulseOpacity(1200)).toBeCloseTo(1, 9);
    expect(pulseOpacity(1500)).toBeCloseTo(pulseOpacity(300), 9);
  });

  it('never disappears or exceeds full strength', () => {
    for (let t = 0; t < 3000; t += 37) {
      expect(pulseOpacity(t)).toBeGreaterThanOrEqual(0.25);
      expect(pulseOpacity(t)).toBeLessThanOrEqual(1);
    }
  });
});

describe('chevron spacing', () => {
  it('opens up with distance, so far targets look fast and near ones slow', () => {
    expect(chevronSpacingPx(1)).toBeLessThan(chevronSpacingPx(10));
    expect(chevronSpacingPx(10)).toBeLessThan(chevronSpacingPx(25));
  });

  it('stays within readable limits', () => {
    expect(chevronSpacingPx(0)).toBe(3);
    expect(chevronSpacingPx(180)).toBe(18);
  });
});
