import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { ToastController } from '@ionic/angular';

import { AppState } from './app-state.service';
import type { Alignment } from './app-state.service';
import { FullscreenService } from './fullscreen.service';
import { LiveSolverService } from './live-solver.service';
import type { SolveNowResult } from './live-solver.service';
import type { FinderMessage, RemoteMessage, RemoteRole, RemoteSite, ScreenMessage } from './remote-link';
import { alignmentKey, decodePairingCode, encodePairingCode, parseMessage, toRemoteEntry } from './remote-link';
import { SensorService } from './sensor.service';
import { screenAngleDeg } from './sideways';

/**
 * Where the link is:
 * - idle: not linked.
 * - showing-offer: a finder phone showing its code, waiting for the screen's reply.
 * - showing-answer: a screen phone showing its reply, waiting for the finder to read it.
 * - connecting: both codes read, the phones are finding each other.
 * - connected: linked.
 * - lost: the link was there and dropped.
 */
export type RemoteStatus = 'idle' | 'showing-offer' | 'showing-answer' | 'connecting' | 'connected' | 'lost';

/** At most one pose message in this time, so a moving phone doesn't flood the link. */
const POSE_INTERVAL_MS = 50;
/** The finder sends its pose at least this often, even when nothing changes. */
const HEARTBEAT_MS = 1000;
/** Without any message for this long, the screen treats the link as lost. */
const SILENCE_LIMIT_MS = 4000;
/** How long gathering the phone's network addresses may take before the code is made. */
const GATHER_TIMEOUT_MS = 4000;
/** How long a plate solve asked of the finder may take before giving up. */
const SOLVE_TIMEOUT_MS = 60_000;
/** The data channel's name, the same on both phones. */
const CHANNEL = 'astroturbomaxisolver';

/**
 * Links two phones so one works as the finder on the telescope and the other as the
 * screen in the hand. The finder phone runs as usual, with its sensors and plate solving,
 * and sends where it points. The screen phone shows that, and asks the finder to plate
 * solve when the user aligns or taps the rings. Alignment is made on the screen
 * phone and sent to the finder, which uses it to turn its camera's direction into the
 * telescope's. No server is needed: the phones swap QR codes once, then talk directly
 * over WebRTC on the same Wi-Fi or one phone's hotspot.
 */
@Injectable({ providedIn: 'root' })
export class RemoteService {
  private readonly state = inject(AppState);
  private readonly fullscreen = inject(FullscreenService);
  private readonly liveSolver = inject(LiveSolverService);
  private readonly sensors = inject(SensorService);
  private readonly toasts = inject(ToastController);

  /** What this phone is in the link, or null when not linked. */
  readonly role = signal<RemoteRole | null>(null);
  readonly status = signal<RemoteStatus>('idle');
  /** The code to show the other phone as a QR code, while one is needed. */
  readonly code = signal('');
  /** What went wrong, in a few words for the user, or empty. */
  readonly error = signal('');
  /** On the screen phone: whether the finder's sensors steer its position. */
  readonly finderSteering = signal(true);
  /**
   * On the finder phone: the screen phone went full screen, but this browser needs a tap
   * here before it can follow. The finder's band then offers it.
   */
  readonly fullscreenWanted = signal(false);

  private connection: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private lastPoseSent = 0;
  private poseTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private silenceTimer?: ReturnType<typeof setTimeout>;
  private lastLogSent = 0;
  private requestId = 0;
  private readonly pendingSolves = new Map<number, (result: SolveNowResult) => void>();
  /** The alignment the other phone is known to have, so one isn't sent back to where it came from. */
  private sharedAlignment = alignmentKey(null);
  private sharedSite = '';

  constructor() {
    // The finder sends where it points whenever it changes.
    effect(() => {
      if (!this.isLinked('finder')) return;
      this.state.pointing();
      this.state.cameraPointing();
      this.state.viewRollDeg();
      this.state.plateSolving();
      this.state.sensorsActive();
      untracked(() => this.queuePose());
    });
    // The finder tells each plate solve attempt, so the screen shows the same toasts.
    effect(() => {
      const log = this.liveSolver.log();
      if (!this.isLinked('finder')) return;
      for (const entry of [...log].reverse()) {
        if (entry.id <= this.lastLogSent) continue;
        this.lastLogSent = entry.id;
        this.send({ t: 'solveLog', entry: toRemoteEntry(entry) });
      }
    });
    // The finder's location is the screen's too, since both are at the same telescope.
    effect(() => {
      const site = this.siteOf();
      if (!this.isLinked('finder') || JSON.stringify(site) === this.sharedSite) return;
      this.sharedSite = JSON.stringify(site);
      this.send({ t: 'site', site });
    });
    // Red night mode follows the screen phone, so the finder's screen doesn't light up the
    // telescope while the user's eyes adapt.
    effect(() => {
      const on = this.state.settings().nightMode;
      if (this.isLinked('screen')) this.send({ t: 'night', on });
    });
    // Full screen follows the screen phone too, so the finder shows no bright browser bars.
    effect(() => {
      const on = this.fullscreen.active();
      if (this.isLinked('screen')) this.send({ t: 'fullscreen', on });
    });
    // An alignment made on either phone goes to the other.
    effect(() => {
      const alignment = this.state.alignment();
      if (this.status() !== 'connected' || alignmentKey(alignment) === this.sharedAlignment) return;
      this.sharedAlignment = alignmentKey(alignment);
      this.send({ t: 'alignment', alignment });
    });
  }

  /** Starts as the finder phone: makes the first code, for the screen phone to read. */
  async startAsFinder(): Promise<void> {
    this.reset();
    this.role.set('finder');
    const connection = this.newConnection();
    this.useChannel(connection.createDataChannel(CHANNEL));
    try {
      await connection.setLocalDescription(await connection.createOffer());
      this.code.set(await encodePairingCode({ role: 'finder', sdp: await this.gathered(connection) }));
      this.status.set('showing-offer');
    } catch {
      this.fail('Could not start the link on this phone.');
    }
  }

  /** On the finder phone: reads the screen phone's reply, which completes the link. */
  async acceptReply(code: string): Promise<void> {
    try {
      const reply = await decodePairingCode(code);
      if (reply.role !== 'screen') throw new Error("That's a finder's code. Scan the screen phone's reply.");
      await this.connection?.setRemoteDescription({ type: 'answer', sdp: reply.sdp });
      this.error.set('');
      this.status.set('connecting');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not read the code.');
    }
  }

  /** Starts as the screen phone, from the finder's code: makes the reply for the finder to read. */
  async startAsScreen(code: string): Promise<void> {
    let offer;
    try {
      offer = await decodePairingCode(code);
      if (offer.role !== 'finder') throw new Error("That's a screen phone's code. Scan the finder's.");
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not read the code.');
      return;
    }
    this.reset();
    this.role.set('screen');
    const connection = this.newConnection();
    connection.ondatachannel = (event) => this.useChannel(event.channel);
    try {
      await connection.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
      await connection.setLocalDescription(await connection.createAnswer());
      this.code.set(await encodePairingCode({ role: 'screen', sdp: await this.gathered(connection) }));
      this.status.set('showing-answer');
    } catch {
      this.fail('Could not start the link on this phone.');
    }
  }

  /** Ends the link, on purpose. */
  disconnect(): void {
    this.reset();
  }

  private isLinked(role: RemoteRole): boolean {
    return this.status() === 'connected' && this.role() === role;
  }

  private newConnection(): RTCPeerConnection {
    // No servers: the phones are on the same network, so their own addresses are enough,
    // and the link works with no internet, out in a field.
    const connection = new RTCPeerConnection({ iceServers: [] });
    connection.onconnectionstatechange = () => {
      if (connection !== this.connection) return;
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') this.lose();
    };
    this.connection = connection;
    return connection;
  }

  /**
   * The phone's session description once its network addresses are all in it, so one
   * code carries everything: there is no server to send more later.
   */
  private gathered(connection: RTCPeerConnection): Promise<string> {
    return new Promise((resolve) => {
      const done = (): void => resolve(connection.localDescription?.sdp ?? '');
      if (connection.iceGatheringState === 'complete') return done();
      const timer = setTimeout(done, GATHER_TIMEOUT_MS);
      connection.addEventListener('icegatheringstatechange', () => {
        if (connection.iceGatheringState !== 'complete') return;
        clearTimeout(timer);
        done();
      });
    });
  }

  private useChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.onopen = () => this.opened();
    channel.onclose = () => {
      if (channel === this.channel) this.lose();
    };
    channel.onmessage = (event) => {
      const message = parseMessage(String(event.data));
      if (message) this.receive(message);
    };
  }

  private opened(): void {
    this.status.set('connected');
    this.code.set('');
    this.error.set('');
    this.sharedAlignment = alignmentKey(this.state.alignment());
    if (this.role() === 'finder') {
      // The finder shows the real sky, now, with no buttons to change it by accident.
      this.state.finderMode.set(true);
      this.state.plannedTime.set(null);
      this.state.timeControlOpen.set(false);
      // It starts its sensors, so the screen has something to show. Where a tap is needed
      // first, as on iPhones, the finder's footer offers one.
      void this.sensors.start({ automatic: true });
      this.sharedSite = JSON.stringify(this.siteOf());
      // Only attempts from now on: the screen phone wasn't there for the earlier ones.
      this.lastLogSent = this.liveSolver.log()[0]?.id ?? 0;
      this.send({ t: 'hello', alignment: this.state.alignment(), site: this.siteOf() });
      this.heartbeat = setInterval(() => this.sendPose(), HEARTBEAT_MS);
    } else {
      // The screen's own sensors give way to the finder's.
      this.sensors.stop();
      this.state.remoteFinder.set(true);
      this.state.sensorsActive.set(true);
      this.liveSolver.remoteSolve = (trigger) => this.requestSolve(trigger);
      this.send({ t: 'night', on: this.state.settings().nightMode });
      this.send({ t: 'fullscreen', on: this.fullscreen.active() });
      this.expectMessages();
    }
  }

  private receive(message: RemoteMessage): void {
    if (this.role() === 'screen') this.receiveAsScreen(message as FinderMessage);
    else this.receiveAsFinder(message as ScreenMessage);
  }

  private receiveAsScreen(message: FinderMessage): void {
    this.expectMessages();
    switch (message.t) {
      case 'hello':
        // The finder sits on the telescope, so its alignment is the one that holds.
        this.applyAlignment(message.alignment);
        this.applySite(message.site);
        break;
      case 'pose':
        this.state.pointing.set(message.pointing);
        this.state.cameraPointing.set(message.camera);
        // Sent relative to the finder phone's top: this phone turns it for its own screen.
        this.state.viewRollDeg.set(message.rollDeg + screenAngleDeg());
        this.state.plateSolving.set(message.solving);
        this.finderSteering.set(message.steering !== false);
        break;
      case 'site':
        this.applySite(message.site);
        break;
      case 'alignment':
        this.applyAlignment(message.alignment);
        break;
      case 'solveLog':
        this.liveSolver.addRemoteEntry({ ...message.entry, at: new Date(message.entry.at) });
        break;
      case 'solveResult':
        this.pendingSolves.get(message.id)?.(message.result);
        this.pendingSolves.delete(message.id);
        break;
    }
  }

  private receiveAsFinder(message: ScreenMessage): void {
    switch (message.t) {
      case 'solveNow':
        void this.liveSolver.solveNow(message.trigger).then((result) => {
          this.send({ t: 'solveResult', id: message.id, result });
        });
        break;
      case 'alignment':
        this.applyAlignment(message.alignment);
        break;
      case 'night':
        if (this.state.settings().nightMode !== message.on) this.state.updateSettings({ nightMode: message.on });
        break;
      case 'fullscreen':
        void this.followFullscreen(message.on);
        break;
    }
  }

  /** Asks the finder to plate solve, and waits for its answer. */
  private requestSolve(trigger: 'alignment' | 'tap'): Promise<SolveNowResult> {
    const id = ++this.requestId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingSolves.delete(id);
        resolve({ ok: false, reason: "The finder phone didn't answer." });
      }, SOLVE_TIMEOUT_MS);
      this.pendingSolves.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      this.send({ t: 'solveNow', id, trigger });
    });
  }

  private applyAlignment(alignment: Alignment | null): void {
    this.sharedAlignment = alignmentKey(alignment);
    this.state.alignment.set(alignment);
  }

  private applySite(site: RemoteSite): void {
    const { latitudeDeg, longitudeDeg, locationSet } = this.state.settings();
    if (site.latitudeDeg === latitudeDeg && site.longitudeDeg === longitudeDeg && site.locationSet === locationSet) {
      return;
    }
    this.state.updateSettings(site);
  }

  private siteOf(): RemoteSite {
    const { latitudeDeg, longitudeDeg, locationSet } = this.state.settings();
    return { latitudeDeg, longitudeDeg, locationSet };
  }

  /** Sends the pose now, or as soon as the last one is far enough behind. */
  private queuePose(): void {
    const wait = this.lastPoseSent + POSE_INTERVAL_MS - Date.now();
    if (wait <= 0) this.sendPose();
    else this.poseTimer ??= setTimeout(() => this.sendPose(), wait);
  }

  private sendPose(): void {
    clearTimeout(this.poseTimer);
    this.poseTimer = undefined;
    this.lastPoseSent = Date.now();
    this.send({
      t: 'pose',
      pointing: this.state.pointing(),
      camera: this.state.cameraPointing(),
      // Relative to the phone's top, since the screen phone may be turned another way.
      rollDeg: this.state.viewRollDeg() - screenAngleDeg(),
      solving: this.state.plateSolving(),
      steering: this.state.sensorsActive(),
    });
  }

  private send(message: RemoteMessage): void {
    if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(message));
  }

  /**
   * The finder sends at least every second. Silence for longer means the link is gone,
   * even before WebRTC notices, and the screen must never keep showing an old position.
   */
  private expectMessages(): void {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.lose(), SILENCE_LIMIT_MS);
  }

  /** The link dropped without being ended on purpose. */
  private lose(): void {
    if (this.status() !== 'connected' && this.status() !== 'connecting') return;
    const wasScreen = this.role() === 'screen';
    this.close();
    this.status.set('lost');
    if (wasScreen) void this.tell('Finder phone disconnected');
  }

  private fail(message: string): void {
    this.close();
    this.status.set('idle');
    this.error.set(message);
  }

  /** Back to not linked, with nothing kept from before. */
  private reset(): void {
    this.close();
    this.role.set(null);
    this.status.set('idle');
    this.error.set('');
  }

  /** Closes the link, and gives the screen phone back its own sensors and camera. */
  /**
   * On the finder phone, follows the screen phone into full screen or out of it. Leaving
   * always works. Entering needs a tap on this phone in most browsers, so if it is refused
   * the finder's band asks for one. Where the app can't change it (an installed app that
   * opens full screen, or an iPhone), nothing is done.
   */
  private async followFullscreen(on: boolean): Promise<void> {
    if (!this.fullscreen.supported) return;
    if (!on) {
      this.fullscreenWanted.set(false);
      await this.fullscreen.exit();
      return;
    }
    this.fullscreenWanted.set(!(await this.fullscreen.enter()));
  }

  /** The finder's band asked for full screen, and the user tapped it on this phone. */
  async enterWantedFullscreen(): Promise<void> {
    if (await this.fullscreen.enter()) this.fullscreenWanted.set(false);
  }

  private close(): void {
    clearTimeout(this.poseTimer);
    clearTimeout(this.silenceTimer);
    clearInterval(this.heartbeat);
    this.poseTimer = undefined;
    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;
    channel?.close();
    connection?.close();
    this.code.set('');
    for (const resolve of this.pendingSolves.values()) resolve({ ok: false, reason: 'The finder phone disconnected.' });
    this.pendingSolves.clear();
    this.lastLogSent = this.liveSolver.log()[0]?.id ?? 0;
    this.state.finderMode.set(false);
    this.finderSteering.set(true);
    this.fullscreenWanted.set(false);
    if (this.state.remoteFinder()) {
      this.liveSolver.remoteSolve = null;
      this.state.remoteFinder.set(false);
      this.state.sensorsActive.set(false);
      this.state.cameraPointing.set(null);
      this.state.viewRollDeg.set(0);
      this.state.plateSolving.set(false);
    }
  }

  private async tell(message: string): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration: 4000,
      position: 'top',
      color: 'warning',
      htmlAttributes: { 'data-testid': 'remote-toast' },
    });
    await toast.present();
  }
}
