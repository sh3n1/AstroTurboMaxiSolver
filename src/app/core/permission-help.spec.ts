import { describe, expect, it } from 'vitest';

import { PERMISSION_REASONS, blockedHelp, isPermissionDenied } from './permission-help';

describe('permission help', () => {
  it('says why each permission is needed, in a line', () => {
    for (const { header, message } of Object.values(PERMISSION_REASONS)) {
      expect(header.length).toBeGreaterThan(0);
      expect(message.length).toBeLessThan(110);
    }
  });

  it("points to the phone's Settings app on iPhones, and to Chrome's settings elsewhere", () => {
    expect(blockedHelp('camera', true).steps[0]).toContain('iPhone Settings');
    expect(blockedHelp('location', true).steps.join(' ')).toContain('Location Services');
    expect(blockedHelp('camera', false).header).toBe('Camera is off');
    expect(blockedHelp('location', false).steps[0]).toContain('Chrome');
    expect(blockedHelp('location', false).steps[0]).toContain('Location');
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
