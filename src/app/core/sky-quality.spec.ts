import { nakedEyeLimit, telescopeLimit } from './sky-quality';

describe('sky quality', () => {
  it('sees fainter stars under darker skies', () => {
    expect(nakedEyeLimit(1)).toBeGreaterThan(nakedEyeLimit(5));
    expect(nakedEyeLimit(5)).toBeGreaterThan(nakedEyeLimit(9));
  });

  it('keeps the class within 1 to 9', () => {
    expect(nakedEyeLimit(0)).toBe(nakedEyeLimit(1));
    expect(nakedEyeLimit(12)).toBe(nakedEyeLimit(9));
  });

  it('adds 5 magnitudes for each tenfold increase in aperture', () => {
    expect(telescopeLimit(8, 70) - telescopeLimit(8, 7)).toBeCloseTo(5, 1);
  });

  it('gives a sensible figure for a 130 mm telescope in a city', () => {
    expect(telescopeLimit(8, 130)).toBeCloseTo(10.6, 1);
  });

  it('never makes a telescope worse than the naked eye', () => {
    expect(telescopeLimit(8, 3)).toBe(nakedEyeLimit(8));
  });
});
