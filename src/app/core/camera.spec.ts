import { describe, expect, it } from 'vitest';

import { planCapture } from './camera';

describe('planCapture', () => {
  it('takes one long exposure when the phone allows one', () => {
    expect(planCapture('normal', 1 / 3, 30)).toEqual({ frames: 1, frameSeconds: 1 / 3, manual: true });
  });

  it('stacks short manual exposures to about half a second of light', () => {
    // 1/15 s each: 8 frames make a little over half a second.
    expect(planCapture('normal', 1 / 15, 30)).toEqual({ frames: 8, frameSeconds: 1 / 15, manual: true });
  });

  it('stacks video frames when the phone refuses manual exposure', () => {
    // 1/30 s each would need 15 frames, more than the limit of 12.
    expect(planCapture('normal', null, 30)).toEqual({ frames: 12, frameSeconds: 1 / 30, manual: false });
    // A slow night-time video rate needs fewer frames, but never under 4.
    expect(planCapture('normal', null, 10).frames).toBe(5);
    expect(planCapture('normal', null, 4).frames).toBe(4);
  });

  it('assumes 30 frames a second when the browser reports no rate', () => {
    expect(planCapture('normal', null).frameSeconds).toBeCloseTo(1 / 30);
    expect(planCapture('normal', null, 0).frameSeconds).toBeCloseTo(1 / 30);
  });

  it('forces one frame, however short', () => {
    expect(planCapture('exposure', 1 / 30, 30).frames).toBe(1);
    expect(planCapture('exposure', null, 30)).toEqual({ frames: 1, frameSeconds: 1 / 30, manual: false });
  });

  it('forces a stack, even when a long exposure is allowed', () => {
    expect(planCapture('stack', 1 / 3, 30)).toEqual({ frames: 4, frameSeconds: 1 / 3, manual: true });
    expect(planCapture('stack', null, 30).frames).toBe(12);
  });
});
