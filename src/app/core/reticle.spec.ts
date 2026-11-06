import { chevronSpacingPx, guideAngleDeg, pulseOpacity } from './reticle';

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

describe('guide direction', () => {
  // A target higher in the sky than where the view points.
  const above = { x: 0, y: 1 };
  // A target to the right of where the view points.
  const right = { x: 1, y: 0 };

  it('points up and right on the sky map', () => {
    expect(guideAngleDeg(above.x, above.y, 1, 1, 0)).toBeCloseTo(0, 9);
    expect(guideAngleDeg(right.x, right.y, 1, 1, 0)).toBeCloseTo(90, 9);
  });

  it('points the other way in a Newtonian, which turns the image upside down', () => {
    expect(guideAngleDeg(above.x, above.y, -1, -1, 0)).toBeCloseTo(180, 9);
    expect(guideAngleDeg(right.x, right.y, -1, -1, 0)).toBeCloseTo(270, 9);
  });

  it('swaps left and right with a diagonal, which mirrors the image', () => {
    expect(guideAngleDeg(above.x, above.y, -1, 1, 0)).toBeCloseTo(0, 9);
    expect(guideAngleDeg(right.x, right.y, -1, 1, 0)).toBeCloseTo(270, 9);
  });

  it('turns with the phone on the sky map', () => {
    // Turning the phone anticlockwise puts "up the sky" to the phone's right.
    expect(guideAngleDeg(above.x, above.y, 1, 1, -90)).toBeCloseTo(90, 9);
  });
});
