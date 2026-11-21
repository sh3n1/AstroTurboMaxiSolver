import { describe, expect, it } from 'vitest';

import { parsePuckMessage, textsMessage } from './puck-messages';

describe('puck messages', () => {
  it('reads the commands the puck sends, as its firmware writes them', () => {
    expect(parsePuckMessage('{"t":"solveNow","trigger":"tap"}')).toEqual({ t: 'solveNow', trigger: 'tap' });
    expect(parsePuckMessage('{"t":"step","by":-1}')).toEqual({ t: 'step', by: -1 });
    expect(parsePuckMessage('{"t":"step","by":1}')).toEqual({ t: 'step', by: 1 });
    expect(parsePuckMessage('{"t":"night","on":true}')).toEqual({ t: 'night', on: true });
    expect(parsePuckMessage('{"t":"ping"}')).toEqual({ t: 'ping' });
  });

  it('reads the hello, with or without a catalogue', () => {
    expect(parsePuckMessage('{"t":"puckHello","version":1,"screenPx":466,"catalog":null}')).toEqual({
      t: 'puckHello',
      version: 1,
      screenPx: 466,
      catalog: null,
    });
    expect(parsePuckMessage('{"t":"puckHello","version":1,"screenPx":466,"catalog":"0123456789abcdef"}')).toEqual({
      t: 'puckHello',
      version: 1,
      screenPx: 466,
      catalog: '0123456789abcdef',
    });
  });

  it("reads the catalogue's answers", () => {
    expect(parsePuckMessage('{"t":"catalogDone","id":"0123456789abcdef"}')).toEqual({
      t: 'catalogDone',
      id: '0123456789abcdef',
    });
    expect(parsePuckMessage('{"t":"catalogFailed","reason":"crc"}')).toEqual({ t: 'catalogFailed', reason: 'crc' });
  });

  it("writes the puck's words in the app's language", () => {
    const spanish: Record<string, string> = { 'compass.short.W': 'O', 'credits.xhip': 'Estrellas de XHIP' };
    const message = textsMessage((key) => spanish[key] ?? key);
    expect(message.compass).toEqual({ n: 'compass.short.N', e: 'compass.short.E', s: 'compass.short.S', w: 'O' });
    expect(message.credits.split('\n')[0]).toBe('Estrellas de XHIP');
  });

  it('ignores anything else', () => {
    expect(parsePuckMessage('not json')).toBeNull();
    expect(parsePuckMessage('null')).toBeNull();
    expect(parsePuckMessage('{"t":"step","by":5}')).toBeNull();
    expect(parsePuckMessage('{"t":"night","on":"yes"}')).toBeNull();
    expect(parsePuckMessage('{"t":"somethingNew"}')).toBeNull();
  });
});
