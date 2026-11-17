// Builds src/assets/data/hyg.json, the stars' catalogue names, from the HYG Database.
// Usage: node scripts/build-hyg.mjs <hygdata_v41.csv>
//
// The HYG Database, version 4.1, by David Nash (astronexus), combines Hipparcos, the Yale
// Bright Star Catalogue and the Gliese catalogue: https://github.com/astronexus/HYG-Database
// It is licensed CC BY-SA 4.0, so the file this writes is CC BY-SA 4.0 too, and holds
// only HYG's data. The app joins it to its own stars when it loads: see hyg-stars.ts.
//
// For each star it keeps the names observers and other apps use: Bayer ("ζ Psc"),
// Flamsteed ("61 Cyg"), variable star ("R Lep"), and Harvard Revised, Henry Draper and
// Hipparcos numbers. Stars to magnitude 6.5 are kept, about the naked-eye stars, plus
// fainter stars with a Bayer or Flamsteed name, and variable stars to magnitude 8.5,
// which include the carbon stars observing programmes list.

import { readFileSync, writeFileSync } from 'node:fs';

const MAG_LIMIT = 6.5;
const NAMED_MAG_LIMIT = 8;
const VARIABLE_MAG_LIMIT = 8.5;

/** HYG's three-letter Bayer abbreviations, as the Greek letters the app shows. */
const GREEK = {
  Alp: 'α',
  Bet: 'β',
  Gam: 'γ',
  Del: 'δ',
  Eps: 'ε',
  Zet: 'ζ',
  Eta: 'η',
  The: 'θ',
  Iot: 'ι',
  Kap: 'κ',
  Lam: 'λ',
  Mu: 'μ',
  Nu: 'ν',
  Xi: 'ξ',
  Omi: 'ο',
  Pi: 'π',
  Rho: 'ρ',
  Sig: 'σ',
  Tau: 'τ',
  Ups: 'υ',
  Phi: 'φ',
  Chi: 'χ',
  Psi: 'ψ',
  Ome: 'ω',
};

/** One CSV line's fields, honouring double quotes. */
function fields(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out;
}

/**
 * The Bayer and Flamsteed names in HYG's combined form: "6Bet1Cyg" gives "β1 Cyg" and
 * "6 Cyg", "61    Cyg" gives "61 Cyg", "Kap1Scl" gives "κ1 Scl".
 */
function bayerFlamsteed(bf) {
  const match = bf.trim().match(/^(\d+)?\s*([A-Z][a-z]{1,2})?(\d)?\s*([A-Z][A-Za-z]{2})$/);
  if (!match) return { bayer: null, flamsteed: null };
  const [, flam, letter, superscript, con] = match;
  const greek = letter ? GREEK[letter] : null;
  return {
    bayer: greek ? `${greek}${superscript ?? ''} ${con}` : null,
    flamsteed: flam ? `${flam} ${con}` : null,
  };
}

const [, , source] = process.argv;
if (!source) {
  console.error('Usage: node scripts/build-hyg.mjs <hygdata_v41.csv>');
  process.exit(1);
}

const lines = readFileSync(source, 'utf8').split(/\r?\n/).filter(Boolean);
const header = fields(lines[0]);
const col = Object.fromEntries(header.map((name, i) => [name, i]));
const stars = [];

for (const line of lines.slice(1)) {
  const f = fields(line);
  if (f[col.id] === '0') continue; // The Sun
  const mag = Number(f[col.mag]);
  const { bayer, flamsteed } = bayerFlamsteed(f[col.bf]);
  const con = f[col.con];
  // HYG's variable name is sometimes only the Bayer letter, which the Bayer name already gives.
  const variable = f[col.var] && !GREEK[f[col.var]] && con ? `${f[col.var]} ${con}` : null;
  const keep =
    mag <= MAG_LIMIT || ((bayer || flamsteed) && mag <= NAMED_MAG_LIMIT) || (variable && mag <= VARIABLE_MAG_LIMIT);
  if (!keep || !Number.isFinite(mag)) continue;

  const numbers = [f[col.hr] && `HR ${f[col.hr]}`, f[col.hd] && `HD ${f[col.hd]}`, f[col.hip] && `HIP ${f[col.hip]}`];
  // Best known first: the app names a star by the first. A Bayer name with a superscript,
  // such as "γ2 Ari", also goes without it, as other apps often write it: the brighter star
  // of the pair keeps it, since the app gives a name to the first star that has it.
  const plainBayer = bayer && /\d /.test(bayer) ? bayer.replace(/\d /, ' ') : null;
  const names = [bayer, flamsteed, variable, ...numbers, plainBayer].filter(Boolean);
  if (names.length === 0) continue;
  const bv = f[col.ci] === '' ? null : Number(Number(f[col.ci]).toFixed(2));
  stars.push([
    names.join('|'),
    f[col.proper] || '',
    Number((Number(f[col.ra]) * 15).toFixed(5)),
    Number(Number(f[col.dec]).toFixed(5)),
    Number(mag.toFixed(2)),
    bv,
  ]);
}

stars.sort((a, b) => a[4] - b[4]);
const out = {
  about:
    'Star names from the HYG Database 4.1 by David Nash (astronexus), https://github.com/astronexus/HYG-Database, ' +
    'licensed CC BY-SA 4.0. This file is CC BY-SA 4.0 too, and holds only HYG data, written by scripts/build-hyg.mjs.',
  license: 'CC-BY-SA-4.0',
  fields: ['names, best known first, separated by |', 'proper name', 'raDeg J2000', 'decDeg J2000', 'mag', 'B-V'],
  stars,
};
writeFileSync('src/assets/data/hyg.json', JSON.stringify(out));
console.log(`Wrote ${stars.length} stars to src/assets/data/hyg.json`);
