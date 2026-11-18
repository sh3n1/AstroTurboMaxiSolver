import { describe, expect, it } from 'vitest';

import { makePlaylist, parsePlaylist, stepIndex } from './playlist';

const IDS = ['M1', 'M2', 'M3', 'M4', 'M5'];
const allUp = (): boolean => true;

describe('makePlaylist', () => {
  it('keeps each target once, in its first place', () => {
    expect(makePlaylist('Mixed', ['M1', 'NGC 1', 'M1', 'M2'], '/tabs/lists/x').ids).toEqual(['M1', 'NGC 1', 'M2']);
  });
});

describe('stepIndex', () => {
  it('steps forward and back', () => {
    expect(stepIndex(IDS, 1, 1, allUp)).toBe(2);
    expect(stepIndex(IDS, 1, -1, allUp)).toBe(0);
  });

  it('stops at either end, like a playlist that does not repeat', () => {
    expect(stepIndex(IDS, 4, 1, allUp)).toBeNull();
    expect(stepIndex(IDS, 0, -1, allUp)).toBeNull();
  });

  it('skips targets below the horizon', () => {
    const up = (id: string): boolean => id !== 'M3' && id !== 'M4';
    expect(stepIndex(IDS, 1, 1, up)).toBe(4);
    expect(stepIndex(IDS, 4, -1, up)).toBe(1);
  });

  it('gives nothing when every target that way is below the horizon', () => {
    expect(stepIndex(IDS, 2, 1, (id) => id === 'M1')).toBeNull();
  });

  it('starts from an end when the selected target is not in the list', () => {
    expect(stepIndex(IDS, -1, 1, allUp)).toBe(0);
    expect(stepIndex(IDS, -1, -1, allUp)).toBe(4);
  });
});

describe('parsePlaylist', () => {
  it('reads back a saved playlist', () => {
    const saved = makePlaylist('Messier', IDS, '/tabs/lists/messier');
    expect(parsePlaylist(JSON.stringify(saved))).toEqual(saved);
  });

  it('ignores nothing, broken text and empty lists', () => {
    expect(parsePlaylist(null)).toBeNull();
    expect(parsePlaylist('{oops')).toBeNull();
    expect(parsePlaylist(JSON.stringify({ name: 'x', from: '/', ids: [] }))).toBeNull();
    expect(parsePlaylist(JSON.stringify({ name: 'x', from: '/', ids: [1, 2] }))).toBeNull();
  });
});
