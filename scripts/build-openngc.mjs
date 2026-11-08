// Builds the NGC and IC target file from OpenNGC's database.
// Usage: node scripts/build-openngc.mjs <NGC.csv>
// Source: database_files/NGC.csv in https://github.com/mattiaverga/OpenNGC
//
// OpenNGC is CC-BY-SA-4.0, so this converted file is too. It stays a separate file
// from the rest of the app's data, and the app credits it in Settings.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , sourcePath] = process.argv;
if (!sourcePath) throw new Error('Usage: node scripts/build-openngc.mjs <NGC.csv>');

// OpenNGC's object types, mapped to the app's target kinds. Types left out here are
// duplicates, non-existent objects and single stars that aren't useful targets.
const KINDS = {
  G: 'Galaxy',
  GPair: 'Galaxy',
  GTrpl: 'Galaxy',
  GGroup: 'Galaxy',
  OCl: 'Open cluster',
  'Cl+N': 'Open cluster',
  GCl: 'Globular cluster',
  PN: 'Nebula',
  Neb: 'Nebula',
  HII: 'Nebula',
  EmN: 'Nebula',
  RfN: 'Nebula',
  SNR: 'Nebula',
};

// The types the kind already says, so they aren't stored again: a plain galaxy or cluster.
// Every other type is kept as `type`, for the details box: "Planetary nebula", "Galaxy pair".
const PLAIN_TYPES = new Set(['G', 'OCl', 'GCl']);

// Stands for an unknown brightness, which the app shows as a question mark.
const UNKNOWN_MAG = 99;

/** Turns "NGC0224" into "NGC 224", and "IC0434 NED01" into "IC 434 NED01". */
const displayId = (name) => name.replace(/^(NGC|IC)0*(\d)/, '$1 $2');

/** Converts sexagesimal text such as "+41:16:08.6" to decimal. */
function sexagesimal(text) {
  const [a, b, c] = text.split(':').map(Number);
  const sign = text.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(a) + b / 60 + c / 3600);
}

const lines = readFileSync(sourcePath, 'utf8').trim().split(/\r?\n/);
const columns = lines[0].split(';');
const rows = lines.slice(1).map((line) => {
  const cells = line.split(';');
  return Object.fromEntries(columns.map((column, i) => [column, cells[i] ?? '']));
});

const targets = rows
  // Messier objects come from their own catalogue, so they aren't listed twice.
  .filter((row) => KINDS[row.Type] && !row.M && row.RA && row.Dec)
  .map((row) => {
    const crossReferences = [row.NGC && `NGC ${Number(row.NGC) || row.NGC}`, row.IC && `IC ${Number(row.IC) || row.IC}`];
    return {
      id: displayId(row.Name),
      // Most objects have no common name, so their type is shown instead.
      name: row['Common names'].split(',')[0] || KINDS[row.Type],
      aliases: [...crossReferences, row['Common names'].replaceAll(',', ' ')].filter(Boolean).join(' '),
      kind: KINDS[row.Type],
      raDeg: Number((sexagesimal(row.RA) * 15).toFixed(3)),
      decDeg: Number(sexagesimal(row.Dec).toFixed(3)),
      mag: Number(row['V-Mag'] || row['B-Mag'] || UNKNOWN_MAG),
      // The major axis is in arcminutes, and many objects don't have one.
      ...(Number(row.MajAx) ? { sizeArcmin: Number(row.MajAx) } : {}),
      // The shorter side, as many objects are oval rather than round.
      ...(Number(row.MajAx) && Number(row.MinAx) ? { minorArcmin: Number(row.MinAx) } : {}),
      ...(PLAIN_TYPES.has(row.Type) ? {} : { type: row.Type }),
      // A galaxy's shape in Hubble's scheme, such as "SBb", a barred spiral.
      ...(row.Hubble ? { hubble: row.Hubble } : {}),
    };
  });

// Stop now if the source changes format, rather than ship a broken catalogue.
const invalid = targets.filter((t) => !Number.isFinite(t.raDeg) || !Number.isFinite(t.decDeg) || !Number.isFinite(t.mag));
if (invalid.length > 0) throw new Error(`Invalid entries: ${invalid.map((t) => t.id).join(', ')}`);
if (targets.length < 10_000) throw new Error(`Expected at least 10,000 objects, found ${targets.length}`);

writeFileSync('src/assets/data/openngc.json', JSON.stringify(targets));
console.log(`Wrote ${targets.length} NGC and IC objects`);
