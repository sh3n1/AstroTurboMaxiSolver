// The JSON control messages between the puck and this phone (docs/puck.md, "Control
// messages"). Plain functions, so they can be tested without a link.

import { designationText, designations } from '../catalog/designations';
import type { Target } from '../catalog/targets';
import type { TextParams } from '../i18n/t';
import type { ViewMode } from '../sky-map/sky-style';
import { DEFAULT_FIELD_DEG, MAX_FIELD_DEG, MIN_FIELD_DEG, STAR_LIMITS, ZOOM_STEP } from '../sky-map/sky-style';

import type { PuckAlignStarsMessage, PuckAlignStatusMessage } from './puck-align.service';
import { kindCode } from './puck-catalog';
import type { PuckIconMessage } from './puck-icons';
import type { PuckListTargetsMessage, PuckListsMessage } from './puck-lists';
import type { PuckPointingMessage } from './puck-lx200';
import type { PuckObjectsMessage } from './puck-objects';
import type { RemoteSolveEntry } from './remote-link';

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
  /** The phone's motion sensors on or off, from the puck's menu. */
  | { t: 'sensors'; on: boolean }
  /** The next view (map, eyepiece view, field ring), as the app's view tile. */
  | { t: 'view'; next: true }
  /** The menu's Lists opened: which lists there are (answered with `lists`). */
  | { t: 'lists' }
  /** A list chosen in the menu: its targets that are up (answered with `listTargets`). */
  | { t: 'listTargets'; id: string }
  /** A target chosen in a list: it becomes the target, and the list plays from it. */
  | { t: 'play'; list: string; target: string }
  /** The menu's Alignment opened: the stars to align on (answered with `alignStars`). */
  | { t: 'alignStars' }
  /** A star chosen to align on: it becomes the target, to centre (answered with `alignStatus`). */
  | { t: 'alignChoose'; id: string }
  /** The star is centred in the eyepiece: plate solve and align (answered with `alignStatus`). */
  | { t: 'alignNow' }
  /** Remove the alignment, after a second tap on the puck (answered with `alignStars`). */
  | { t: 'alignRemove' }
  /** The puck's LX200 repeater on or off: while on, this phone sends `pointing`. */
  | { t: 'lx200'; on: boolean }
  /** A planetarium's GoTo, through the puck, on the equator and equinox of the date. */
  | { t: 'goto'; raDeg: number; decDeg: number }
  /** How many of the catalogue's bytes have come, after each part, so the next parts go. */
  | { t: 'catalogAck'; bytes: number }
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
  /** The target for the puck's bottom third and map (targetInfoMessage); id null when there is none. */
  | PuckTargetInfoMessage
  /** A planet's icon, flattened for the puck (puck-icons.ts). */
  | PuckIconMessage
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
      /** The sky page's view, for the puck's menu. */
      view: ViewMode;
    }
  /** The words the puck shows, in the app's language (textsMessage). */
  | PuckTextsMessage
  /** The map's rules for the puck's own zoom (mapRulesMessage). */
  | PuckMapRulesMessage
  /** What moves: the Moon, planets and bright asteroids (puck-objects.ts). */
  | PuckObjectsMessage
  /** The lists for the puck's menu, and one list's targets (puck-lists.ts). */
  | PuckListsMessage
  | PuckListTargetsMessage
  /** The puck's guided alignment (puck-align.service.ts). */
  | PuckAlignStarsMessage
  | PuckAlignStatusMessage
  /** Where the telescope points, for the puck's LX200 repeater (puck-lx200.ts). */
  | PuckPointingMessage
  /** The puck's catalogue is current. */
  | { t: 'catalogOk' }
  /** This side's record of the link lost before, for the puck's log: once linked again. */
  | { t: 'appLog'; text: string }
  /**
   * Each plate solve attempt as it ends, this phone's or its finder's, as Two phones sends
   * it (remote-link.ts), so the puck can show "solved" or why not.
   */
  | { t: 'solveLog'; entry: RemoteSolveEntry }
  /** A new catalogue follows on the catalogue channel, in this many parts. */
  | { t: 'catalogStart'; id: string; bytes: number; parts: number; crc32: number };

/**
 * The selected target: `name` for the puck's bottom third, and for its map, `label` (what
 * the map writes beside it, as in the catalogue), `kind` (the catalogue's number, for its
 * colour) and `sizeArcmin` (or null), so the puck draws it first and in full, as the app's
 * map does.
 */
export interface PuckTargetInfoMessage {
  t: 'targetInfo';
  id: string | null;
  name: string;
  /** Every designation, as the target bar's, such as "M31 · NGC 224". */
  designations: string;
  /** The list being observed through, as the sky map's playlist bar: "3/110  Messier", or "". */
  list: string;
  label: string;
  kind: number;
  sizeArcmin: number | null;
}

/**
 * The `targetInfo` message. A planet's or the Moon's `name` is its kind ("planet"), so
 * those go by their label, as the map writes it (and the `objects` message sends it).
 */
export function targetInfoMessage(target: Target | null, list = ''): PuckTargetInfoMessage {
  if (!target) {
    return { t: 'targetInfo', id: null, name: '', designations: '', list: '', label: '', kind: 0, sizeArcmin: null };
  }
  const label = designations(target)[0];
  return {
    t: 'targetInfo',
    id: target.id,
    name: target.body ? label : target.name,
    designations: designationText(target),
    list,
    label,
    kind: kindCode(target.kind),
    sizeArcmin: target.sizeArcmin ?? null,
  };
}

/**
 * Every word the puck shows once linked comes from this phone, in its language, so the
 * firmware needs no translations: the compass points under the horizon, the readout along
 * its top edge, and the data credits for its Settings. Names and designations are never translated, and come in the
 * catalogue and `objects`.
 */
export interface PuckTextsMessage {
  t: 'texts';
  /** The compass points' letters, as the app's map writes them (compass.short). */
  compass: { n: string; e: string; s: string; w: string };
  /** The readout along the top edge, as the app's (readout.altAz, readout.field), with
   *  `{alt}`, `{az}` and `{field}` where the puck writes its numbers. */
  altAz: string;
  field: string;
  /** The puck's menu: its title, items and states (the app's own words where it has them,
   *  else the puck's, under puck.*). */
  words: Record<(typeof PUCK_WORDS)[number][0], string>;
  /** The app's data credits, one per line. */
  credits: string;
}

/** The data credits the puck shows: the data its catalogue holds (Settings, Data credits). */
const CREDIT_KEYS = ['credits.xhip', 'credits.openngc', 'credits.hyg', 'credits.messier', 'credits.caldwell'];

/** The menu's words: the key the puck reads, and the app's translation key. */
const PUCK_WORDS = [
  ['menu', 'menu.title'],
  ['sensors', 'puck.sensors'],
  ['viewSky', 'views.sky'],
  ['viewEyepiece', 'views.eyepiece'],
  ['viewRing', 'views.ring'],
  ['lists', 'menu.lists'],
  ['alignment', 'puck.alignment'],
  ['zoom', 'puck.zoom'],
  ['night', 'menu.night'],
  ['settings', 'settings.title'],
  ['brightness', 'puck.brightness'],
  ['wifi', 'puck.wifi'],
  ['wifiClient', 'puck.wifiClient'],
  ['wifiAp', 'puck.wifiAp'],
  ['lx200', 'puck.lx200'],
  ['on', 'puck.on'],
  ['off', 'puck.off'],
] as const;

/** The `texts` message, in the language translate gives. */
export function textsMessage(translate: (key: string, params?: TextParams) => string): PuckTextsMessage {
  return {
    t: 'texts',
    compass: {
      n: translate('compass.short.N'),
      e: translate('compass.short.E'),
      s: translate('compass.short.S'),
      w: translate('compass.short.W'),
    },
    altAz: translate('readout.altAz', { alt: '{alt}', az: '{az}' }),
    field: translate('readout.field', { field: '{field}' }),
    words: Object.fromEntries(PUCK_WORDS.map(([word, key]) => [word, translate(key)])) as PuckTextsMessage['words'],
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
    case 'sensors':
      return typeof m['on'] === 'boolean' ? { t: 'sensors', on: m['on'] } : null;
    case 'view':
      return m['next'] === true ? { t: 'view', next: true } : null;
    case 'lists':
      return { t: 'lists' };
    case 'listTargets':
      return typeof m['id'] === 'string' ? { t: 'listTargets', id: m['id'] } : null;
    case 'alignStars':
      return { t: 'alignStars' };
    case 'alignChoose':
      return typeof m['id'] === 'string' ? { t: 'alignChoose', id: m['id'] } : null;
    case 'alignNow':
      return { t: 'alignNow' };
    case 'alignRemove':
      return { t: 'alignRemove' };
    case 'lx200':
      return typeof m['on'] === 'boolean' ? { t: 'lx200', on: m['on'] } : null;
    case 'goto':
      return Number.isFinite(m['raDeg']) && Number.isFinite(m['decDeg'])
        ? { t: 'goto', raDeg: m['raDeg'] as number, decDeg: m['decDeg'] as number }
        : null;
    case 'play':
      return typeof m['list'] === 'string' && typeof m['target'] === 'string'
        ? { t: 'play', list: m['list'], target: m['target'] }
        : null;
    case 'catalogAck':
      return typeof m['bytes'] === 'number' ? { t: 'catalogAck', bytes: m['bytes'] } : null;
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
