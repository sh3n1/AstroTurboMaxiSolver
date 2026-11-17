// Two phones working as one: a finder phone on the telescope, which runs the sensors and
// plate solving, and a screen phone in the hand, which shows the map and does everything
// else. They talk over a direct WebRTC link on the local network. This file holds the
// pairing codes and the messages, as plain functions, so they can be tested without a link.
// The design is in docs/two-phones.md.

import type { Alignment } from './app-state.service';
import type { Horizontal } from './astronomy';
import type { SolveLogEntry, SolveNowResult } from './live-solver.service';

/** The finder phone sits on the telescope. The screen phone is the one the user looks at. */
export type RemoteRole = 'finder' | 'screen';

/** Where the phones are. Both are at the same telescope, so the finder's location is used. */
export interface RemoteSite {
  latitudeDeg: number;
  longitudeDeg: number;
  locationSet: boolean;
}

/** A plate solve attempt as the finder tells it, for the screen's toasts and log. */
export type RemoteSolveEntry = Omit<SolveLogEntry, 'id' | 'at'> & { at: string };

/** What the finder phone sends. */
export type FinderMessage =
  /** Sent first, once the link is open. */
  | { t: 'hello'; alignment: Alignment | null; site: RemoteSite }
  /**
   * Where the telescope and camera point. Sent on every change, and every second anyway.
   * Steering is false while the finder's sensors are off, when its position doesn't follow
   * the telescope. Poses go on their own channel, which never resends a lost one and may
   * deliver them out of order, so each is numbered and the screen drops any older than the
   * last it used. Optional, for a finder running an older version.
   */
  | {
      t: 'pose';
      n?: number;
      pointing: Horizontal;
      camera: Horizontal | null;
      rollDeg: number;
      solving: boolean;
      steering: boolean;
    }
  | { t: 'site'; site: RemoteSite }
  | { t: 'alignment'; alignment: Alignment | null }
  | { t: 'solveLog'; entry: RemoteSolveEntry }
  /** The answer to a solveNow request, with the same id. */
  | { t: 'solveResult'; id: number; result: SolveNowResult };

/** What the screen phone sends. */
export type ScreenMessage =
  /** Plate solve now: to align, or for a tap on the rings. */
  | { t: 'solveNow'; id: number; trigger: 'alignment' | 'tap' }
  /** An alignment made on the screen phone, for the finder to use. */
  | { t: 'alignment'; alignment: Alignment | null }
  /** Red night mode, turned on or off on the screen phone, so the finder's screen matches. */
  | { t: 'night'; on: boolean }
  /** Full screen, entered or left on the screen phone, so the finder's screen matches. */
  | { t: 'fullscreen'; on: boolean }
  /** The target chosen on the screen phone, or null when cleared, so the finder guides to it too. */
  | { t: 'target'; id: string | null };

export type RemoteMessage = FinderMessage | ScreenMessage;

/** What a pairing code carries: one side's half of the WebRTC handshake. */
export interface PairingPayload {
  role: RemoteRole;
  /** The session description, with all its network candidates already in it. */
  sdp: string;
}

/** Every pairing code starts with this, so a wrong QR code is told apart at once. */
const CODE_PREFIX = 'AF1:';
const NOT_A_CODE = "This isn't an AstroTurboMaxiSolver pairing code";

/** Bytes through a compression or decompression stream. */
async function throughStream(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = source.pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  for (let read = await reader.read(); !read.done; read = await reader.read()) chunks.push(read.value);
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/** Bytes as base64url text, which is safe in a QR code and when pasted. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * A pairing code, small enough for a QR code a phone reads easily off another's screen.
 * The session description compresses to about a third, since it is repetitive text.
 */
export async function encodePairingCode(payload: PairingPayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ r: payload.role, s: payload.sdp }));
  return CODE_PREFIX + toBase64Url(await throughStream(json, new CompressionStream('deflate-raw')));
}

/** Reads a pairing code. Throws an error with a message for the user when it is wrong. */
export async function decodePairingCode(code: string): Promise<PairingPayload> {
  const text = code.trim();
  if (!text.startsWith(CODE_PREFIX)) throw new Error(NOT_A_CODE);
  try {
    const bytes = await throughStream(
      fromBase64Url(text.slice(CODE_PREFIX.length)),
      new DecompressionStream('deflate-raw'),
    );
    const data = JSON.parse(new TextDecoder().decode(bytes)) as { r?: unknown; s?: unknown };
    if ((data.r === 'finder' || data.r === 'screen') && typeof data.s === 'string')
      return { role: data.r, sdp: data.s };
  } catch {
    // Falls through to the same message: a damaged code is as useless as a wrong one.
  }
  throw new Error(NOT_A_CODE);
}

const MESSAGE_TYPES = new Set([
  'hello',
  'pose',
  'site',
  'alignment',
  'solveLog',
  'solveResult',
  'solveNow',
  'night',
  'fullscreen',
  'target',
]);

/**
 * Reads a message from the other phone, or null if it isn't one. Both phones run the same
 * app, so only the type is checked: a message with a type this version doesn't know is
 * ignored, which lets a newer phone add messages.
 */
export function parseMessage(text: string): RemoteMessage | null {
  try {
    const message = JSON.parse(text) as { t?: unknown };
    return typeof message?.t === 'string' && MESSAGE_TYPES.has(message.t) ? (message as RemoteMessage) : null;
  } catch {
    return null;
  }
}

/** A solve attempt as sent, with its time as text. */
export function toRemoteEntry({ id: _id, at, ...entry }: SolveLogEntry): RemoteSolveEntry {
  return { ...entry, at: at.toISOString() };
}

/** A key for an alignment, to tell whether the other phone already has it. */
export const alignmentKey = (alignment: Alignment | null): string => alignment?.alignedAt ?? 'none';
