import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { ToastController } from '@ionic/angular';

import { AppState } from '../app-state.service';
import { t } from '../i18n/t';
import { PlaylistService } from '../lists/playlist.service';
import { MapViewService } from '../sky-map/map-view.service';
import { LiveSolverService } from '../solver/live-solver.service';

import { catalogParts } from './puck-catalog';
import { PuckCatalogService } from './puck-catalog.service';
import { parsePuckMessage, textsMessage } from './puck-messages';
import type { PuckHostMessage, PuckMessage } from './puck-messages';
import { objectsMessage } from './puck-objects';
import { decodePuckCode, puckAnswer } from './puck-pairing';
import { encodeView } from './puck-view';

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
/** The catalogue's channel, reliable and ordered, apart so it doesn't hold back control messages. */
const CATALOG_CHANNEL = 'astroturbomaxisolver-catalog';
/** Parts are queued on the channel while this much at most is waiting to go. */
const CATALOG_BUFFER_BYTES = 256 * 1024;
/** How often to look for a new frame of the map to send: about 30 a second. */
const VIEW_INTERVAL_MS = 33;
/**
 * Keeping the link alive (docs/puck.md): each side sends at least one message a second, so
 * silence for longer than the limit means the link is lost, long before WebRTC notices.
 */
const HEARTBEAT_MS = 1000;
const SILENCE_LIMIT_MS = 4000;

/**
 * The link to the puck, the hand remote (docs/puck.md). It is the puck's own, apart from
 * Two phones (remote.service.ts): this phone keeps working as usual, with its own map,
 * buttons and sensors, and the puck is only a remote over it. A screen phone of two devices
 * can have both links at once.
 */
@Injectable({ providedIn: 'root' })
export class PuckLinkService {
  private readonly state = inject(AppState);
  private readonly mapView = inject(MapViewService);
  private readonly liveSolver = inject(LiveSolverService);
  private readonly playlist = inject(PlaylistService);
  private readonly toasts = inject(ToastController);
  private readonly catalogs = inject(PuckCatalogService);

  readonly status = signal<PuckStatus>('idle');
  /** What went wrong, in a few words for the user, or empty. */
  readonly error = signal('');

  private connection: RTCPeerConnection | null = null;
  private control: RTCDataChannel | null = null;
  private view: RTCDataChannel | null = null;
  private catalog: RTCDataChannel | null = null;
  /** A catalogue the puck failed to take is sent once more, not for ever. */
  private catalogRetried = false;
  /** The secret from the puck's code, sent first once the control channel opens. */
  private secret = '';
  private viewTimer?: ReturnType<typeof setInterval>;
  /** The map's frame last sent, when it was sent, and the views' count. */
  private lastFrame = 0;
  private lastViewSent = 0;
  /** When anything was last sent to the puck, and last heard from it. */
  private lastSent = 0;
  private lastHeard = 0;
  private viewSeq = 0;
  private openedAt = 0;

  constructor() {
    // The target's name, for the puck's bottom third, on every change.
    effect(() => {
      const target = this.state.selectedTarget();
      if (this.status() !== 'connected') return;
      untracked(() => this.sendControl({ t: 'targetInfo', id: target?.id ?? null, name: target?.name ?? '' }));
    });
    // What moves (the Moon, planets): once linked, and as the app's list moves them, once a minute.
    effect(() => {
      const message = objectsMessage(this.state.targets(), this.state.sunEquatorial());
      if (this.status() !== 'connected') return;
      untracked(() => this.sendControl(message));
    });
    // What the puck shows besides the map, on every change.
    effect(() => {
      this.state.settings();
      this.state.plateSolving();
      this.state.sensorsActive();
      this.state.alignment();
      this.state.trueField();
      if (this.status() !== 'connected') return;
      untracked(() => this.sendState());
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
    control.onmessage = (event) => {
      // Anything at all, a ping included, shows the puck is still there.
      this.lastHeard = Date.now();
      const message = parsePuckMessage(String(event.data));
      if (message && control === this.control) this.obey(message);
    };
    this.view = connection.createDataChannel(VIEW_CHANNEL, { ordered: false, maxRetransmits: 0 });
    this.catalog = connection.createDataChannel(CATALOG_CHANNEL);
    this.catalog.binaryType = 'arraybuffer';
    this.catalogRetried = false;
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
    // The words the puck shows, in this phone's language. The language is set as the app
    // starts, so once a link is enough.
    this.sendControl(textsMessage((key) => t(key)));
    this.openedAt = this.lastHeard = Date.now();
    this.lastFrame = 0;
    this.viewSeq = 0;
    // Setting the status sends targetInfo and state, through the effects above.
    this.status.set('connected');
    this.viewTimer = setInterval(() => this.tick(), VIEW_INTERVAL_MS);
  }

  /** About 30 times a second: the newest view, a heartbeat if needed, and the silence check. */
  private tick(): void {
    const now = Date.now();
    if (now - this.lastHeard > SILENCE_LIMIT_MS) {
      this.lose();
      return;
    }
    this.sendView(now);
    // Before the map has drawn a frame there is no view to send, so the state goes instead.
    if (now - this.lastSent >= HEARTBEAT_MS) this.sendState();
  }

  private sendState(): void {
    this.sendControl({
      t: 'state',
      night: this.state.settings().nightMode,
      solving: this.state.plateSolving(),
      sensorsOn: this.state.sensorsActive(),
      aligned: this.state.alignment() !== null,
      eyepieceFieldDeg: this.state.trueField(),
    });
  }

  /** A message from the puck: its commands are done as this phone's own buttons would. */
  private obey(command: PuckMessage): void {
    switch (command.t) {
      case 'puckHello':
        void this.sendCatalog(command.catalog);
        break;
      case 'catalogFailed':
        // Once more, in case a part was spoilt on the way.
        if (!this.catalogRetried) {
          this.catalogRetried = true;
          void this.sendCatalog(null);
        }
        break;
      case 'solveNow':
        // As a tap on the rings: one at a time. In Two phones, the finder solves.
        if (!this.state.plateSolving()) void this.liveSolver.solveNow('tap');
        break;
      case 'step':
        if (command.by > 0) this.playlist.next();
        else this.playlist.previous();
        break;
      case 'night':
        if (this.state.settings().nightMode !== command.on) this.state.updateSettings({ nightMode: command.on });
        break;
    }
  }

  /**
   * Sends the puck the sky map's catalogue (puck-catalog.ts) unless it holds it already:
   * `catalogStart`, then the parts in order on the catalogue channel. The puck answers
   * `catalogDone` or `catalogFailed`.
   */
  private async sendCatalog(held: string | null): Promise<void> {
    const control = this.control;
    const channel = this.catalog;
    const built = await this.catalogs.current();
    if (control !== this.control || !channel) return; // the link changed meanwhile
    if (held === built.id) {
      this.sendControl({ t: 'catalogOk' });
      return;
    }
    if (channel.readyState === 'connecting') {
      await new Promise((resolve) => channel.addEventListener('open', resolve, { once: true }));
    }
    if (channel !== this.catalog || channel.readyState !== 'open') return;
    const parts = catalogParts(built.bytes);
    // On the catalogue channel itself, before the parts: one ordered channel, so the puck
    // can't get a part before it knows a catalogue is coming.
    const start: PuckHostMessage = {
      t: 'catalogStart',
      id: built.id,
      bytes: built.bytes.length,
      parts: parts.length,
      crc32: built.crc32,
    };
    channel.send(JSON.stringify(start));
    this.lastSent = Date.now();
    channel.bufferedAmountLowThreshold = CATALOG_BUFFER_BYTES / 2;
    for (const part of parts) {
      if (channel !== this.catalog || channel.readyState !== 'open') return;
      // Not all at once: the browser keeps what it hasn't sent in memory.
      if (channel.bufferedAmount > CATALOG_BUFFER_BYTES) {
        await new Promise((resolve) => channel.addEventListener('bufferedamountlow', resolve, { once: true }));
      }
      channel.send(part.slice());
    }
  }

  private sendControl(message: PuckHostMessage): void {
    if (this.control?.readyState !== 'open') return;
    this.control.send(JSON.stringify(message));
    this.lastSent = Date.now();
  }

  /**
   * Sends the map's newest frame as the binary `view` (puck-view.ts), when the map has drawn
   * a new one, or once a second anyway. Before the map has drawn, there is nothing to send.
   */
  private sendView(now: number): void {
    const view = this.mapView.last;
    if (!view || this.view?.readyState !== 'open') return;
    if (view.frame === this.lastFrame && now - this.lastViewSent < HEARTBEAT_MS) return;
    this.lastFrame = view.frame;
    this.lastViewSent = this.lastSent = now;
    this.view.send(encodeView(view, this.state.selectedTarget(), this.viewSeq++, now - this.openedAt));
  }

  /** The link dropped without being ended on purpose. */
  private lose(): void {
    if (this.status() !== 'connected' && this.status() !== 'connecting') return;
    const wasConnected = this.status() === 'connected';
    this.close();
    this.status.set('lost');
    // Said wherever the user is, as for a lost finder phone: they are likely on the map.
    if (wasConnected) void this.tell(t('remote.puckDisconnected'));
  }

  private async tell(message: string): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration: 4000,
      position: 'top',
      color: 'warning',
      htmlAttributes: { 'data-testid': 'puck-toast' },
    });
    await toast.present();
  }

  private close(): void {
    clearInterval(this.viewTimer);
    this.viewTimer = undefined;
    const { connection, control, view, catalog } = this;
    this.connection = null;
    this.control = null;
    this.view = null;
    this.catalog = null;
    this.secret = '';
    control?.close();
    view?.close();
    catalog?.close();
    connection?.close();
  }
}
