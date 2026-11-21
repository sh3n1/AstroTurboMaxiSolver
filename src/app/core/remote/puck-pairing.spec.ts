import { describe, expect, it } from 'vitest';

import { decodePuckCode, isPuckCode, puckAnswer } from './puck-pairing';

/** A puck code as the firmware makes it (main/link.c in AstroTurboMaxiPuck). */
function makeCode(): string {
  const bytes = [
    ...[192, 168, 1, 140], // IP
    ...[0xdc, 0x45], // port 56389
    ...[...'abcd'].map((c) => c.charCodeAt(0)), // ICE username
    ...[...'0123456789abcdefghijklmn'].map((c) => c.charCodeAt(0)), // ICE password
    ...Array.from({ length: 32 }, (_, i) => i), // fingerprint 00:01:…:1F
    ...Array.from({ length: 16 }, () => 0xff), // secret
  ];
  const base64 = btoa(String.fromCharCode(...bytes));
  return 'AFP1:' + base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('puck pairing', () => {
  it('tells a puck code from a phone code', () => {
    expect(isPuckCode(makeCode())).toBe(true);
    expect(isPuckCode('AF1:abc')).toBe(false);
  });

  it('reads every field of a puck code', () => {
    const puck = decodePuckCode(makeCode());
    expect(puck.ip).toBe('192.168.1.140');
    expect(puck.port).toBe(56389);
    expect(puck.ufrag).toBe('abcd');
    expect(puck.pwd).toBe('0123456789abcdefghijklmn');
    expect(puck.fingerprint.startsWith('00:01:02:')).toBe(true);
    expect(puck.fingerprint.endsWith(':1F')).toBe(true);
    expect(puck.secret).toBe('_____________________w');
  });

  it('refuses a code that is not a puck code, or is damaged', () => {
    expect(() => decodePuckCode('AF1:abc')).toThrow();
    expect(() => decodePuckCode('AFP1:abc')).toThrow();
  });

  it("writes the puck's answer with the offer's media id", () => {
    const answer = puckAnswer(
      decodePuckCode(makeCode()),
      'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:dc\r\n',
    );
    expect(answer).toContain('a=mid:dc\r\n');
    expect(answer).toContain('a=group:BUNDLE dc\r\n');
    expect(answer).toContain('a=ice-lite\r\n');
    expect(answer).toContain('a=setup:passive\r\n');
    expect(answer).toContain('a=candidate:1 1 udp 2130706431 192.168.1.140 56389 typ host\r\n');
    expect(answer.endsWith('\r\n')).toBe(true);
  });
});
