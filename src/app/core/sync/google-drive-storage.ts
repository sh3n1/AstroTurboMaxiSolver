// The sync's files in the user's Google Drive, in the app's hidden folder there
// ("appDataFolder"): only this app can see it, and the user can't move or delete its files
// by mistake. Plain calls to Drive's REST API (v3), no library.
//
// Drive names files by id, and allows two files with the same name, so this keeps a map from
// each name to its id. A device only ever writes its own files, so the map stays right.

import type { SyncStorage } from './sync-engine';
import { NeedsSignInError } from './sync-provider';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export class GoogleDriveStorage implements SyncStorage {
  /** Each file's id, by name, as last listed or written. */
  private readonly ids = new Map<string, string>();
  /** Whether the folder has been listed, so an unknown name is a new file, not one not seen yet. */
  private listed = false;

  /**
   * @param token The current access token, or null when there is none or it has run out.
   * @param fetchFn The browser's fetch, or a stand-in in tests.
   */
  constructor(
    private readonly token: () => string | null,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async list(): Promise<string[]> {
    this.ids.clear();
    let pageToken = '';
    do {
      const query = new URLSearchParams({
        spaces: 'appDataFolder',
        fields: 'nextPageToken,files(id,name)',
        pageSize: '1000',
        // The oldest first, so with two files of the same name the first one made is used.
        orderBy: 'createdTime',
      });
      if (pageToken) query.set('pageToken', pageToken);
      const page = (await (await this.request(`${FILES}?${query}`)).json()) as {
        nextPageToken?: string;
        files: { id: string; name: string }[];
      };
      for (const file of page.files) if (!this.ids.has(file.name)) this.ids.set(file.name, file.id);
      pageToken = page.nextPageToken ?? '';
    } while (pageToken);
    this.listed = true;
    return [...this.ids.keys()];
  }

  async read(name: string): Promise<string | null> {
    const id = await this.idOf(name);
    if (!id) return null;
    const response = await this.request(`${FILES}/${id}?alt=media`, {}, [404]);
    if (response.status === 404) {
      this.ids.delete(name);
      return null;
    }
    return response.text();
  }

  async write(name: string, text: string): Promise<void> {
    const id = await this.idOf(name);
    if (id) {
      // Replaces the content of the file already there.
      await this.request(`${UPLOAD}/${id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      return;
    }
    // A new file, in the app's folder: its name and place, then its content, in one request.
    const boundary = `astroturbomaxisolver-${Math.random().toString(36).slice(2)}`;
    const metadata = JSON.stringify({ name, parents: ['appDataFolder'] });
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
    const response = await this.request(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const created = (await response.json()) as { id: string };
    this.ids.set(name, created.id);
  }

  async remove(name: string): Promise<void> {
    const id = await this.idOf(name);
    if (!id) return;
    // Gone already, removed by an earlier try that didn't finish: as good as removed.
    await this.request(`${FILES}/${id}`, { method: 'DELETE' }, [404]);
    this.ids.delete(name);
  }

  /** A file's id, listing the folder the first time a name isn't known. Null for a new file. */
  private async idOf(name: string): Promise<string | null> {
    if (!this.ids.has(name) && !this.listed) await this.list();
    return this.ids.get(name) ?? null;
  }

  /**
   * One request to Drive, signed with the access token. A missing or refused token means a
   * new sign-in; any other failure, apart from the statuses the caller expects, is an error.
   */
  private async request(url: string, init: RequestInit = {}, expected: number[] = []): Promise<Response> {
    const token = this.token();
    if (!token) throw new NeedsSignInError('Google Drive');
    const response = await this.fetchFn(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) throw new NeedsSignInError('Google Drive');
    if (!response.ok && !expected.includes(response.status)) {
      throw new Error(`Google Drive answered ${response.status}`);
    }
    return response;
  }
}
