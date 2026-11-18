// The Royal Astronomical Society of Canada's Explore the Universe programme, for beginners
// with binoculars or a small telescope, as in its workbook (6th edition, 2018) at
// https://rasc.ca/sites/default/files/EtUworkbookComplete%2002%2013%202020%20for%20web.pdf.
// The designations are facts; the credit is in Settings.
//
// Its 24 deep-sky objects come first, then its 20 double stars, each in the workbook's
// order. The Double Cluster is one entry there, here a row for each half. Most doubles are
// named stars in the app's data, such as Mizar or Albireo, or Washington Double Star pairs
// such as STF 2078 (17 and 16 Draconis). The four the data lacks are the app's own, in
// extra-targets.ts.

/** The Explore the Universe deep-sky objects and double stars, in the workbook's order. */
export const RASC_EXPLORE_THE_UNIVERSE: readonly string[] = [
  // Deep-sky objects
  'M44',
  'Mel 111',
  'M5',
  'M13',
  'M4',
  'M16',
  'M8',
  'M17',
  'M22',
  'M23',
  'M24',
  'M25',
  'M11',
  'Cr 399',
  'M31',
  'Mel 20',
  'NGC 869',
  'NGC 884',
  'M45',
  'Mel 25',
  "Kemble's Cascade",
  'M37',
  'M42',
  'M35',
  'M47',
  // Double stars: spring
  'Adhafera', // Zeta and 35 Leonis
  '17 Com',
  '32 Com', // 32 and 33 Comae Berenices
  'BU 608', // 15 and 17 Canum Venaticorum
  'Mizar', // With Alcor, 80 Ursae Majoris
  'Zubenelgenubi', // Alpha 1 and 2 Librae
  'Alkalurops', // Mu 1 and 2 Bootis
  'Nu CrB', // Nu 1 and 2 Coronae Borealis
  'STF 2078', // 17 and 16 Draconis
  'Kuma', // Nu 1 and 2 Draconis
  // Summer
  'Double Double', // Epsilon 1 and 2 Lyrae
  'Nasr Alwaki', // Zeta 1 and 2 Lyrae
  'Delta Lyr', // Delta 1 and 2 Lyrae
  'Algedi', // Alpha 1 and 2 Capricorni
  'Dabih', // Beta 1 and 2 Capricorni
  'STFA 50', // Omicron 1 Cygni, with 30 Cygni
  'Albireo', // Beta Cygni
  // Autumn and winter
  'STFA 46', // 16 Cygni
  'Chamukuy', // Theta 1 and 2 Tauri
  'STFA 58', // Delta Cephei
];
