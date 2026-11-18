// Bluetooth camera shutter remotes. They pair with the phone as a small keyboard and,
// depending on the model, send Volume Up, Volume Down or Enter when pressed. With the
// setting on, the Align page treats a press as tapping its big round button.

/** The keys shutter remotes send, as the browser names them. */
const SHUTTER_KEYS = new Set(['AudioVolumeUp', 'AudioVolumeDown', 'VolumeUp', 'VolumeDown', 'Enter']);

/**
 * Whether a key press came from a shutter remote. A held key repeats, and only the first
 * press counts. Typing in a text box is never taken for a press.
 */
export function isShutterPress(event: Pick<KeyboardEvent, 'key' | 'repeat' | 'target'>): boolean {
  if (event.repeat || !SHUTTER_KEYS.has(event.key)) return false;
  const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
  const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable === true;
  return !typing;
}
