// A cloud drive the user can sync through: Google Drive first, Dropbox and OneDrive later.
// Each drive has its own way of signing in and its own file API; everything else in the app
// works with this interface only, and with SyncStorage for the files, so adding a drive
// means writing one class that implements it, and offering it in Settings.

import type { SyncStorage } from './sync-engine';

/** The drives the app knows, as saved in the settings. */
export type SyncProviderId = 'google' | 'dropbox' | 'onedrive';

export interface SyncProvider {
  readonly id: SyncProviderId;
  /** The drive's name, as shown in Settings, such as "Google Drive". */
  readonly name: string;

  /**
   * Whether files can be read and written now, without asking the user anything. False
   * before signing in, and when the drive's access has run out and needs a tap to renew
   * (Google's lasts an hour in a browser-only app).
   */
  ready(): boolean;

  /**
   * Signs in, or renews access, opening the drive's own window. Must be called from a tap,
   * or the browser blocks the window. Rejects if the user closes it or says no.
   */
  connect(): Promise<void>;

  /** Forgets the access on this device. The files stay on the drive. */
  disconnect(): Promise<void>;

  /** Gets ready ahead of a tap, such as by loading the drive's sign-in script. Optional work. */
  preload(): void;

  /** The app's folder on the drive. Its calls reject with NeedsSignInError when not ready. */
  readonly storage: SyncStorage;
}

/** Thrown by a drive's storage when its access is missing or has run out: a tap must renew it. */
export class NeedsSignInError extends Error {
  constructor(provider: string) {
    super(`${provider} needs signing in again`);
    this.name = 'NeedsSignInError';
  }
}
