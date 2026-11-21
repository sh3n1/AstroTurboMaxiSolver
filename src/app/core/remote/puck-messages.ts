// The JSON control messages between the puck and this phone (docs/puck.md, "Control
// messages"). Plain functions, so they can be tested without a link.

import { DEFAULT_FIELD_DEG, MAX_FIELD_DEG, MIN_FIELD_DEG, STAR_LIMITS, ZOOM_STEP } from '../sky-map/sky-style';

import type { PuckObjectsMessage } from './puck-objects';

/** What the puck sends. */
export type PuckMessage =
  /** Once paired: what the puck is, and the id of the catalogue it holds, or null. */
  | { t: 'puckHello'; version: number; screenPx: number; catalog: string | null }
  /** A tap on the puck's reticle: plate solve, as a tap on this phone's rings does. */
  | { t: 'solveNow'; trigger: 'tap' }
  /** The puck's left or right arrow: the previous or next target of the list playing. */
  | { t: 'step'; by: -1 | 1 }
  /** Night mode on or off, from the puck's menu. */
  | { t: 'night'; on: boolean }
  /** The catalogue sent is received, checked and kept. */
  | { t: 'catalogDone'; id: string }
  /** It wasn't: the CRC didn't match, or there was no room. */
  | { t: 'catalogFailed'; reason: string }
  /** Nothing else to say for a second: the puck is still there. */
  | { t: 'ping' };

/** What this phone sends the puck besides the view and the catalogue's bytes. */
export type PuckHostMessage =
  /** Always first: the secret from the puck's QR code. */
  | { t: 'auth'; secret: string }
  /** The target's name for the puck's bottom third; id null when there is none. */
  | { t: 'targetInfo'; id: string | null; name: string }
  /**
   * What the puck shows besides the map. eyepieceFieldDeg: the eyepiece's true field, for
   * its circle in the eyepiece view and for "on target" (within half of it), as the app's.
   */
  | {
      t: 'state';
      night: boolean;
      solving: boolean;
      sensorsOn: boolean;
      aligned: boolean;
      eyepieceFieldDeg: number;
    }
  /** The words the puck shows, in the app's language (textsMessage). */
  | PuckTextsMessage
  /** The map's rules for the puck's own zoom (mapRulesMessage). */
  | PuckMapRulesMessage
  /** What moves: the Moon, planets and bright asteroids (puck-objects.ts). */
  | PuckObjectsMessage
  /** The puck's catalogue is current. */
  | { t: 'catalogOk' }
  /** A new catalogue follows on the catalogue channel, in this many parts. */
  | { t: 'catalogStart'; id: string; bytes: number; parts: number; crc32: number };

/**
 * Every word the puck shows once linked comes from this phone, in its language, so the
 * firmware needs no translations: the compass points under the horizon, and the data
 * credits for its Settings. Names and designations are never translated, and come in the
 * catalogue and `objects`.
 */
export interface PuckTextsMessage {
  t: 'texts';
  /** The compass points' letters, as the app's map writes them (compass.short). */
  compass: { n: string; e: string; s: string; w: string };
  /** The app's data credits, one per line. */
  credits: string;
}

/** The data credits the puck shows: the data its catalogue holds (Settings, Data credits). */
const CREDIT_KEYS = ['credits.xhip', 'credits.openngc', 'credits.hyg', 'credits.messier', 'credits.caldwell'];

/** The `texts` message, in the language translate gives. */
export function textsMessage(translate: (key: string) => string): PuckTextsMessage {
  return {
    t: 'texts',
    compass: {
      n: translate('compass.short.N'),
      e: translate('compass.short.E'),
      s: translate('compass.short.S'),
      w: translate('compass.short.W'),
    },
    credits: CREDIT_KEYS.map((key) => translate(key)).join('\n'),
  };
}

/**
 * The puck zooms its own sky map, apart from this phone's (docs/puck.md, "The puck's
 * zoom"), with the same rules as this phone's map: the field's limits and step, where it
 * starts, and how faint the stars go at each field.
 */
export interface PuckMapRulesMessage {
  t: 'mapRules';
  field: { minDeg: number; maxDeg: number; step: number; startDeg: number };
  /** [field, magnitude], widest first: the faintest stars from that field up. */
  starLimits: (readonly [number, number])[];
}

export function mapRulesMessage(): PuckMapRulesMessage {
  return {
    t: 'mapRules',
    field: { minDeg: MIN_FIELD_DEG, maxDeg: MAX_FIELD_DEG, step: ZOOM_STEP, startDeg: DEFAULT_FIELD_DEG },
    starLimits: [...STAR_LIMITS],
  };
}

/** Reads a message from the puck, or null for anything this phone doesn't know. */
export function parsePuckMessage(text: string): PuckMessage | null {
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof message !== 'object' || message === null) return null;
  const m = message as Record<string, unknown>;
  switch (m['t']) {
    case 'puckHello': {
      const catalog = typeof m['catalog'] === 'string' ? m['catalog'] : null;
      const version = typeof m['version'] === 'number' ? m['version'] : 0;
      const screenPx = typeof m['screenPx'] === 'number' ? m['screenPx'] : 0;
      return { t: 'puckHello', version, screenPx, catalog };
    }
    case 'solveNow':
      return { t: 'solveNow', trigger: 'tap' };
    case 'step':
      return m['by'] === 1 || m['by'] === -1 ? { t: 'step', by: m['by'] } : null;
    case 'night':
      return typeof m['on'] === 'boolean' ? { t: 'night', on: m['on'] } : null;
    case 'catalogDone':
      return typeof m['id'] === 'string' ? { t: 'catalogDone', id: m['id'] } : null;
    case 'catalogFailed':
      return { t: 'catalogFailed', reason: typeof m['reason'] === 'string' ? m['reason'] : '' };
    case 'ping':
      return { t: 'ping' };
    default:
      return null;
  }
}
