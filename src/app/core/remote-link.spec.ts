import { describe, expect, it } from 'vitest';

import { alignmentKey, decodePairingCode, encodePairingCode, parseMessage, toRemoteEntry } from './remote-link';

/** A session description like a phone's, long and repetitive. */
const SDP = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:1 1 udp 2113937151 3b8f1a2c-6f0e-4b8e-9d1a-2f4c6e8a0b1c.local 54321 typ host generation 0',
  'a=ice-ufrag:abcd',
  'a=ice-pwd:aaaaaaaaaaaaaaaaaaaaaaaa',
  'a=fingerprint:sha-256 ' + Array.from({ length: 32 }, (_, i) => (i * 7).toString(16).padStart(2, '0')).join(':'),
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
].join('\r\n');

describe('pairing codes', () => {
  it('carries the role and session description, shorter than the description itself', async () => {
    const code = await encodePairingCode({ role: 'finder', sdp: SDP });
    expect(code.startsWith('AF1:')).toBe(true);
    expect(code).toMatch(/^AF1:[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(SDP.length);
    expect(await decodePairingCode(`  ${code}\n`)).toEqual({ role: 'finder', sdp: SDP });
  });

  it('refuses anything else with a message for the user', async () => {
    await expect(decodePairingCode('https://example.com')).rejects.toThrow(
      "This isn't an AstroTurboMaxiSolver pairing code",
    );
    await expect(decodePairingCode('AF1:not-really')).rejects.toThrow(
      "This isn't an AstroTurboMaxiSolver pairing code",
    );
  });
});

describe('link messages', () => {
  it('reads known messages and ignores anything else', () => {
    expect(parseMessage('{"t":"solveNow","id":1,"trigger":"tap"}')).toEqual({ t: 'solveNow', id: 1, trigger: 'tap' });
    expect(parseMessage('{"t":"fullscreen","on":true}')).toEqual({ t: 'fullscreen', on: true });
    expect(parseMessage('{"t":"somethingNew"}')).toBeNull();
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage('null')).toBeNull();
  });

  it('sends a solve attempt with its time as text, without the local id', () => {
    const entry = toRemoteEntry({
      id: 7,
      at: new Date('2026-11-15T22:00:00.000Z'),
      trigger: 'auto',
      outcome: 'failed',
      message: 'No stars',
      starCount: 0,
      matched: 0,
      iso: 800,
      frames: 1,
      durationMs: 900,
      sensorErrorDeg: null,
    });
    expect(entry).not.toHaveProperty('id');
    expect(entry.at).toBe('2026-11-15T22:00:00.000Z');
  });

  it('tells alignments apart by when they were made', () => {
    expect(alignmentKey(null)).toBe('none');
    expect(
      alignmentKey({ starId: 'Vega', alignedAt: '2026-11-15T22:00:00.000Z', mount: 'direct', offset: [0, 0, 1] }),
    ).toBe('2026-11-15T22:00:00.000Z');
  });
});
