import { Injectable, effect, inject, signal, untracked } from '@angular/core';

import { AppState } from '../app-state.service';
import { t } from '../i18n/t';

import { decodePuckCode, puckAnswer } from './puck-pairing';

/**
 * Where the puck's link is:
 * - idle: not linked.
 * - connecting: the puck's code read, this phone is reaching it.
 * - connected: linked.
 * - lost: the link was there and dropped.
 */
export type PuckStatus = 'idle' | 'connecting' | 'connected' | 'lost';

/** The control channel, reliable and ordered: JSON messages (docs/puck.md, "Channels"). */
const CONTROL_CHANNEL = 'astroturbomaxisolver';
/** The view's channel: never resent and in any order, since the next view replaces a lost one. */
const VIEW_CHANNEL = 'astroturbomaxisolver-view';
/** At most one view in this time, so a moving phone doesn't flood the link. */
const VIEW_INTERVAL_MS = 50;
/** A view at least this often, even when nothing changes, so the puck knows the link is alive. */
const HEARTBEAT_MS = 1000;

/**
 * The link to the puck, the hand remote (docs/puck.md). It is the puck's own, apart from
 * Two phones (remote.service.ts): this phone keeps working as usual, with its own map,
 * buttons and sensors, and the puck is only a remote over it. A screen phone of two devices
 * can have both links at once.
 */
@Injectable({ providedIn: 'root' })
export class PuckLinkService {
  private readonly state = inject(AppState);

  readonly status = signal<PuckStatus>('idle');
  /** What went wrong, in a few words for the user, or empty. */
  readonly error = signal('');

  private connection: RTCPeerConnection | null = null;
  private control: RTCDataChannel | null = null;
  private view: RTCDataChannel | null = null;
  /** The secret from the puck's code, sent first once the control channel opens. */
  private secret = '';
  private lastViewSent = 0;
  private viewTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;

  constructor() {
    // The view follows where this phone's map points.
    effect(() => {
      this.state.pointing();
      if (this.status() !== 'connected') return;
      untracked(() => this.queueView());
    });
  }

  /** Links to the puck from its code. Its answer is built here (puck-pairing.ts). */
  async start(code: string): Promise<void> {
    let puck;
    try {
      puck = decodePuckCode(code);
    } catch {
      this.error.set(t('remote.couldNotRead'));
      return;
    }
    this.close();
    this.error.set('');
    this.secret = puck.secret;
    // No servers: the puck is on the same network, so the addresses are enough.
    const connection = new RTCPeerConnection({ iceServers: [] });
    this.connection = connection;
    connection.onconnectionstatechange = () => {
      if (connection !== this.connection) return;
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') this.lose();
    };
    const control = connection.createDataChannel(CONTROL_CHANNEL);
    this.control = control;
    control.onopen = () => this.opened();
    control.onclose = () => {
      if (control === this.control) this.lose();
    };
    this.view = connection.createDataChannel(VIEW_CHANNEL, { ordered: false, maxRetransmits: 0 });
    this.status.set('connecting');
    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await connection.setRemoteDescription({ type: 'answer', sdp: puckAnswer(puck, offer.sdp ?? '') });
    } catch {
      this.close();
      this.status.set('idle');
      this.error.set(t('remote.couldNotStart'));
    }
  }

  /** Ends the link, on purpose. Linking again needs the puck's new code. */
  disconnect(): void {
    this.close();
    this.status.set('idle');
    this.error.set('');
  }

  private opened(): void {
    // The puck drops a link whose first message isn't its secret.
    this.sendControl({ t: 'auth', secret: this.secret });
    this.status.set('connected');
    this.heartbeat = setInterval(() => this.sendView(), HEARTBEAT_MS);
    this.sendView();
  }

  private sendControl(message: object): void {
    if (this.control?.readyState === 'open') this.control.send(JSON.stringify(message));
  }

  /** Sends the view now, or as soon as the last one is far enough behind. */
  private queueView(): void {
    const wait = this.lastViewSent + VIEW_INTERVAL_MS - Date.now();
    if (wait <= 0) this.sendView();
    else this.viewTimer ??= setTimeout(() => this.sendView(), wait);
  }

  /**
   * For now, where the map points as a JSON pose, which the puck's test firmware shows.
   * The binary `view` of docs/puck.md replaces it (the puck's TODO, task 5).
   */
  private sendView(): void {
    clearTimeout(this.viewTimer);
    this.viewTimer = undefined;
    this.lastViewSent = Date.now();
    if (this.view?.readyState !== 'open') return;
    this.view.send(JSON.stringify({ t: 'pose', pointing: this.state.pointing() }));
  }

  /** The link dropped without being ended on purpose. */
  private lose(): void {
    if (this.status() !== 'connected' && this.status() !== 'connecting') return;
    this.close();
    this.status.set('lost');
  }

  private close(): void {
    clearTimeout(this.viewTimer);
    clearInterval(this.heartbeat);
    this.viewTimer = undefined;
    const { connection, control, view } = this;
    this.connection = null;
    this.control = null;
    this.view = null;
    this.secret = '';
    control?.close();
    view?.close();
    connection?.close();
  }
}
