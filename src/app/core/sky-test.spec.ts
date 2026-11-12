import { looksCovered } from './sky-test';

describe('looksCovered', () => {
  // Levels measured on an Honor Magic5 Pro in central Valencia, in the automatic first step.
  it('spots a covered lens: almost no light and no stars', () => {
    expect(looksCovered({ background: 5.17, starCount: 1 })).toBe(true);
    expect(looksCovered({ background: 5.11, starCount: 0 })).toBe(true);
  });

  it('accepts a city sky, even with few stars', () => {
    expect(looksCovered({ background: 11.42, starCount: 10 })).toBe(false);
    expect(looksCovered({ background: 12, starCount: 0 })).toBe(false);
  });

  it('accepts a dark sky that still shows stars', () => {
    expect(looksCovered({ background: 3, starCount: 25 })).toBe(false);
  });

  it('leaves failed or skipped steps to their own message', () => {
    expect(looksCovered({ background: 0, starCount: 0, error: 'NotReadableError' })).toBe(false);
    expect(looksCovered({ background: 0, starCount: 0, skipped: 'Not offered' })).toBe(false);
  });
});
