// The observing log as OpenAstronomyLog (OAL) 2.1, the open XML format other observing
// software reads, such as DeepskyLog, Deep-Sky Planner, KStars and Observation Manager.
// The schema is the VdS Fachgruppe Computerastronomie's, Apache-2.0, at
// https://github.com/DeepskyLog/openastronomylog. Plain functions, testable without the app.

import { formatLocation } from '../astronomy/astronomy';
import { designations } from '../catalog/designations';
import type { Target } from '../catalog/targets';
import type { Equipment, Kit, TelescopeType } from '../equipment/equipment';
import { TELESCOPE_TYPES, equipmentPower } from '../equipment/equipment';
import { nakedEyeLimit } from '../sky-conditions/sky-quality';

import type { Appearance, LogEntry, Rating } from './observing-log';

/**
 * The namespace most OAL 2.x files use. Readers such as DeepskyLog go by the element names
 * and the version, so this keeps the file readable by the most programs.
 */
const OAL_NAMESPACE = 'http://groups.google.com/group/openastronomylog';

/** Who observed: other programs, DeepskyLog among them, match observations to a user by name. */
export interface OalObserver {
  name: string;
  surname: string;
}

/**
 * The app's ratings on the Deep Sky Liste scale OAL uses: 1 is a very easy, prominent
 * object, 3 seen with direct vision, 5 barely seen with averted vision, 7 not seen.
 */
const DSL_RATING: Record<Rating, number> = { 4: 1, 3: 2, 2: 3, 1: 5, 0: 7 };

/** Telescope types in OAL's letters: Newtonian, refractor, Cassegrain. */
const SCOPE_CODES: Record<TelescopeType, string> = { newtonian: 'N', refractor: 'R', cassegrain: 'C' };

/** Text made safe inside XML. */
function xml(text: string | number): string {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A number in a file, without needless decimals. */
const num = (value: number, decimals = 4): string => String(Number(value.toFixed(decimals)));

/** The OAL type of a target: a deep-sky class, a star, or a solar system body. */
function targetType(target: Target | undefined): string {
  switch (target?.kind) {
    case 'Galaxy':
      return target.type === 'GGroup' || target.type === 'GTrpl' ? 'oal:deepSkyCG' : 'oal:deepSkyGX';
    case 'Globular cluster':
      return 'oal:deepSkyGC';
    case 'Open cluster':
      return 'oal:deepSkyOC';
    case 'Nebula':
      return target.type === 'PN' ? 'oal:deepSkyPN' : 'oal:deepSkyGN';
    case 'Double star':
      return 'oal:deepSkyDS';
    case 'Star':
      return target.double ? 'oal:deepSkyDS' : 'oal:starTargetType';
    case 'Planet':
      return 'oal:PlanetTargetType';
    case 'Moon':
      return 'oal:MoonTargetType';
    case 'Dwarf planet':
    case 'Asteroid':
      return 'oal:MinorPlanetTargetType';
    default:
      return 'oal:deepSkyNA';
  }
}

/** Whether OAL describes a target's findings with the deep-sky fields, which carry the rating. */
const isDeepSkyType = (type: string): boolean => type.startsWith('oal:deepSky');

/** The time zone's offset from UT in minutes, without summer time, as OAL wants it. */
function standardOffsetMinutes(year: number): number {
  const january = -new Date(year, 0, 1).getTimezoneOffset();
  const july = -new Date(year, 6, 1).getTimezoneOffset();
  return Math.min(january, july);
}

/** Gives each distinct thing an id once, in the order first met. */
class Registry<T> {
  private readonly ids = new Map<string, { id: string; value: T }>();
  constructor(private readonly prefix: string) {}
  idFor(key: string, value: T): string {
    let item = this.ids.get(key);
    if (!item) {
      item = { id: `${this.prefix}_${this.ids.size + 1}`, value };
      this.ids.set(key, item);
    }
    return item.id;
  }
  get items(): { id: string; value: T }[] {
    return [...this.ids.values()];
  }
}

/**
 * The log as an OAL 2.1 file. `targets` gives each entry's object its type, other names and
 * position; `kit` gives the telescope and eyepiece their names where they are still in it.
 * Entries go oldest first.
 */
export function exportLogOal(
  entries: readonly LogEntry[],
  targets: ReadonlyMap<string, Target>,
  observer: OalObserver,
  kit?: Kit,
): string {
  const sites = new Registry<{ latitudeDeg: number; longitudeDeg: number }>('site');
  const targetIds = new Registry<{ entry: LogEntry; target?: Target }>('target');
  const scopes = new Registry<Equipment & { name?: string }>('scope');
  const eyepieces = new Registry<Equipment & { name?: string }>('eyepiece');
  const lenses = new Registry<{ name: string; factor: number }>('lens');
  const filters = new Registry<string>('filter');
  const observations: string[] = [];

  for (const entry of [...entries].sort((a, b) => a.time.localeCompare(b.time))) {
    const c = entry.conditions;
    const e = c.equipment;
    const target = targets.get(entry.targetId);
    const siteId = sites.idFor(`${c.latitudeDeg.toFixed(3)},${c.longitudeDeg.toFixed(3)}`, c);
    const targetId = targetIds.idFor(entry.targetId, { entry, target });
    const telescope = kit?.telescopes.find((t) => t.id === c.kitIds?.telescopeId);
    const eyepiece = kit?.eyepieces.find((t) => t.id === c.kitIds?.eyepieceId);
    const scopeId = scopes.idFor(`${e.telescopeType}|${e.telescopeApertureMm}|${e.telescopeFocalMm}`, {
      ...e,
      name: telescope?.name,
    });
    const eyepieceId = eyepieces.idFor(`${e.eyepieceFocalMm}|${e.eyepieceFieldDeg}`, { ...e, name: eyepiece?.name });
    const lensId = e.modifier ? lenses.idFor(`${e.modifier.name}|${e.modifier.factor}`, e.modifier) : null;
    const filterId = e.filter ? filters.idFor(e.filter, e.filter) : null;
    const type = targetType(target);
    const note = [entry.note.trim(), entry.tags.length > 0 ? `[${entry.tags.join(', ')}]` : '']
      .filter(Boolean)
      .join(' ');
    const result = findingsXml(type, note, entry);
    const details = entry.details ?? {};
    observations.push(
      [
        `  <observation id="${xml(`o_${entry.id}`)}">`,
        `    <observer>observer_1</observer>`,
        `    <site>${siteId}</site>`,
        `    <target>${targetId}</target>`,
        `    <begin>${xml(new Date(entry.time).toISOString())}</begin>`,
        // The user's naked-eye limit, or the one the Bortle class suggests.
        `    <faintestStar>${num(details.faintestStar ?? nakedEyeLimit(c.bortle), 1)}</faintestStar>`,
        details.sqm !== undefined
          ? `    <sky-quality unit="mags-per-squarearcsec">${num(details.sqm, 2)}</sky-quality>`
          : '',
        details.seeing !== undefined ? `    <seeing>${details.seeing}</seeing>` : '',
        `    <scope>${scopeId}</scope>`,
        `    <eyepiece>${eyepieceId}</eyepiece>`,
        lensId ? `    <lens>${lensId}</lens>` : '',
        filterId ? `    <filter>${filterId}</filter>` : '',
        `    <magnification>${num(Math.max(1, equipmentPower(e)), 1)}</magnification>`,
        `    ${result}`,
        `  </observation>`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  const year = entries.length > 0 ? new Date(entries[0].time).getFullYear() : new Date().getFullYear();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<oal:observations version="2.1" xmlns:oal="${OAL_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${OAL_NAMESPACE} oal21.xsd">`,
    '  <observers>',
    `    <observer id="observer_1"><name>${xml(observer.name)}</name><surname>${xml(observer.surname)}</surname></observer>`,
    '  </observers>',
    '  <sites>',
    ...sites.items.map(
      ({ id, value }) =>
        `    <site id="${id}"><name>${xml(formatLocation(value.latitudeDeg, value.longitudeDeg))}</name>` +
        `<longitude unit="deg">${num(value.longitudeDeg)}</longitude><latitude unit="deg">${num(value.latitudeDeg)}</latitude>` +
        `<timezone>${standardOffsetMinutes(year)}</timezone></site>`,
    ),
    '  </sites>',
    '  <sessions/>',
    '  <targets>',
    ...targetIds.items.map(({ id, value }) => targetXml(id, value.entry, value.target)),
    '  </targets>',
    '  <scopes>',
    ...scopes.items.map(
      ({ id, value }) =>
        `    <scope id="${id}" xsi:type="oal:scopeType"><model>${xml(value.name?.trim() || `${value.telescopeApertureMm}/${value.telescopeFocalMm} ${TELESCOPE_TYPES[value.telescopeType]}`)}</model>` +
        `<type>${SCOPE_CODES[value.telescopeType]}</type><aperture>${num(value.telescopeApertureMm, 1)}</aperture>` +
        `<focalLength>${num(value.telescopeFocalMm, 1)}</focalLength></scope>`,
    ),
    '  </scopes>',
    '  <eyepieces>',
    ...eyepieces.items.map(
      ({ id, value }) =>
        `    <eyepiece id="${id}"><model>${xml(value.name?.trim() || `${value.eyepieceFocalMm} mm`)}</model>` +
        `<focalLength>${num(value.eyepieceFocalMm, 1)}</focalLength>` +
        `<apparentFOV unit="deg">${num(value.eyepieceFieldDeg, 1)}</apparentFOV></eyepiece>`,
    ),
    '  </eyepieces>',
    '  <lenses>',
    ...lenses.items.map(
      ({ id, value }) =>
        `    <lens id="${id}"><model>${xml(value.name)}</model><factor>${num(value.factor, 3)}</factor></lens>`,
    ),
    '  </lenses>',
    '  <filters>',
    // The app doesn't know what kind of filter each is, so OAL's "other".
    ...filters.items.map(
      ({ id, value }) => `    <filter id="${id}"><model>${xml(value)}</model><type>other</type></filter>`,
    ),
    '  </filters>',
    '  <imagers/>',
    ...observations,
    '</oal:observations>',
  ];
  return lines.join('\n') + '\n';
}

/**
 * What was seen. Deep-sky objects have OAL's rating and appearance, open clusters and double
 * stars their own findings type with what is particular to them; stars and solar system
 * bodies only the description. The elements and attributes follow the schema's order.
 */
function findingsXml(type: string, note: string, entry: LogEntry): string {
  const description = `<description>${xml(note)}</description>`;
  if (!isDeepSkyType(type)) return `<result xsi:type="oal:findingsType">${description}</result>`;
  const details = entry.details ?? {};
  const kind =
    type === 'oal:deepSkyOC'
      ? 'oal:findingsDeepSkyOCType'
      : type === 'oal:deepSkyDS'
        ? 'oal:findingsDeepSkyDSType'
        : 'oal:findingsDeepSkyType';
  // Only the appearance flags that this findings type has.
  const allowed = new Set<Appearance>(['stellar', 'extended', 'resolved', 'mottled']);
  if (kind === 'oal:findingsDeepSkyOCType')
    ['unusualShape', 'partlyUnresolved', 'colorContrasts'].forEach((a) => allowed.add(a as Appearance));
  if (kind === 'oal:findingsDeepSkyDSType')
    ['equalBrightness', 'niceSurrounding'].forEach((a) => allowed.add(a as Appearance));
  const flags = (details.appearance ?? [])
    .filter((flag) => allowed.has(flag))
    .map((flag) => ` ${flag}="true"`)
    .join('');
  const sizes = [
    details.minorArcmin ? `<smallDiameter unit="arcmin">${num(details.minorArcmin, 2)}</smallDiameter>` : '',
    details.sizeArcmin ? `<largeDiameter unit="arcmin">${num(details.sizeArcmin, 2)}</largeDiameter>` : '',
  ].join('');
  const colours =
    kind === 'oal:findingsDeepSkyDSType'
      ? [
          details.colourMain ? `<colorMain>${details.colourMain}</colorMain>` : '',
          details.colourCompanion ? `<colorCompanion>${details.colourCompanion}</colorCompanion>` : '',
        ].join('')
      : '';
  return `<result xsi:type="${kind}"${flags}>${description}${sizes}<rating>${DSL_RATING[entry.rating]}</rating>${colours}</result>`;
}

/**
 * One target: its best-known designation as its name, its other names as aliases, and for
 * fixed objects its J2000 position. Planets and the Moon move, so they have none.
 */
function targetXml(id: string, entry: LogEntry, target: Target | undefined): string {
  const names = target ? [...designations(target)] : [entry.targetId];
  const [name, ...others] = names;
  const aliases = [...others, target?.name ?? entry.targetName].filter(
    (alias, index, all) => alias && alias !== name && all.indexOf(alias) === index,
  );
  const fixed = target && !target.body;
  return [
    `    <target id="${id}" xsi:type="${targetType(target)}">`,
    `<datasource>AstroTurboMaxiSolver</datasource><name>${xml(name)}</name>`,
    ...aliases.map((alias) => `<alias>${xml(alias)}</alias>`),
    fixed
      ? `<position><ra unit="deg">${num(target.raDeg)}</ra><dec unit="deg">${num(target.decDeg)}</dec></position>`
      : '',
    '</target>',
  ].join('');
}

/** A file name for the OAL log, with today's date. */
export function oalFileName(today = new Date()): string {
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `astroturbomaxisolver-log-${today.getFullYear()}-${month}-${day}.xml`;
}
