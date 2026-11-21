import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { ToastController } from '@ionic/angular';

import { AppState } from '../app-state.service';
import type { Alignment } from '../app-state.service';
import { t } from '../i18n/t';
import { FullscreenService } from '../platform/fullscreen.service';
import { SensorService } from '../sensors/sensor.service';
import { LiveSolverService } from '../solver/live-solver.service';
import type { SolveNowResult } from '../solver/live-solver.service';
import { isDataMessage } from '../sync/link-sync';
import type { DataMessage } from '../sync/link-sync';

import { PoseGlide } from './pose-glide';
import { decodePuckCode, puckAnswer } from './puck-pairing';
import type { FinderMessage, RemoteMessage, RemoteRole, RemoteSite, ScreenMessage } from './remote-link';
import { alignmentKey, decodePairingCode, encodePairingCode, parseMessage, toRemoteEntry } from './remote-link';

/**
 * Where the link is:
 * - idle: not linked.
 * - showing-offer: a finder phone showing its code, waiting for the screen's reply.
 * - showing-answer: a screen phone showing its reply, waiting for the finder to read it.
 * - connecting: both codes read, the phones are finding each other.
 * - connected: linked.
 * - paused: linked underneath, but each phone works on its own until resumed.
 * - lost: the link was there and dropped.
 */
export type RemoteStatus = 'idle' | 'showing-offer' | 'showing-answer' | 'connecting' | 'connected' | 'paused' | 'lost';

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
 * A second channel just for poses. It never resends a lost message and doesn't keep them in
 * order: a newer pose replaces a lost one anyway, while waiting for it to be resent would
 * hold back every pose after it, so the map would freeze for a moment and then jump.
 */
const POSE_CHANNEL = 'astroturbomaxisolver-pose';

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

  /** Takes the user's data from the other phone: link sync (sync/link-sync.service.ts) sets it. */
  dataHandler: ((message: DataMessage) => void) | null = null;

  private connection: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private poseChannel: RTCDataChannel | null = null;
  /** The finder numbers its poses, and the screen remembers the newest it used. */
  private poseNumber = 0;
  /**
   * On the screen phone: glides the map towards each pose instead of jumping. The map stays
   * level there, with the sky up, however the finder phone is turned on the telescope: the
   * screen phone is in the hand, and its own sensors are off.
   */
  private readonly glide = new PoseGlide(({ pointing, camera }) => {
    this.state.pointing.set(pointing);
    this.state.cameraPointing.set(camera);
  });
  private lastPoseSent = 0;
  private poseTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private silenceTimer?: ReturnType<typeof setTimeout>;
  private lastLogSent = 0;
  private requestId = 0;
  private readonly pendingSolves = new Map<number, (result: SolveNowResult) => void>();
  /** Linked to the puck: the secret from its code, sent first once the channel opens. */
  private puckSecret: string | null = null;
  /** The alignment the other phone is known to have, so one isn't sent back to where it came from. */
  private sharedAlignment = alignmentKey(null);
  private sharedSite = '';

  constructor() {
    // While the finder waits for a tap to follow the screen into full screen, a tap anywhere
    // on it does: the band's words are a small target on a phone fixed to a telescope.
    effect((onCleanup) => {
      if (!this.fullscreenWanted()) return;
      const tapped = (): void => void this.enterWantedFullscreen();
      document.addEventListener('click', tapped, true);
      onCleanup(() => document.removeEventListener('click', tapped, true));
    });
    // The finder sends where it points whenever it changes.
    effect(() => {
      if (!this.isLinked('finder')) return;
      this.state.pointing();
      this.state.cameraPointing();
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
    // The target follows the screen phone, chosen or cleared, so the finder's map guides to it too.
    effect(() => {
      const id = this.state.selectedTargetId();
      if (this.isLinked('screen')) this.send({ t: 'target', id });
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
    this.usePoseChannel(connection.createDataChannel(POSE_CHANNEL, { ordered: false, maxRetransmits: 0 }));
    try {
      await connection.setLocalDescription(await connection.createOffer());
      this.code.set(await encodePairingCode({ role: 'finder', sdp: await this.gathered(connection) }));
      this.status.set('showing-offer');
    } catch {
      this.fail(t('remote.couldNotStart'));
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
      this.error.set(error instanceof Error ? error.message : t('remote.couldNotRead'));
    }
  }

  /** Starts as the screen phone, from the finder's code: makes the reply for the finder to read. */
  async startAsScreen(code: string): Promise<void> {
    let offer;
    try {
      offer = await decodePairingCode(code);
      if (offer.role !== 'finder') throw new Error("That's a screen phone's code. Scan the finder's.");
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : t('remote.couldNotRead'));
      return;
    }
    this.reset();
    this.role.set('screen');
    const connection = this.newConnection();
    connection.ondatachannel = (event) =>
      event.channel.label === POSE_CHANNEL ? this.usePoseChannel(event.channel) : this.useChannel(event.channel);
    try {
      await connection.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
      await connection.setLocalDescription(await connection.createAnswer());
      this.code.set(await encodePairingCode({ role: 'screen', sdp: await this.gathered(connection) }));
      this.status.set('showing-answer');
    } catch {
      this.fail(t('remote.couldNotStart'));
    }
  }

  /**
   * Links to the puck, the hand remote, from its code: this phone is the finder, and the puck
   * takes the screen's place. The puck can't read a reply, so its answer is built here from
   * its code (puck-pairing.ts).
   */
  async startWithPuck(code: string): Promise<void> {
    let puck;
    try {
      puck = decodePuckCode(code);
    } catch {
      this.error.set(t('remote.couldNotRead'));
      return;
    }
    this.reset();
    this.role.set('finder');
    this.puckSecret = puck.secret;
    const connection = this.newConnection();
    this.useChannel(connection.createDataChannel(CHANNEL));
    this.usePoseChannel(connection.createDataChannel(POSE_CHANNEL, { ordered: false, maxRetransmits: 0 }));
    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await connection.setRemoteDescription({ type: 'answer', sdp: puckAnswer(puck, offer.sdp ?? '') });
      this.status.set('connecting');
    } catch {
      this.fail(t('remote.couldNotStart'));
    }
  }

  /** Ends the link, on purpose. Linking again needs new codes. */
  disconnect(): void {
    this.reset();
  }

  /**
   * Pauses the link, on purpose: each phone goes back to working on its own, while the link
   * stays open underneath, so either phone can resume it without new codes. It lasts while
   * both phones keep the app open: closed or reloaded, the link is gone.
   */
  pause(): void {
    if (this.status() !== 'connected') return;
    this.send({ t: 'pause' });
    this.stopLinkedMode();
    this.status.set('paused');
  }

  /** Resumes a paused link, or says it is gone if it dropped meanwhile. */
  resume(): void {
    if (this.status() !== 'paused') return;
    if (this.channel?.readyState !== 'open') return this.lose();
    this.send({ t: 'resume' });
    this.startLinkedMode();
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

  /** The poses' channel only carries messages: the main channel decides when the link is up or down. */
  private usePoseChannel(channel: RTCDataChannel): void {
    this.poseChannel = channel;
    channel.onmessage = (event) => {
      const message = parseMessage(String(event.data));
      if (message) this.receive(message);
    };
  }

  private opened(): void {
    this.code.set('');
    this.error.set('');
    // The puck drops a link whose first message isn't its secret.
    if (this.puckSecret) this.send({ t: 'auth', secret: this.puckSecret });
    this.startLinkedMode();
  }

  /** Each phone takes its part: the finder steers and solves, the screen shows and asks. */
  private startLinkedMode(): void {
    this.status.set('connected');
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
      this.send({ t: 'target', id: this.state.selectedTargetId() });
      this.expectMessages();
    }
  }

  private receive(message: RemoteMessage): void {
    // The other phone paused or resumed the link.
    if (message.t === 'pause') {
      if (this.status() === 'connected') {
        this.stopLinkedMode();
        this.status.set('paused');
      }
      return;
    }
    if (message.t === 'resume') {
      if (this.status() === 'paused') this.startLinkedMode();
      return;
    }
    // The user's data, for link sync, only while the phones work as one.
    if (isDataMessage(message)) {
      if (this.status() === 'connected') this.dataHandler?.(message);
      return;
    }
    // Paused, each phone works on its own, so nothing else from the other one counts.
    if (this.status() !== 'connected') return;
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
        // One that arrived after a newer one is out of date.
        if (message.n !== undefined) {
          if (message.n <= this.poseNumber) break;
          this.poseNumber = message.n;
        }
        this.glide.to({ pointing: message.pointing, camera: message.camera });
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
      case 'target':
        this.state.selectedTargetId.set(message.id);
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
      n: ++this.poseNumber,
      pointing: this.state.pointing(),
      camera: this.state.cameraPointing(),
      solving: this.state.plateSolving(),
      steering: this.state.sensorsActive(),
    });
  }

  /** Sends the user's data to the other phone, for link sync, while the phones work as one. */
  sendData(message: DataMessage): void {
    if (this.status() === 'connected') this.send(message);
  }

  /** Sends a message to the other phone: poses on their own channel while it is open. */
  private send(message: RemoteMessage): void {
    const channel = message.t === 'pose' && this.poseChannel?.readyState === 'open' ? this.poseChannel : this.channel;
    if (channel?.readyState === 'open') channel.send(JSON.stringify(message));
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
    if (this.status() !== 'connected' && this.status() !== 'connecting' && this.status() !== 'paused') return;
    // Paused, the screen isn't following the finder, so there is nothing to warn about now.
    const wasScreen = this.role() === 'screen' && this.status() !== 'paused';
    this.close();
    this.status.set('lost');
    if (wasScreen) void this.tell(t('remote.finderDisconnected'));
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
    this.stopLinkedMode();
    const channel = this.channel;
    const poseChannel = this.poseChannel;
    const connection = this.connection;
    this.channel = null;
    this.poseChannel = null;
    this.connection = null;
    channel?.close();
    poseChannel?.close();
    this.poseNumber = 0;
    this.puckSecret = null;
    connection?.close();
    this.code.set('');
  }

  /**
   * Each phone back on its own: the finder's map and buttons return, and the screen phone
   * gets its own sensors and camera back. The link itself is left as it is.
   */
  private stopLinkedMode(): void {
    clearTimeout(this.poseTimer);
    clearTimeout(this.silenceTimer);
    clearInterval(this.heartbeat);
    this.poseTimer = undefined;
    this.glide.stop();
    for (const resolve of this.pendingSolves.values())
      resolve({ ok: false, reason: t('remote.finderDisconnectedReason') });
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
