import { describe, expect, it } from 'vitest';

import { parsePuckCommand } from './puck-messages';

describe('puck messages', () => {
  it('reads the commands the puck sends, as its firmware writes them', () => {
    expect(parsePuckCommand('{"t":"solveNow","trigger":"tap"}')).toEqual({ t: 'solveNow', trigger: 'tap' });
    expect(parsePuckCommand('{"t":"step","by":-1}')).toEqual({ t: 'step', by: -1 });
    expect(parsePuckCommand('{"t":"step","by":1}')).toEqual({ t: 'step', by: 1 });
    expect(parsePuckCommand('{"t":"night","on":true}')).toEqual({ t: 'night', on: true });
  });

  it('ignores anything else', () => {
    expect(parsePuckCommand('not json')).toBeNull();
    expect(parsePuckCommand('null')).toBeNull();
    expect(parsePuckCommand('{"t":"step","by":5}')).toBeNull();
    expect(parsePuckCommand('{"t":"night","on":"yes"}')).toBeNull();
    expect(parsePuckCommand('{"t":"somethingNew"}')).toBeNull();
  });
});
