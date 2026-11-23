import { describe, expect, it } from 'vitest';

import { darkerExposures } from './qr-exposure';

describe('QR scanner exposure', () => {
  it('steps from normal to two stops darker', () => {
    expect(darkerExposures(-3, 3)).toEqual([0, -1, -2]);
  });

  it('stays within what the camera allows', () => {
    expect(darkerExposures(-1.5, 3)).toEqual([0, -1, -1.5]);
    expect(darkerExposures(0, 0)).toEqual([0]);
  });
});
