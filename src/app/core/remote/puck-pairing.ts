// Pairing with the puck, the hand remote (docs/puck.md). The puck has a screen but no
// camera, so it can't read a reply code as a second phone does. Instead its one QR code holds
// everything this phone needs to connect: its address, its WebRTC credentials, its
// certificate's fingerprint, and a secret. This phone builds the puck's answer from them,
// and sends the secret as its first message, so the puck knows who scanned its screen.
// Plain functions, so they can be tested without a link.

/** Every puck code starts with this, so it is told apart from a phone's code at once. */
const PUCK_PREFIX = 'AFP1:';
const NOT_A_PUCK_CODE = "This isn't a puck's code";

/** The puck's ICE username and password are made by libpeer with exactly these lengths. */
const UFRAG_LENGTH = 4;
const PWD_LENGTH = 24;
const FINGERPRINT_BYTES = 32; // SHA-256
const SECRET_BYTES = 16;
/** IPv4, port, ICE username, ICE password, fingerprint, secret. */
const PAYLOAD_BYTES = 4 + 2 + UFRAG_LENGTH + PWD_LENGTH + FINGERPRINT_BYTES + SECRET_BYTES;

/** What a puck's code holds. */
export interface PuckCode {
  /** The puck's address on the network, such as "192.168.1.140". */
  ip: string;
  port: number;
  /** The puck's ICE credentials. */
  ufrag: string;
  pwd: string;
  /** The puck's DTLS certificate's SHA-256, as "AB:CD:…", as session descriptions write it. */
  fingerprint: string;
  /** The secret to send first, in base64url. */
  secret: string;
}

/** Whether a scanned or pasted text is a puck's code rather than a phone's. */
export function isPuckCode(code: string): boolean {
  return code.trim().startsWith(PUCK_PREFIX);
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Reads a puck's code. Throws an error with a message for the user when it is wrong. */
export function decodePuckCode(code: string): PuckCode {
  const text = code.trim();
  if (!text.startsWith(PUCK_PREFIX)) throw new Error(NOT_A_PUCK_CODE);
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(text.slice(PUCK_PREFIX.length));
  } catch {
    throw new Error(NOT_A_PUCK_CODE);
  }
  if (bytes.length !== PAYLOAD_BYTES) throw new Error(NOT_A_PUCK_CODE);

  let at = 0;
  const take = (length: number): Uint8Array => bytes.slice(at, (at += length));
  const ascii = (part: Uint8Array): string => String.fromCharCode(...part);
  const ip = [...take(4)].join('.');
  const [high, low] = take(2);
  const ufrag = ascii(take(UFRAG_LENGTH));
  const pwd = ascii(take(PWD_LENGTH));
  const fingerprint = [...take(FINGERPRINT_BYTES)]
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(':');
  const secret = toBase64Url(take(SECRET_BYTES));
  return { ip, port: (high << 8) | low, ufrag, pwd, fingerprint, secret };
}

/**
 * The puck's answer to this phone's offer, written from its code. The puck is ICE-lite (it
 * only answers this phone's checks, since it doesn't know this phone's credentials) and the
 * DTLS server. The data channel's media id must be the offer's.
 */
export function puckAnswer(puck: PuckCode, offerSdp: string): string {
  const mid = /^a=mid:(\S+)/m.exec(offerSdp)?.[1] ?? '0';
  return (
    [
      'v=0',
      'o=- 1 1 IN IP4 127.0.0.1',
      's=-',
      't=0 0',
      `a=group:BUNDLE ${mid}`,
      'a=ice-lite',
      `m=application ${puck.port} UDP/DTLS/SCTP webrtc-datachannel`,
      `c=IN IP4 ${puck.ip}`,
      `a=mid:${mid}`,
      `a=ice-ufrag:${puck.ufrag}`,
      `a=ice-pwd:${puck.pwd}`,
      `a=fingerprint:sha-256 ${puck.fingerprint}`,
      'a=setup:passive',
      'a=sctp-port:5000',
      'a=max-message-size:262144',
      `a=candidate:1 1 udp 2130706431 ${puck.ip} ${puck.port} typ host`,
      'a=end-of-candidates',
    ].join('\r\n') + '\r\n'
  );
}
