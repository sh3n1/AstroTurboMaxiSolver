// Objects the app needs that none of its catalogue files has, kept apart from them.
// OpenNGC's file must hold OpenNGC data only, so these can't go there. Most come from the
// observing lists, which give their positions, magnitudes and sizes: the facts are taken
// from each list's own table, rounded. Positions are J2000, like the rest of the catalogue.

import { NO_MAGNITUDE } from './constellations';
import type { Target } from './targets';

/** Degrees of right ascension from hours and minutes. */
const ra = (hours: number, minutes: number): number => Number(((hours + minutes / 60) * 15).toFixed(3));
/** Degrees of declination from signed degrees and minutes: dec(-13, 58) is −13° 58′. */
const dec = (degrees: number, minutes: number): number =>
  Number((Math.sign(degrees || 1) * (Math.abs(degrees) + minutes / 60)).toFixed(3));

export const EXTRA_TARGETS: readonly Target[] = [
  // The brightest star cloud in M31, on the Herschel II list. OpenNGC counts it as part
  // of M31, so it has no entry of its own there. Position from NED; no agreed magnitude.
  {
    id: 'NGC 206',
    name: 'Star cloud in M31',
    kind: 'Open cluster',
    raDeg: 10.13,
    decDeg: 40.739,
    mag: NO_MAGNITUDE,
    sizeArcmin: 4.2,
  },

  // Star clusters, from the Astronomical League's Urban list, the RASC's Explore the
  // Universe and Deep-Sky Gems, and the ASSA Top-100.
  { id: 'Mel 20', name: 'Alpha Persei Cluster', kind: 'Open cluster', raDeg: ra(3, 22), decDeg: dec(49, 0), mag: 1.2 },
  {
    id: 'Mel 111',
    name: 'Coma Star Cluster',
    kind: 'Open cluster',
    raDeg: ra(12, 25),
    decDeg: dec(26, 0),
    mag: 1.8,
    sizeArcmin: 275,
  },
  {
    id: 'Cr 399',
    name: 'Coathanger',
    aliases: "Brocchi's Cluster",
    kind: 'Open cluster',
    raDeg: ra(19, 25.4),
    decDeg: dec(20, 11),
    mag: 3.6,
  },
  {
    id: 'Cr 463',
    name: 'Open cluster',
    kind: 'Open cluster',
    raDeg: ra(1, 48.4),
    decDeg: dec(71, 57),
    mag: NO_MAGNITUDE,
  },
  {
    id: 'Stock 2',
    name: 'Open cluster',
    kind: 'Open cluster',
    raDeg: ra(2, 15),
    decDeg: dec(59, 16),
    mag: NO_MAGNITUDE,
  },
  {
    id: 'Stock 23',
    name: 'Open cluster',
    kind: 'Open cluster',
    raDeg: ra(3, 16),
    decDeg: dec(60, 2),
    mag: NO_MAGNITUDE,
  },
  {
    id: 'Tr 2',
    name: 'Open cluster',
    kind: 'Open cluster',
    raDeg: ra(2, 37.3),
    decDeg: dec(55, 59),
    mag: NO_MAGNITUDE,
  },
  {
    id: 'Tr 3',
    name: 'Open cluster',
    kind: 'Open cluster',
    raDeg: ra(3, 11.8),
    decDeg: dec(63, 15),
    mag: NO_MAGNITUDE,
  },
  {
    id: 'Mel 227',
    name: 'Open cluster',
    aliases: 'Collinder 411',
    kind: 'Open cluster',
    raDeg: ra(20, 12),
    decDeg: dec(-79, 19),
    mag: 5.3,
    sizeArcmin: 50,
  },
  {
    id: 'Tombaugh 5',
    name: 'Open cluster',
    kind: 'Open cluster',
    raDeg: ra(3, 47.8),
    decDeg: dec(59, 3),
    mag: 8.4,
    sizeArcmin: 14,
  },

  // Asterisms: chance lines and shapes of stars.
  {
    id: "Kemble's Cascade",
    name: 'Star chain',
    kind: 'Other',
    type: 'Ast',
    raDeg: ra(3, 57),
    decDeg: dec(63, 0),
    mag: 4,
    sizeArcmin: 180,
  },
  {
    id: 'Levy 384',
    name: 'Compact asterism',
    kind: 'Other',
    type: 'Ast',
    raDeg: ra(8, 15.6),
    decDeg: dec(-13, 58),
    mag: 12,
    sizeArcmin: 2,
  },
  {
    id: 'Levy 401',
    name: 'Churchill’s "V" Signal',
    kind: 'Other',
    type: 'Ast',
    raDeg: ra(9, 6.5),
    decDeg: dec(38, 30),
    mag: 4.5,
    sizeArcmin: 50,
  },

  // Nebulae, bright and dark. Dark nebulae have no magnitude.
  {
    id: 'Levy 403',
    name: 'Daffy Duck Nebula',
    kind: 'Nebula',
    type: 'Neb',
    raDeg: ra(21, 8),
    decDeg: dec(46, 10),
    mag: 5.9,
    sizeArcmin: 7,
  },
  {
    id: 'Dark Doodad',
    name: 'Dark nebula',
    kind: 'Nebula',
    type: 'DrkN',
    raDeg: ra(12, 27),
    decDeg: dec(-71, 25),
    mag: NO_MAGNITUDE,
    sizeArcmin: 80,
    minorArcmin: 3,
  },
  {
    id: 'B 228',
    name: 'Dark nebula',
    kind: 'Nebula',
    type: 'DrkN',
    raDeg: ra(15, 45),
    decDeg: dec(-34, 24),
    mag: NO_MAGNITUDE,
    sizeArcmin: 240,
    minorArcmin: 20,
  },
  {
    id: 'B 78',
    name: 'Pipe Nebula',
    aliases: 'B 59 B 65 B 66 B 67 LDN 1740',
    kind: 'Nebula',
    type: 'DrkN',
    raDeg: ra(17, 25),
    decDeg: dec(-26, 30),
    mag: NO_MAGNITUDE,
    sizeArcmin: 420,
  },
  {
    id: 'DCld 359.8-17.9',
    name: 'R CrA dark cloud',
    kind: 'Nebula',
    type: 'DrkN',
    raDeg: ra(19, 2),
    decDeg: dec(-37, 3),
    mag: NO_MAGNITUDE,
    sizeArcmin: 110,
    minorArcmin: 28,
  },

  // Galaxies, and a quasar.
  {
    id: 'LMC',
    name: 'Large Magellanic Cloud',
    kind: 'Galaxy',
    hubble: 'I',
    raDeg: ra(5, 24),
    decDeg: dec(-69, 45),
    mag: 0.5,
    sizeArcmin: 660,
    minorArcmin: 540,
  },
  {
    id: 'UGC 5373',
    name: 'Sextans B',
    kind: 'Galaxy',
    hubble: 'I',
    raDeg: ra(10, 0),
    decDeg: dec(5, 20),
    mag: 11.3,
    sizeArcmin: 5.5,
    minorArcmin: 3.7,
  },
  {
    id: 'UGC 6253',
    name: 'Leo II',
    kind: 'Galaxy',
    hubble: 'E',
    raDeg: ra(11, 13.5),
    decDeg: dec(22, 10),
    mag: 12,
    sizeArcmin: 15,
    minorArcmin: 12.5,
  },
  {
    id: 'Arp 321',
    name: 'Galaxy group',
    kind: 'Galaxy',
    type: 'GGroup',
    raDeg: ra(9, 38.9),
    decDeg: dec(-4, 52),
    mag: 12.5,
    sizeArcmin: 3,
  },
  {
    id: 'Q0957+561',
    name: 'Twin Quasar',
    kind: 'Other',
    type: 'QSO',
    raDeg: ra(10, 1.3),
    decDeg: dec(55, 54),
    mag: 15.5,
  },

  // Double stars from Explore the Universe that the double star data doesn't have.
  {
    id: '17 Com',
    name: 'Double star',
    kind: 'Double star',
    raDeg: ra(12, 28.9),
    decDeg: dec(25, 55),
    mag: 5.2,
  },
  {
    id: '32 Com',
    name: 'Double star, with 33 Com',
    kind: 'Double star',
    raDeg: ra(12, 52.2),
    decDeg: dec(17, 4),
    mag: 6.5,
  },
  {
    id: 'Nu CrB',
    name: 'Double star, Nu 1 and 2',
    kind: 'Double star',
    raDeg: ra(16, 22.4),
    decDeg: dec(33, 48),
    mag: 5.4,
  },
  {
    id: 'Delta Lyr',
    name: 'Double star, Delta 1 and 2',
    kind: 'Double star',
    raDeg: ra(18, 53.7),
    decDeg: dec(36, 58),
    mag: 4.5,
  },
];
