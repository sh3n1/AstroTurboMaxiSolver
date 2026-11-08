import { equatorialVector } from './astronomy';
import { RETICLE_RADIUS_DEG, chevronSpacingPx, guideAngleDeg, insideReticle, pulseOpacity } from './reticle';

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

describe('what is inside the reticle', () => {
  // Objects along the celestial equator, at these distances in degrees from RA 0.
  const at = (raDeg: number) => ({ item: `${raDeg}°`, vector: equatorialVector(raDeg, 0) });
  const centre = equatorialVector(0, 0);

  it('reaches out to the outer ring, which is 4° across', () => {
    expect(RETICLE_RADIUS_DEG).toBe(2);
    expect(insideReticle([at(1.99), at(2.01)], centre)).toEqual(['1.99°']);
  });

  it('puts the nearest the centre first, on either side', () => {
    expect(insideReticle([at(1.5), at(359.9), at(0.6), at(30)], centre)).toEqual(['359.9°', '0.6°', '1.5°']);
  });

  it('measures true angles, so it works near the pole too', () => {
    // At Dec 89°, 180° of right ascension apart is only 2° of sky, and 1.5° apart is less.
    const pole = equatorialVector(0, 89);
    const items = [
      { item: 'across the pole', vector: equatorialVector(180, 89.5) },
      { item: 'too far', vector: equatorialVector(180, 88) },
    ];
    expect(insideReticle(items, pole)).toEqual(['across the pole']);
  });
});
