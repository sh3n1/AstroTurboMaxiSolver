import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { ToastController } from '@ionic/angular';

import { AppState } from '../app-state.service';
import { t } from '../i18n/t';
import { ListsService } from '../lists/lists.service';
import type { ListView } from '../lists/lists.service';
import { PlaylistService } from '../lists/playlist.service';
import type { ListedTarget } from '../lists/target-lists';
import { ScreenWakeService } from '../platform/screen-wake.service';
import { SensorService } from '../sensors/sensor.service';
import { MapViewService } from '../sky-map/map-view.service';
import { NEXT_VIEW } from '../sky-map/sky-style';
import { LiveSolverService } from '../solver/live-solver.service';

import { PuckAlignService } from './puck-align.service';
import { PART_BYTES, catalogParts } from './puck-catalog';
import { PuckCatalogService } from './puck-catalog.service';
import { listTargetsMessage, listsMessage, puckLists } from './puck-lists';
import { mapRulesMessage, parsePuckMessage, targetInfoMessage, textsMessage } from './puck-messages';
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
/**
 * At most this many of the catalogue's parts go before the puck says it has them
 * (catalogAck). Sent all at once, the puck dropped most of each burst, and the resends held
 * up the views too, until the link was taken as lost.
 */
const CATALOG_PARTS_AHEAD = 2;
/** Without a catalogAck for this long, the transfer is given up: the link is likely gone. */
const CATALOG_ACK_TIMEOUT_MS = 10_000;
/** How many times a catalogue the puck failed to take is sent again. */
const CATALOG_TRIES = 3;
/** How often to look for a new frame of the map to send: about 30 a second. */
const VIEW_INTERVAL_MS = 33;
/**
 * Keeping the link alive (docs/puck.md): each side sends at least one message a second, so
 * silence for longer than the limit means the link is lost, long before WebRTC notices.
 */
const HEARTBEAT_MS = 1000;
const SILENCE_LIMIT_MS = 4000;
/**
 * After a lost link, this phone links again by itself, this many times, this long apart:
 * the puck keeps its code until it restarts, so no new scan is needed (docs/puck.md).
 */
const AUTO_RECONNECT_TRIES = 10;
const AUTO_RECONNECT_DELAY_MS = 2000;
/** A try that hasn't linked by then is given up, and the next one goes. */
const CONNECT_TIMEOUT_MS = 8000;
/** A gap this long between the view timer's ticks: the page stalled. Kept for the loss's record. */
const STALL_MS = 500;
const STALLS_KEPT = 5;

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
  private readonly lists = inject(ListsService);
  private readonly align = inject(PuckAlignService);
  private readonly toasts = inject(ToastController);
  private readonly catalogs = inject(PuckCatalogService);
  private readonly screenWake = inject(ScreenWakeService);
  private readonly sensors = inject(SensorService);

  readonly status = signal<PuckStatus>('idle');
  /** What went wrong, in a few words for the user, or empty. */
  readonly error = signal('');
  /**
   * The puck's code last read, kept after a lost link: the puck keeps the same code until it
   * restarts (docs/puck.md, "Pairing"), so reconnect() links again without a new scan.
   * Forgotten when the link is ended on purpose.
   */
  private readonly lastCode = signal('');
  /** Whether reconnect() can link again: the link is lost and its code is known. */
  readonly canReconnect = computed(() => this.status() === 'lost' && this.lastCode() !== '');

  private connection: RTCPeerConnection | null = null;
  private control: RTCDataChannel | null = null;
  private view: RTCDataChannel | null = null;
  private catalog: RTCDataChannel | null = null;
  /** A catalogue the puck failed to take is sent again, a few times, not for ever. */
  private catalogTries = 0;
  /** How many of the catalogue's bytes the puck has said it has, and who waits to know. */
  private catalogAcked = 0;
  private catalogAckWaiter: (() => void) | null = null;
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
  /** Linking again by itself after a loss: how many tries so far, and the next one's timer. */
  private reconnectTries = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private connectTimer?: ReturnType<typeof setTimeout>;
  /**
   * For finding why links drop: the view timer's last tick and its recent stalls, and this
   * side's record of the last loss, sent to the puck once linked again (`appLog`), where it
   * is kept in the puck's log.
   */
  private lastTick = 0;
  private stalls: string[] = [];
  private lossRecord = '';

  constructor() {
    // The phone must stay awake while the puck is linked: asleep, it stops sending.
    effect(() => {
      const linked = this.status() === 'connecting' || this.status() === 'connected';
      untracked(() => this.screenWake.keepOnFor('puck', linked));
    });
    // The target's name, for the puck's bottom third, on every change.
    effect(() => {
      const target = this.state.selectedTarget();
      if (this.status() !== 'connected') return;
      untracked(() => this.sendControl(targetInfoMessage(target)));
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
      this.state.viewMode();
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
    this.lastCode.set(code);
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
    this.catalogTries = 0;
    this.status.set('connecting');
    clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      if (connection === this.connection && this.status() === 'connecting') this.lose();
    }, CONNECT_TIMEOUT_MS);
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

  /** Links again with the code last read, after a lost link: the Reconnect button. */
  reconnect(): void {
    this.reconnectTries = 0;
    clearTimeout(this.reconnectTimer);
    if (this.lastCode()) void this.start(this.lastCode());
  }

  /** Ends the link, on purpose. Linking again needs the puck's code read again. */
  disconnect(): void {
    clearTimeout(this.reconnectTimer);
    this.reconnectTries = 0;
    this.lastCode.set('');
    this.close();
    this.status.set('idle');
    this.error.set('');
  }

  private opened(): void {
    // The puck drops a link whose first message isn't its secret.
    this.sendControl({ t: 'auth', secret: this.secret });
    // The words the puck shows, in this phone's language. The language is set as the app
    // starts, so once a link is enough.
    this.sendControl(textsMessage((key, params) => t(key, params)));
    // The rules for the puck's own zoom, which are the map's.
    this.sendControl(mapRulesMessage());
    // This side's record of the link lost before, for the puck's log.
    if (this.lossRecord) this.sendControl({ t: 'appLog', text: this.lossRecord });
    this.lossRecord = '';
    this.reconnectTries = 0;
    this.stalls = [];
    this.openedAt = this.lastHeard = this.lastTick = Date.now();
    this.lastFrame = 0;
    this.viewSeq = 0;
    // Setting the status sends targetInfo and state, through the effects above.
    this.status.set('connected');
    this.viewTimer = setInterval(() => this.tick(), VIEW_INTERVAL_MS);
  }

  /** About 30 times a second: the newest view, a heartbeat if needed, and the silence check. */
  private tick(): void {
    const now = Date.now();
    // The page stalled (the timer came late): kept, in case the link drops.
    if (now - this.lastTick > STALL_MS) {
      this.stalls.push(`${Math.round((now - this.openedAt) / 1000)} s: ${now - this.lastTick} ms`);
      if (this.stalls.length > STALLS_KEPT) this.stalls.shift();
    }
    this.lastTick = now;
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
      view: this.state.viewMode(),
    });
  }

  /** A message from the puck: its commands are done as this phone's own buttons would. */
  private obey(command: PuckMessage): void {
    switch (command.t) {
      case 'puckHello':
        void this.sendCatalog(command.catalog);
        break;
      case 'catalogAck':
        this.catalogAcked = command.bytes;
        this.catalogAckWaiter?.();
        break;
      case 'catalogFailed':
        // Again, in case parts were lost on the way or stopped coming.
        if (++this.catalogTries <= CATALOG_TRIES) void this.sendCatalog(null);
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
      case 'sensors':
        // As the menu's Sensors tile.
        if (command.on && !this.state.sensorsActive()) void this.sensors.start();
        else if (!command.on && this.state.sensorsActive()) this.sensors.stop();
        break;
      case 'view':
        this.state.viewMode.set(NEXT_VIEW[this.state.viewMode()]);
        break;
      case 'lists':
        this.sendControl(listsMessage(this.puckLists(), this.isUp()));
        break;
      case 'listTargets': {
        const list = this.puckLists().find((candidate) => candidate.id === command.id);
        if (list) this.sendControl(listTargetsMessage(list, this.isUp()));
        break;
      }
      case 'alignStars':
        this.sendControl(this.align.starsMessage());
        break;
      case 'alignChoose': {
        const status = this.align.choose(command.id);
        if (status) this.sendControl(status);
        break;
      }
      case 'alignNow':
        // One at a time, as the Align page's button.
        if (this.state.plateSolving()) break;
        this.sendControl(this.align.solvingMessage());
        void this.align.alignNow().then((status) => this.sendControl(status));
        break;
      case 'alignRemove':
        this.align.remove();
        this.sendControl(this.align.starsMessage());
        break;
      case 'play': {
        // As a tap on a target in the list's page: the list plays on the map from it.
        const list = this.lists.list(command.list);
        if (list?.targets.some((target) => target.id === command.target)) {
          const ids = list.targets.map((target) => target.id);
          this.playlist.play(list.name, ids, command.target, `/tabs/lists/${list.id}`);
        }
        break;
      }
    }
  }

  /** The lists the puck's menu offers (puck-lists.ts). */
  private puckLists(): ListView[] {
    return puckLists(this.lists.fixedLists(), this.lists.userLists());
  }

  /** Whether a target is above the horizon now, as the playlist's steps count it. */
  private isUp(): (target: ListedTarget) => boolean {
    const time = this.state.now();
    return (target) => this.state.positionAt(target, time).altDeg > 0;
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
    this.catalogAcked = 0;
    let sent = 0;
    for (const part of parts) {
      // Wait while too many parts are unanswered: the puck takes them as fast as it can.
      while (sent - this.catalogAcked >= CATALOG_PARTS_AHEAD * PART_BYTES) {
        const answered = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), CATALOG_ACK_TIMEOUT_MS);
          this.catalogAckWaiter = () => {
            clearTimeout(timer);
            resolve(true);
          };
        });
        this.catalogAckWaiter = null;
        if (!answered) return;
      }
      if (channel !== this.catalog || channel.readyState !== 'open') return;
      channel.send(part.slice());
      sent += part.length;
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
    if (wasConnected) this.lossRecord = this.describeLoss();
    this.close();
    this.status.set('lost');
    // Again by itself, a few times: the puck still has the same code.
    if (this.lastCode() && this.reconnectTries < AUTO_RECONNECT_TRIES) {
      this.reconnectTries++;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        if (this.status() === 'lost') void this.start(this.lastCode());
      }, AUTO_RECONNECT_DELAY_MS);
    }
    // Said wherever the user is, as for a lost finder phone: they are likely on the map.
    // With a button to link again at once, with the same code.
    if (wasConnected) void this.tell(t('remote.puckDisconnected'), true);
  }

  /** What this side saw when the link dropped, in a line for the puck's log. */
  private describeLoss(): string {
    const now = Date.now();
    const { connection, control } = this;
    return [
      `lost after ${Math.round((now - this.openedAt) / 1000)} s`,
      `heard ${now - this.lastHeard} ms ago, sent ${now - this.lastSent} ms ago`,
      `connection ${connection?.connectionState}, ICE ${connection?.iceConnectionState}`,
      `control ${control?.readyState}, ${control?.bufferedAmount} bytes waiting`,
      `stalls: ${this.stalls.join(', ') || 'none'}`,
    ].join('; ');
  }

  private async tell(message: string, offerReconnect = false): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration: offerReconnect ? 8000 : 4000,
      position: 'top',
      color: 'warning',
      htmlAttributes: { 'data-testid': 'puck-toast' },
      buttons: offerReconnect
        ? [
            {
              text: t('remote.reconnect'),
              htmlAttributes: { 'data-testid': 'puck-toast-reconnect' },
              handler: () => this.reconnect(),
            },
          ]
        : [],
    });
    await toast.present();
  }

  private close(): void {
    clearInterval(this.viewTimer);
    clearTimeout(this.connectTimer);
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
