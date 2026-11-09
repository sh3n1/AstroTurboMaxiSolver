import { describe, expect, it } from 'vitest';

import { isShutterPress } from './shutter-remote';

const press = (key: string, extra: { repeat?: boolean; target?: object | null } = {}) => ({
  key,
  repeat: extra.repeat ?? false,
  target: (extra.target ?? null) as EventTarget | null,
});

describe('shutter remote', () => {
  it('takes the keys shutter remotes send', () => {
    expect(isShutterPress(press('AudioVolumeUp'))).toBe(true);
    expect(isShutterPress(press('AudioVolumeDown'))).toBe(true);
    expect(isShutterPress(press('Enter'))).toBe(true);
  });

  it('ignores other keys, and a held key repeating', () => {
    expect(isShutterPress(press('a'))).toBe(false);
    expect(isShutterPress(press('ArrowUp'))).toBe(false);
    expect(isShutterPress(press('AudioVolumeUp', { repeat: true }))).toBe(false);
  });

  it('ignores Enter while typing in a text box', () => {
    expect(isShutterPress(press('Enter', { target: { tagName: 'INPUT' } }))).toBe(false);
    expect(isShutterPress(press('Enter', { target: { tagName: 'DIV', isContentEditable: true } }))).toBe(false);
    expect(isShutterPress(press('Enter', { target: { tagName: 'BODY' } }))).toBe(true);
  });
});
