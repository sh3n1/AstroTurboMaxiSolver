// Checks the language files against the code, as part of `npm run lint`:
//
// - every key the code uses is in en.json, so no text shows as a raw key;
// - every key in en.json is used, so no text is left behind after a change;
// - every other language has exactly en.json's keys, so none is missing a text.
//
// A key is found where the code uses it: `'sky.title' | translate` in a template, or
// `.instant('sky.title')` (and stream, get) in code. A key built at run time, such as
// `'kinds.' + kind`, counts every key under its fixed start, here "kinds.", as used.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const I18N_DIR = 'src/assets/i18n';
const SOURCE_DIR = 'src/app';
const DEFAULT_FILE = 'en.json';

/** The keys of a nested language object, as "area.name". */
function flatten(object, prefix = '', out = new Map()) {
  for (const [name, value] of Object.entries(object)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (value && typeof value === 'object') flatten(value, key, out);
    else out.set(key, value);
  }
  return out;
}

/** Every .ts and .html file under a folder, specs left out. */
function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.(ts|html)$/.test(name) && !name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

const KEY = String.raw`[a-z][\w-]*(?:\.[\w-]+)+`;
const USES = [
  // 'area.name' | translate
  new RegExp(String.raw`['"](${KEY})['"]\s*\|\s*translate`, 'g'),
  // .instant('area.name'), .stream(...), .get(...), translate('area.name')
  new RegExp(String.raw`(?:\.instant|\.stream|\.get|\btranslate)\(\s*['"](${KEY})['"]`, 'g'),
  // A key named in a constant or a map, marked as one: i18n('area.name')
  new RegExp(String.raw`\bi18n\(\s*['"](${KEY})['"]`, 'g'),
];
/** Keys built at run time: 'area.' + x, or `area.${x}`. */
const BUILT = [new RegExp(String.raw`['"]((?:[a-z][\w-]*\.)+)['"]\s*\+`, 'g'), /`((?:[a-z][\w-]*\.)+)\$\{/g];

const english = flatten(JSON.parse(readFileSync(path.join(I18N_DIR, DEFAULT_FILE), 'utf8')));
const used = new Set();
const prefixes = new Set();
const missing = [];
for (const file of sources(SOURCE_DIR)) {
  const text = readFileSync(file, 'utf8');
  for (const pattern of USES) {
    for (const [, key] of text.matchAll(pattern)) {
      used.add(key);
      if (!english.has(key)) missing.push(`${file}: "${key}"`);
    }
  }
  for (const pattern of BUILT) for (const [, prefix] of text.matchAll(pattern)) prefixes.add(prefix);
}

const unused = [...english.keys()].filter((key) => !used.has(key) && ![...prefixes].some((p) => key.startsWith(p)));

const others = [];
for (const name of readdirSync(I18N_DIR).filter((n) => n.endsWith('.json') && n !== DEFAULT_FILE)) {
  const keys = flatten(JSON.parse(readFileSync(path.join(I18N_DIR, name), 'utf8')));
  for (const key of english.keys()) if (!keys.has(key)) others.push(`${name} lacks "${key}"`);
  for (const key of keys.keys()) if (!english.has(key)) others.push(`${name} has "${key}", which en.json doesn't`);
}

const report = (title, lines) => lines.length && console.error(`${title}:\n  ${lines.join('\n  ')}`);
report(`Keys used but not in ${DEFAULT_FILE}`, missing);
report(`Keys in ${DEFAULT_FILE} that nothing uses`, unused);
report('Other languages out of step with en.json', others);
if (missing.length || unused.length || others.length) process.exit(1);
console.log(`Language files: ${english.size} texts, all used, none missing.`);
