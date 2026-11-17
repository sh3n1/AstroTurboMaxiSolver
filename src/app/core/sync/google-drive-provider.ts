// Google Drive as a sync drive (see sync-provider.ts). Signing in uses Google Identity
// Services' token flow, Google's own script, loaded from accounts.google.com only once Drive
// is connected or being connected. With no server of ours, Google gives an access token that
// lasts an hour and no way to renew it quietly: after that, a tap renews it, and as the user
// already agreed, Google's window opens and closes by itself. The token is kept in memory only.

import { GoogleDriveStorage } from './google-drive-storage';
import type { SyncProvider } from './sync-provider';

/** Google's sign-in script. */
const GIS_URL = 'https://accounts.google.com/gsi/client';

/** Only the app's own hidden folder in the user's Drive: none of their files. */
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** A token is renewed this long before Google says it runs out, so a sync never starts on one about to. */
const MARGIN_MS = 60_000;

/** The parts of Google's script used here. */
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}
export interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string }) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
}

/** Loads Google's script once, and gives its OAuth part. */
let loading: Promise<GoogleOAuth2> | null = null;
export function loadGoogleOAuth2(): Promise<GoogleOAuth2> {
  return (loading ??= new Promise<GoogleOAuth2>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_URL;
    script.async = true;
    script.onload = () => {
      const oauth2 = (window as unknown as { google?: { accounts?: { oauth2?: GoogleOAuth2 } } }).google?.accounts
        ?.oauth2;
      if (oauth2) resolve(oauth2);
      else reject(new Error('Google sign-in did not load'));
    };
    script.onerror = () => {
      loading = null; // Offline, perhaps: try again next time.
      reject(new Error('Google sign-in could not be reached'));
    };
    document.head.appendChild(script);
  }));
}

export class GoogleDriveProvider implements SyncProvider {
  readonly id = 'google' as const;
  readonly name = 'Google Drive';
  readonly storage: GoogleDriveStorage;

  private token: { value: string; expiresAt: number } | null = null;

  /**
   * @param clientId The app's OAuth client, from sync-config.ts.
   * @param load Gives Google's sign-in, or a stand-in in tests.
   * @param fetchFn The browser's fetch, or a stand-in in tests.
   */
  constructor(
    private readonly clientId: string,
    private readonly load: () => Promise<GoogleOAuth2> = loadGoogleOAuth2,
    fetchFn?: typeof fetch,
  ) {
    this.storage = new GoogleDriveStorage(() => this.validToken(), fetchFn);
  }

  ready(): boolean {
    return this.validToken() !== null;
  }

  /** Loads Google's script ahead of a tap, so the sign-in window opens straight away then. */
  preload(): void {
    this.load().catch(() => undefined);
  }

  async connect(): Promise<void> {
    const oauth2 = await this.load();
    const response = await new Promise<TokenResponse>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPE,
        callback: resolve,
        // The window was closed, or the browser blocked it.
        error_callback: (error) => reject(new Error(error.type)),
      });
      // Asks only what it must: nothing at all once the user has agreed.
      client.requestAccessToken({ prompt: '' });
    });
    if (!response.access_token || response.error) throw new Error(response.error ?? 'No access from Google');
    this.token = { value: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 };
  }

  async disconnect(): Promise<void> {
    const token = this.token?.value;
    this.token = null;
    if (!token) return;
    try {
      (await this.load()).revoke(token);
    } catch {
      // Offline: the token runs out within the hour anyway.
    }
  }

  /** The access token, unless there is none or it is about to run out. */
  private validToken(): string | null {
    return this.token && Date.now() < this.token.expiresAt - MARGIN_MS ? this.token.value : null;
  }
}
