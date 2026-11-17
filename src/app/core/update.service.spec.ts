import { TestBed } from '@angular/core/testing';
import type { UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { UpdateService } from './update.service';

/** A service worker that the test tells what happens. */
function fakeWorker(isEnabled = true) {
  return {
    isEnabled,
    versionUpdates: new Subject<VersionEvent>(),
    unrecoverable: new Subject<UnrecoverableStateEvent>(),
    checkForUpdate: vi.fn(async () => false),
    activateUpdate: vi.fn(async () => true),
  };
}

function setUp(worker: ReturnType<typeof fakeWorker>): UpdateService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: worker }] });
  return TestBed.inject(UpdateService);
}

const version = { hash: 'a', appData: {} };

describe('new versions of the app', () => {
  it('offers the new version once it is downloaded, not while it is only found', () => {
    const worker = fakeWorker();
    const updates = setUp(worker);
    expect(updates.ready()).toBe(false);
    worker.versionUpdates.next({ type: 'VERSION_DETECTED', version });
    expect(updates.ready()).toBe(false);
    worker.versionUpdates.next({ type: 'VERSION_READY', currentVersion: version, latestVersion: version });
    expect(updates.ready()).toBe(true);
  });

  it('offers a reload when the version kept offline is broken', () => {
    const worker = fakeWorker();
    const updates = setUp(worker);
    worker.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'missing files' });
    expect(updates.ready()).toBe(true);
  });

  it('switches to it and reloads, even if the service worker fails to switch', async () => {
    const worker = fakeWorker();
    worker.activateUpdate.mockRejectedValueOnce(new Error('gone'));
    const updates = setUp(worker);
    const reload = vi.spyOn(updates as unknown as { reload: () => void }, 'reload').mockImplementation(() => {});
    await updates.apply();
    expect(worker.activateUpdate).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it('offers nothing without a service worker, as under the dev server', () => {
    const worker = fakeWorker(false);
    const updates = setUp(worker);
    worker.versionUpdates.next({ type: 'VERSION_READY', currentVersion: version, latestVersion: version });
    expect(updates.ready()).toBe(false);
  });
});
