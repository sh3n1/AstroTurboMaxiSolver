// The JSON control messages between the puck and this phone (docs/puck.md, "Control
// messages"). Plain functions, so they can be tested without a link.

/** What the puck sends. */
export type PuckCommand =
  /** A tap on the puck's reticle: plate solve, as a tap on this phone's rings does. */
  | { t: 'solveNow'; trigger: 'tap' }
  /** The puck's left or right arrow: the previous or next target of the list playing. */
  | { t: 'step'; by: -1 | 1 }
  /** Night mode on or off, from the puck's menu. */
  | { t: 'night'; on: boolean };

/** What this phone sends the puck besides the view. */
export type PuckHostMessage =
  /** Always first: the secret from the puck's QR code. */
  | { t: 'auth'; secret: string }
  /** The target's name for the puck's bottom third; id null when there is none. */
  | { t: 'targetInfo'; id: string | null; name: string }
  /** What the puck shows besides the map. */
  | { t: 'state'; night: boolean; solving: boolean; sensorsOn: boolean; aligned: boolean };

/** Reads a message from the puck, or null for anything this phone doesn't know. */
export function parsePuckCommand(text: string): PuckCommand | null {
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof message !== 'object' || message === null) return null;
  const m = message as Record<string, unknown>;
  switch (m['t']) {
    case 'solveNow':
      return { t: 'solveNow', trigger: 'tap' };
    case 'step':
      return m['by'] === 1 || m['by'] === -1 ? { t: 'step', by: m['by'] } : null;
    case 'night':
      return typeof m['on'] === 'boolean' ? { t: 'night', on: m['on'] } : null;
    default:
      return null;
  }
}
