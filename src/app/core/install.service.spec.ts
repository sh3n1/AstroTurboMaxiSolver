import { describe, expect, it } from 'vitest';

import { isAppleMobile } from './install.service';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

describe('telling iPhones and iPads apart', () => {
  it('knows an iPhone by its name, and an iPad by a Mac with a touch screen', () => {
    expect(isAppleMobile(IPHONE, 'iPhone', 5)).toBe(true);
    expect(isAppleMobile(IPAD_AS_MAC, 'MacIntel', 5)).toBe(true);
  });

  it('leaves out Android phones and real Macs, which have no touch screen', () => {
    expect(isAppleMobile(ANDROID, 'Linux armv8l', 5)).toBe(false);
    expect(isAppleMobile(IPAD_AS_MAC, 'MacIntel', 0)).toBe(false);
  });
});
