import { describe, expect, it } from 'vitest';

import { PERMISSION_REASONS, blockedHelp, deviceKind, isPermissionDenied } from './permission-help';

describe('permission help', () => {
  it('says why each permission is needed, in a line', () => {
    for (const { header, message } of Object.values(PERMISSION_REASONS)) {
      expect(header.length).toBeGreaterThan(0);
      expect(message.length).toBeLessThan(110);
    }
  });

  it("points to each device's own settings: iPhone Settings, Chrome's site settings, or the address bar", () => {
    expect(blockedHelp('camera', 'apple').steps[0]).toContain('iPhone Settings');
    expect(blockedHelp('location', 'apple').steps.join(' ')).toContain('Location Services');
    expect(blockedHelp('camera', 'android').header).toBe('Camera is off');
    expect(blockedHelp('camera', 'android').steps[0]).toBe('In Chrome: ⋮ › Settings › Site settings › Camera');
    // Android's own location switch, for every app, is mentioned too.
    expect(blockedHelp('location', 'android').steps.join(' ')).toContain('Android Settings');
    expect(blockedHelp('location', 'desktop').steps[0]).toContain('left of the address');
  });

  it('tells iPhones, Android phones and computers apart', () => {
    expect(deviceKind('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', 'iPhone', 5)).toBe('apple');
    expect(deviceKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe('apple');
    expect(deviceKind('Mozilla/5.0 (Linux; Android 14; Pixel 7)', 'Linux armv8l', 5)).toBe('android');
    expect(deviceKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0)).toBe('desktop');
  });

  it('tells a refusal apart from a missing camera or no GPS signal', () => {
    expect(isPermissionDenied(new DOMException('denied', 'NotAllowedError'))).toBe(true);
    expect(isPermissionDenied({ code: 1, message: 'User denied Geolocation' })).toBe(true);
    expect(isPermissionDenied(new DOMException('no camera', 'NotFoundError'))).toBe(false);
    expect(isPermissionDenied({ code: 3, message: 'Timeout expired' })).toBe(false);
    expect(isPermissionDenied(new Error('Camera busy'))).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
  });
});
