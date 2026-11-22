import { describe, expect, it } from 'vitest';

import en from '../../../assets/i18n/en.json';
import es from '../../../assets/i18n/es.json';
import type { Target } from '../catalog/targets';
import { magnitudeLimit } from '../sky-map/sky-style';

import { mapRulesMessage, parsePuckMessage, targetInfoMessage, textsMessage } from './puck-messages';

describe('puck messages', () => {
  it('reads the commands the puck sends, as its firmware writes them', () => {
    expect(parsePuckMessage('{"t":"solveNow","trigger":"tap"}')).toEqual({ t: 'solveNow', trigger: 'tap' });
    expect(parsePuckMessage('{"t":"step","by":-1}')).toEqual({ t: 'step', by: -1 });
    expect(parsePuckMessage('{"t":"step","by":1}')).toEqual({ t: 'step', by: 1 });
    expect(parsePuckMessage('{"t":"night","on":true}')).toEqual({ t: 'night', on: true });
    expect(parsePuckMessage('{"t":"ping"}')).toEqual({ t: 'ping' });
    expect(parsePuckMessage('{"t":"lists"}')).toEqual({ t: 'lists' });
    expect(parsePuckMessage('{"t":"listTargets","id":"now"}')).toEqual({ t: 'listTargets', id: 'now' });
    expect(parsePuckMessage('{"t":"play","list":"now","target":"M31"}')).toEqual({
      t: 'play',
      list: 'now',
      target: 'M31',
    });
    expect(parsePuckMessage('{"t":"play","list":"now"}')).toBeNull();
    expect(parsePuckMessage('{"t":"alignStars"}')).toEqual({ t: 'alignStars' });
    expect(parsePuckMessage('{"t":"alignChoose","id":"Vega"}')).toEqual({ t: 'alignChoose', id: 'Vega' });
    expect(parsePuckMessage('{"t":"alignChoose"}')).toBeNull();
    expect(parsePuckMessage('{"t":"alignNow"}')).toEqual({ t: 'alignNow' });
    expect(parsePuckMessage('{"t":"alignRemove"}')).toEqual({ t: 'alignRemove' });
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
    expect(parsePuckMessage('{"t":"catalogAck","bytes":32768}')).toEqual({ t: 'catalogAck', bytes: 32768 });
  });

  it("reads the puck menu's sensors and view commands", () => {
    expect(parsePuckMessage('{"t":"sensors","on":false}')).toEqual({ t: 'sensors', on: false });
    expect(parsePuckMessage('{"t":"view","next":true}')).toEqual({ t: 'view', next: true });
    expect(parsePuckMessage('{"t":"sensors"}')).toBeNull();
  });

  it("writes the puck's words in the app's language", () => {
    const spanish: Record<string, string> = { 'compass.short.W': 'O', 'credits.xhip': 'Estrellas de XHIP' };
    const message = textsMessage((key) => spanish[key] ?? key);
    expect(message.compass).toEqual({ n: 'compass.short.N', e: 'compass.short.E', s: 'compass.short.S', w: 'O' });
    expect(message.credits.split('\n')[0]).toBe('Estrellas de XHIP');
  });

  it("sends the puck's menu words, which exist in every language", () => {
    for (const translations of [en, es]) {
      const translate = (key: string) =>
        key.split('.').reduce<unknown>((at, part) => (at as Record<string, unknown>)?.[part], translations) as string;
      const words = textsMessage(translate).words;
      for (const word of Object.values(words)) expect(typeof word).toBe('string');
    }
  });

  it("leaves the readout's numbers for the puck to write", () => {
    const fill = (key: string, params?: Record<string, string | number>) =>
      key === 'readout.field' ? `Campo ${params?.['field']}°` : `Alt ${params?.['alt']}° Az ${params?.['az']}°`;
    const message = textsMessage(fill);
    expect(message.altAz).toBe('Alt {alt}° Az {az}°');
    expect(message.field).toBe('Campo {field}°');
  });

  it('names a planet by its own name, not its kind', () => {
    const saturn = { id: 'Saturn', name: 'planet', kind: 'planet', body: 'Saturn', raDeg: 0, decDeg: 0, mag: 0.5 };
    expect(targetInfoMessage(saturn as Target)).toEqual({ t: 'targetInfo', id: 'Saturn', name: 'Saturn' });
    const crab = { id: 'M1', name: 'Crab Nebula', kind: 'nebula', raDeg: 83.6, decDeg: 22, mag: 8.4 };
    expect(targetInfoMessage(crab as Target).name).toBe('Crab Nebula');
    expect(targetInfoMessage(null)).toEqual({ t: 'targetInfo', id: null, name: '' });
  });

  it("sends the puck the map's own rules for its zoom", () => {
    const { field, starLimits } = mapRulesMessage();
    expect(field).toEqual({ minDeg: 5, maxDeg: 120, step: 1.5, startDeg: 20 });
    // The puck picks the first limit whose field its own is at least, as the map does.
    for (const fieldDeg of [120, 90, 60, 40, 20, 5]) {
      const limit = starLimits.find(([from]) => fieldDeg >= from)?.[1];
      expect(limit).toBe(magnitudeLimit(fieldDeg));
    }
  });

  it('ignores anything else', () => {
    expect(parsePuckMessage('not json')).toBeNull();
    expect(parsePuckMessage('null')).toBeNull();
    expect(parsePuckMessage('{"t":"step","by":5}')).toBeNull();
    expect(parsePuckMessage('{"t":"night","on":"yes"}')).toBeNull();
    expect(parsePuckMessage('{"t":"somethingNew"}')).toBeNull();
  });
});
