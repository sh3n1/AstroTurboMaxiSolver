// NASA's Hubble Night Sky Challenge, run with the Astronomical League: for each month,
// Messier and Caldwell objects Hubble has imaged, for northern and for southern observers,
// easiest first. From https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubbles-night-sky-challenge/.
// The designations are facts; the credit is in Settings, without suggesting that NASA
// endorses the app.

export type Month =
  | 'january'
  | 'february'
  | 'march'
  | 'april'
  | 'may'
  | 'june'
  | 'july'
  | 'august'
  | 'september'
  | 'october'
  | 'november'
  | 'december';

/** Each month's objects, easiest first, for each hemisphere. */
export const HUBBLE_NIGHT_SKY_CHALLENGE: Record<Month, { north: readonly string[]; south: readonly string[] }> = {
  january: {
    north: ['M42', 'M1', 'M43', 'M78', 'M79', 'C46'],
    south: ['M42', 'M1', 'M43', 'M78', 'M79', 'C73', 'C103', 'C46'],
  },
  february: {
    north: ['M46', 'C7', 'C58', 'C25', 'C39'],
    south: ['C71', 'C96', 'M46', 'C58', 'C25', 'C39'],
  },
  march: {
    north: ['M44', 'M48', 'M67', 'C48'],
    south: ['M44', 'M48', 'M67', 'C48', 'C90'],
  },
  april: {
    north: ['M65', 'M66', 'M81', 'M82', 'C53', 'C59', 'M95', 'M96', 'C40'],
    south: ['C100', 'M65', 'M66', 'C53', 'C59', 'C92', 'M95', 'M96', 'C40'],
  },
  may: {
    north: ['M51', 'M53', 'M64', 'M104', 'C21', 'C32', 'C52', 'M87'],
    south: ['C80', 'C94', 'M51', 'M53', 'M64', 'M104', 'C21', 'C32', 'C52', 'C77', 'C108', 'M87'],
  },
  june: {
    north: ['M3', 'M5', 'M80', 'M83', 'M101', 'C45', 'C66'],
    south: ['M3', 'M5', 'C89', 'M80', 'M83', 'C45', 'C66'],
  },
  july: {
    north: ['M13', 'M92', 'M4', 'M62', 'M107'],
    south: ['M13', 'M92', 'C76', 'C82', 'M4', 'M62', 'M107', 'C81', 'C107', 'C69'],
  },
  august: {
    north: ['M8', 'M11', 'M16', 'M22', 'M57', 'M20', 'C6'],
    south: ['M8', 'M11', 'M16', 'M22', 'M57', 'C86', 'C93', 'M20', 'C78', 'C101', 'C68'],
  },
  september: {
    north: ['M15', 'M27', 'M55', 'M75', 'C20', 'C27', 'C55', 'C57', 'M71', 'C15'],
    south: ['M15', 'M27', 'M55', 'M75', 'C20', 'C27', 'C55', 'C57', 'M71'],
  },
  october: {
    north: ['M2', 'M30', 'C22', 'C63', 'C2', 'C43'],
    south: ['M2', 'C106', 'M30', 'C22', 'C63', 'C43'],
  },
  november: {
    north: ['M31', 'C14', 'M32', 'C23', 'C56', 'C65', 'M33', 'M74', 'M110'],
    south: ['M31', 'M32', 'C23', 'C56', 'C65', 'C104', 'M33', 'M74', 'M110'],
  },
  december: {
    north: ['M45', 'C5', 'C67', 'M77', 'C24'],
    south: ['M45', 'C67', 'C87', 'M77', 'C24'],
  },
};
