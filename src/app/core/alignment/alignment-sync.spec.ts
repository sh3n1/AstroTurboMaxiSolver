import { describe, expect, it } from 'vitest';

import type { Alignment } from '../app-state.service';
import type { Horizontal } from '../astronomy/astronomy';
import { separationDeg } from '../astronomy/astronomy';

import { cameraOffset, telescopePointing } from './alignment';
import { SYNC_LIFETIME_MS, addSync, freshSyncs, offsetFor, syncErrorDeg } from './alignment-sync';

const NOW = new Date('2026-11-17T22:00:00Z');
const later = (minutes: number): Date => new Date(NOW.getTime() + minutes * 60_000);

/**
 * A telescope whose camera sits 2° above the tube, but whose holder bends: in the east the
 * camera sits 2.3° above it. The alignment was made in the south.
 */
const south: Horizontal = { altDeg: 40, azDeg: 180 };
const east: Horizontal = { altDeg: 40, azDeg: 90 };
const cameraFor = (telescope: Horizontal, liftDeg: number): Horizontal => ({
  altDeg: telescope.altDeg + liftDeg,
  azDeg: telescope.azDeg,
});
const aligned: Alignment = {
  starId: 'Vega',
  alignedAt: NOW.toISOString(),
  offset: cameraOffset(cameraFor(south, 2), south),
  position: south,
  method: 'plate-solve',
};

/** Where the app thinks the telescope points, from the camera's direction. */
const pointing = (alignment: Alignment, camera: Horizontal, at = later(1)): Horizontal =>
  telescopePointing(camera, offsetFor(alignment, camera, at));

describe('syncing on a target', () => {
  it('uses the alignment alone until there is a sync', () => {
    expect(offsetFor(aligned, cameraFor(east, 2.3), NOW)).toBe(aligned.offset);
    // In the east the holder bends, so the alignment alone is 0.3° off there.
    expect(syncErrorDeg(aligned, cameraFor(east, 2.3), east, NOW)).toBeCloseTo(0.3, 2);
  });

  it('is exact where it was made, and leaves the alignment in charge far away', () => {
    const synced = addSync(aligned, cameraFor(east, 2.3), east, NOW);
    expect(separationDeg(pointing(synced, cameraFor(east, 2.3)), east)).toBeLessThan(0.01);
    // Close by, it still helps: 1° from the sync, most of the 0.3° is gone.
    const near = { altDeg: 41, azDeg: 90 };
    expect(separationDeg(pointing(synced, cameraFor(near, 2.3)), near)).toBeLessThan(0.05);
    // Back at the alignment star, the alignment still decides.
    expect(separationDeg(pointing(synced, cameraFor(south, 2)), south)).toBeLessThan(0.01);
  });

  it('replaces an older sync in the same part of the sky', () => {
    const first = addSync(aligned, cameraFor(east, 2.5), east, NOW);
    const second = addSync(first, cameraFor(east, 2.3), { altDeg: 40.5, azDeg: 90 }, later(5));
    expect(second.syncs).toHaveLength(1);
    const elsewhere = addSync(second, cameraFor(south, 2), { altDeg: 60, azDeg: 200 }, later(6));
    expect(elsewhere.syncs).toHaveLength(2);
  });

  it('forgets syncs after the night', () => {
    const synced = addSync(aligned, cameraFor(east, 2.3), east, NOW);
    expect(freshSyncs(synced, later(60))).toHaveLength(1);
    const nextDay = new Date(NOW.getTime() + SYNC_LIFETIME_MS + 1);
    expect(freshSyncs(synced, nextDay)).toHaveLength(0);
    expect(offsetFor(synced, cameraFor(east, 2.3), nextDay)).toBe(aligned.offset);
    // And a new sync drops the stale ones.
    expect(addSync(synced, cameraFor(south, 2), south, nextDay).syncs).toHaveLength(1);
  });

  it('works with an alignment saved before its position was kept', () => {
    const old: Alignment = { ...aligned, position: undefined };
    const synced = addSync(old, cameraFor(east, 2.3), east, NOW);
    expect(separationDeg(pointing(synced, cameraFor(east, 2.3)), east)).toBeLessThan(0.02);
  });
});
