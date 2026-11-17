import { describe, expect, it } from 'vitest';

import { GoogleDriveProvider } from './google-drive-provider';
import type { GoogleOAuth2 } from './google-drive-provider';
import { GoogleDriveStorage } from './google-drive-storage';
import { NeedsSignInError } from './sync-provider';

/**
 * Google Drive's app folder, as far as the sync uses it, answering fetch calls from memory.
 * Lists in pages of two, to check paging. Counts the requests, and the token they carried.
 */
class FakeDrive {
  readonly files: { id: string; name: string; text: string }[] = [];
  readonly requests: string[] = [];
  tokenSeen = '';
  refuse = false;
  private nextId = 1;

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    this.requests.push(`${method} ${url.pathname}`);
    this.tokenSeen = (init?.headers as Record<string, string>)['Authorization'];
    if (this.refuse) return new Response('', { status: 401 });

    if (method === 'GET' && url.pathname === '/drive/v3/files') {
      const start = Number(url.searchParams.get('pageToken') ?? 0);
      const page = this.files.slice(start, start + 2).map(({ id, name }) => ({ id, name }));
      const next = start + 2 < this.files.length ? { nextPageToken: String(start + 2) } : {};
      return Response.json({ files: page, ...next });
    }
    const id = url.pathname.split('/').pop()!;
    const file = this.files.find((f) => f.id === id);
    if (method === 'GET') return file ? new Response(file.text) : new Response('', { status: 404 });
    if (method === 'PATCH') {
      file!.text = String(init!.body);
      return Response.json({ id });
    }
    // A new file: the name from the metadata part, the content from the second part.
    const parts = String(init!.body).split(/--astroturbomaxisolver-\w+/);
    const metadata = JSON.parse(parts[1].split('\r\n\r\n')[1]) as { name: string; parents: string[] };
    expect(metadata.parents).toEqual(['appDataFolder']);
    const created = { id: `id${this.nextId++}`, name: metadata.name, text: parts[2].split('\r\n\r\n')[1].trimEnd() };
    this.files.push(created);
    return Response.json({ id: created.id });
  };
}

describe('Google Drive storage', () => {
  it('lists every page, reads files, and creates then replaces its own', async () => {
    const drive = new FakeDrive();
    drive.files.push(
      { id: 'a', name: 'one.json', text: '1' },
      { id: 'b', name: 'two.json', text: '2' },
      { id: 'c', name: 'three.json', text: '3' },
    );
    const storage = new GoogleDriveStorage(() => 'token-1', drive.fetch);

    expect(await storage.list()).toEqual(['one.json', 'two.json', 'three.json']);
    expect(await storage.read('three.json')).toBe('3');
    expect(await storage.read('missing.json')).toBeNull();
    expect(drive.tokenSeen).toBe('Bearer token-1');

    await storage.write('mine.json', '{"seq":1}');
    await storage.write('mine.json', '{"seq":2}');
    expect(drive.files.filter((f) => f.name === 'mine.json').map((f) => f.text)).toEqual(['{"seq":2}']);
    expect(drive.requests.filter((r) => r.startsWith('POST'))).toHaveLength(1);
    expect(drive.requests.filter((r) => r.startsWith('PATCH'))).toHaveLength(1);
  });

  it('asks for a new sign-in when there is no token, or Drive refuses it', async () => {
    const drive = new FakeDrive();
    await expect(new GoogleDriveStorage(() => null, drive.fetch).list()).rejects.toBeInstanceOf(NeedsSignInError);
    expect(drive.requests).toEqual([]);
    drive.refuse = true;
    await expect(new GoogleDriveStorage(() => 'old', drive.fetch).list()).rejects.toBeInstanceOf(NeedsSignInError);
  });
});

describe('Google Drive sign-in', () => {
  /** Google's sign-in, giving a token, or failing as when the user closes the window. */
  function fakeGoogle(answer: 'token' | 'closed'): GoogleOAuth2 & { revoked: string[] } {
    const revoked: string[] = [];
    return {
      revoked,
      initTokenClient: (config) => ({
        requestAccessToken: () =>
          answer === 'token'
            ? config.callback({ access_token: 'abc', expires_in: 3600 })
            : config.error_callback?.({ type: 'popup_closed' }),
      }),
      revoke: (token) => revoked.push(token),
    };
  }

  it('is ready once signed in, until it disconnects, which gives the access back', async () => {
    const google = fakeGoogle('token');
    const provider = new GoogleDriveProvider('client', async () => google);
    expect(provider.ready()).toBe(false);
    await provider.connect();
    expect(provider.ready()).toBe(true);
    await provider.disconnect();
    expect(provider.ready()).toBe(false);
    expect(google.revoked).toEqual(['abc']);
  });

  it('stays not ready when the user closes Google’s window', async () => {
    const provider = new GoogleDriveProvider('client', async () => fakeGoogle('closed'));
    await expect(provider.connect()).rejects.toThrow('popup_closed');
    expect(provider.ready()).toBe(false);
  });
});
