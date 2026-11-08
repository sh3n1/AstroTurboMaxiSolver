// Builds the double star file from the Washington Double Star Catalog (WDS).
// Usage: node scripts/build-doubles.mjs <wdsweb_summ2.txt>
// Source: https://www.astro.gsu.edu/wds/Webtextfiles/wdsweb_summ2.txt, with its column
// layout in wdsweb_format.txt next to it. The WDS is maintained at the US Naval
// Observatory. As a US government work it is in the public domain, and the app credits
// it in Settings as USNO asks.
//
// Of its 158,000 pairs, this keeps the ones worth looking at in a small telescope, plus
// a few wide pairs seen by eye or in binoculars, such as Mizar and Alcor. Pairs whose
// main star is one of the app's named stars (targets.json) are attached to that star,
// so Albireo stays one target instead of two. Run build-catalog.mjs first.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , sourcePath] = process.argv;
if (!sourcePath) throw new Error('Usage: node scripts/build-doubles.mjs <wdsweb_summ2.txt>');

// Telescope pairs: easy to find, and far enough apart to split in a small telescope.
const CLOSE = { primaryMag: 7.5, companionMag: 10, minSep: 1, maxSep: 60, maxMagDifference: 4 };
// Wide pairs, split by eye or in binoculars: both stars bright, up to 20′ apart.
const WIDE = { primaryMag: 5, companionMag: 6, maxSep: 1200 };
// Measured recently and more than once, so the separation and angle are current.
const MIN_LAST_YEAR = 1990;
const MIN_MEASURES = 3;
// A named star at most this far from the WDS position is the same star. Named star
// positions are rounded to 0.001°, about 3.6″.
const NAMED_STAR_MATCH_ARCSEC = 20;
const NAMED_STAR_MATCH_MAG = 1;

/** The text in a range of columns, counted from 1 as the WDS format does. */
const column = (line, from, to) => line.slice(from - 1, to).trim();
const number = (text) => (text === '' ? NaN : Number(text));

/** Turns the precise WDS position, such as "193043.29+275734.9", into degrees. */
function preciseDegrees(text) {
  const match = /^(\d\d)(\d\d)(\d\d(?:\.\d*)?)([+-])(\d\d)(\d\d)(\d\d(?:\.\d*)?)$/.exec(text);
  if (!match) return null;
  const [, h, m, s, sign, d, dm, ds] = match;
  const raDeg = (Number(h) + Number(m) / 60 + Number(s) / 3600) * 15;
  const decDeg = (sign === '-' ? -1 : 1) * (Number(d) + Number(dm) / 60 + Number(ds) / 3600);
  return { raDeg, decDeg };
}

/** "STF1744" becomes "STF 1744", the way observers write it. "STFA 43" stays. */
const designation = (discoverer) => discoverer.replace(/^([A-Z]+)\s*(\d)/, '$1 $2');

/** The traditional Greek forms of the Struve designations, which search also finds. */
const GREEK = { STF: 'Σ', STFA: 'ΣI', STT: 'OΣ' };
function greekDesignation(name) {
  const match = /^([A-Z]+) (\d.*)$/.exec(name);
  return match && GREEK[match[1]] ? `${GREEK[match[1]]} ${match[2]}` : null;
}

/** One summary line of the WDS, or null for headers and incomplete lines. */
function parseLine(line) {
  if (!/^\d{5}[+-]\d{4}/.test(line)) return null;
  const position = preciseDegrees(column(line, 113, 130));
  if (!position) return null;
  const notes = column(line, 108, 111);
  return {
    wds: column(line, 1, 10),
    discoverer: column(line, 11, 17),
    components: column(line, 18, 22),
    lastYear: number(column(line, 29, 32)),
    measures: number(column(line, 34, 37)),
    paDeg: number(column(line, 43, 45)),
    sepArcsec: number(column(line, 53, 57)),
    mag1: number(column(line, 59, 63)),
    mag2: number(column(line, 65, 69)),
    spectral: column(line, 71, 79),
    notes,
    ...position,
  };
}

/** Whether a pair is worth listing, as a telescope pair or as a wide pair. */
function isWanted(pair) {
  const { sepArcsec: sep, mag1, mag2, notes } = pair;
  if (![sep, mag1, mag2, pair.paDeg].every(Number.isFinite)) return false;
  // X: a dubious pair, which may not be there at all. B, R and K: the magnitudes are
  // not visual ones, so they don't say how the pair looks.
  if (/[XBRK]/.test(notes)) return false;
  if (pair.lastYear < MIN_LAST_YEAR || pair.measures < MIN_MEASURES) return false;
  const close =
    mag1 <= CLOSE.primaryMag &&
    mag2 <= CLOSE.companionMag &&
    sep >= CLOSE.minSep &&
    sep <= CLOSE.maxSep &&
    mag2 - mag1 <= CLOSE.maxMagDifference;
  const wide = mag1 <= WIDE.primaryMag && mag2 <= WIDE.companionMag && sep > CLOSE.maxSep && sep <= WIDE.maxSep;
  return close || wide;
}

/**
 * Whether the stars travel together through space, from the WDS codes. T, V and Z say
 * they do, S, U and Y say it is a chance line-of-sight pair. Unknown otherwise.
 */
function physical(notes) {
  if (/[TVZ]/.test(notes)) return true;
  if (/[SUY]/.test(notes)) return false;
  return undefined;
}

const pairs = readFileSync(sourcePath, 'latin1').split(/\r?\n/).map(parseLine).filter(Boolean).filter(isWanted);

// Pairs measured from the same star make one target: Mizar's AB and AC, for example.
// The precise position is that star's, so it tells them apart within a WDS system.
const groups = new Map();
for (const pair of pairs) {
  const key = `${pair.wds} ${pair.raDeg.toFixed(5)} ${pair.decDeg.toFixed(5)}`;
  const list = groups.get(key) ?? [];
  list.push(pair);
  groups.set(key, list);
}

/** Whether a group's pairs are measured from the system's main star, A. */
const fromMainStar = (list) => list.some((pair) => !pair.components || pair.components.startsWith('A'));
/** Angular distance between two pairs' positions, in arcseconds. */
const apartArcsec = (a, b) =>
  Math.hypot((a.raDeg - b.raDeg) * Math.cos((a.decDeg * Math.PI) / 180), a.decDeg - b.decDeg) * 3600;
// A pair within a system, such as Castor's BC, would be a second target almost on top of
// the first. One well apart, such as the second pair of the Double Double, stays.
const OWN_TARGET_ARCSEC = 60;
const mainGroups = [...groups.values()].filter(fromMainStar);
const systems = [...groups.values()].filter(
  (list) => fromMainStar(list) || mainGroups.every((main) => apartArcsec(main[0], list[0]) > OWN_TARGET_ARCSEC),
);

const namedStars = JSON.parse(readFileSync('src/assets/data/targets.json', 'utf8')).filter((t) => t.kind === 'Star');
/** The named star at a position and brightness, if there is one. */
function namedStarAt(raDeg, decDeg, mag) {
  const cosDec = Math.cos((decDeg * Math.PI) / 180);
  return namedStars.find(
    (star) =>
      Math.hypot((star.raDeg - raDeg) * cosDec, star.decDeg - decDeg) * 3600 <= NAMED_STAR_MATCH_ARCSEC &&
      Math.abs(star.mag - mag) <= NAMED_STAR_MATCH_MAG,
  );
}

const round = (value, places) => Number(value.toFixed(places));
const usedIds = new Set();
const doubles = [];
for (const list of systems) {
  const wds = list[0].wds;
  // Closest pair first: it is the one that tests the telescope.
  list.sort((a, b) => a.sepArcsec - b.sepArcsec);
  const main = list[0];
  const name = designation(main.discoverer);
  const designations = [...new Set(list.map((pair) => designation(pair.discoverer)))];
  const double = {
    // The main star's precise position, since named star positions are rounded.
    raDeg: round(main.raDeg, 5),
    decDeg: round(main.decDeg, 5),
    // Spectral types such as "K3II+B9.5", for the colours of the two stars.
    spectral: main.spectral || undefined,
    pairs: list.map((pair) => ({
      components: pair.components || 'AB',
      sepArcsec: pair.sepArcsec,
      paDeg: pair.paDeg,
      year: pair.lastYear,
      mag1: pair.mag1,
      mag2: pair.mag2,
      physical: physical(pair.notes),
      // O and C: an orbit has been worked out, so the pair is seen to move.
      orbit: /[OC]/.test(pair.notes) || undefined,
    })),
  };
  const aliases = [...designations, ...designations.map(greekDesignation).filter(Boolean), `WDS ${wds}`].join(' ');
  const star = namedStarAt(main.raDeg, main.decDeg, main.mag1);
  if (star) {
    doubles.push({ starId: star.id, aliases, double });
    continue;
  }
  // Two systems by the same discoverer number are rare, but ids must be unique.
  const id = usedIds.has(name) ? `${name} (WDS ${wds})` : name;
  usedIds.add(id);
  doubles.push({
    id,
    name: id,
    aliases,
    kind: 'Double star',
    // Five decimals, about 0.04″, so close pairs keep their shape in the eyepiece view.
    raDeg: round(main.raDeg, 5),
    decDeg: round(main.decDeg, 5),
    mag: main.mag1,
    double,
  });
}

writeFileSync('src/assets/data/doubles.json', JSON.stringify(doubles));
const named = doubles.filter((d) => d.starId).length;
console.log(`${doubles.length} double stars, ${named} of them named stars, from ${pairs.length} pairs`);
