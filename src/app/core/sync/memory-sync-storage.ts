// A cloud drive's app folder kept in memory, standing in for a real drive in tests. Several
// devices given the same instance share it, as they would share the user's drive.

import type { SyncStorage } from './sync-engine';

export class MemorySyncStorage implements SyncStorage {
  /** The files, by name. Visible so tests can look at, damage or remove them. */
  readonly files = new Map<string, string>();

  async list(): Promise<string[]> {
    return [...this.files.keys()];
  }

  async read(name: string): Promise<string | null> {
    return this.files.get(name) ?? null;
  }

  async write(name: string, text: string): Promise<void> {
    this.files.set(name, text);
  }
}
