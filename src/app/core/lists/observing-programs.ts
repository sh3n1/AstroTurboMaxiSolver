// The observing programmes some of the app's lists come from: clubs' and societies' lists
// with a purpose, and often a certificate for finishing them. The app has only the lists'
// designations; the motivation, the advice and the rules are on the programmes' own pages,
// which the program card links to. The summaries are the app's own words.

import type { TextParams } from '../i18n/t';
import { i18n, t } from '../i18n/t';

/** An observing programme, as its card shows it. */
export interface ObservingProgram {
  /** Names the programme, for remembering its card as read: shared by its seasons or months. */
  id: string;
  name: string;
  /** Who runs it, and who chose the objects where that is someone else. */
  by: string;
  /** What it is for, in a few words. */
  summary: string;
  /** The programme's own page: its purpose, its advice and its rules. */
  url: string;
  /** Whether it awards a certificate or pin for finishing it. */
  certificate: boolean;
}

/**
 * A text's key with the names it fills in. Names, such as a club's or a catalogue's, are
 * never translated: they fill the translated words around them.
 */
interface Words {
  key: string;
  params?: TextParams;
}

/** A programme as written here, with its words still to translate. */
type ProgramSource = Omit<ObservingProgram, 'by' | 'summary'> & { by: Words; summary: Words };

const PROGRAMS: readonly ProgramSource[] = [
  {
    id: 'herschel400',
    name: 'Herschel 400',
    by: {
      key: i18n('programs.listByClub'),
      params: { org: 'Astronomical League', club: 'Ancient City Astronomy Club' },
    },
    summary: {
      key: i18n('programs.summaries.herschel400'),
      params: { person: 'William Herschel', catalogue: 'Messier' },
    },
    url: 'https://www.astroleague.org/herschel-400-observing-program/',
    certificate: true,
  },
  {
    id: 'herschel2',
    name: 'Herschel II',
    by: { key: i18n('programs.listByClub'), params: { org: 'Astronomical League', club: 'Rose City Astronomers' } },
    summary: { key: i18n('programs.summaries.herschel2'), params: { person: 'Herschel' } },
    url: 'https://www.astroleague.org/?p=8482',
    certificate: true,
  },
  {
    id: 'sac110',
    name: '110 Best NGC Objects',
    by: { key: i18n('programs.by'), params: { org: 'Saguaro Astronomy Club' } },
    summary: { key: i18n('programs.summaries.sac110'), params: { catalogue: 'NGC', other: 'Messier' } },
    url: 'https://www.saguaroastro.org/110-best-ngc-objects/',
    certificate: false,
  },
  {
    id: 'explore-universe',
    name: 'Explore the Universe',
    by: { key: i18n('programs.by'), params: { org: 'Royal Astronomical Society of Canada' } },
    summary: { key: i18n('programs.summaries.exploreUniverse') },
    url: 'https://rasc.ca/node/47112',
    certificate: true,
  },
  {
    id: 'urban',
    name: 'Urban Observing Program',
    by: { key: i18n('programs.by'), params: { org: 'Astronomical League' } },
    summary: { key: i18n('programs.summaries.urban') },
    url: 'https://www.astroleague.org/?p=8458',
    certificate: true,
  },
  {
    id: 'assa100',
    name: 'Top-100 Deep-Sky Objects',
    by: { key: i18n('programs.by'), params: { org: 'Astronomical Society of Southern Africa' } },
    summary: { key: i18n('programs.summaries.assa100') },
    url: 'https://assa.saao.ac.za/sections/deep-sky/assa-top-100/',
    certificate: true,
  },
  {
    id: 'rasc',
    name: 'Finest NGC',
    by: {
      key: i18n('programs.listByPerson'),
      params: { org: 'Royal Astronomical Society of Canada', person: 'Alan Dyer' },
    },
    summary: { key: i18n('programs.summaries.rasc'), params: { catalogue: 'NGC', other: 'Messier' } },
    url: 'https://www.rasc.ca/finest-ngc-objects',
    certificate: true,
  },
  {
    id: 'gems',
    name: 'Deep-Sky Gems',
    by: {
      key: i18n('programs.listByPerson'),
      params: { org: 'Royal Astronomical Society of Canada', person: 'David H. Levy' },
    },
    summary: {
      key: i18n('programs.summaries.gems'),
      params: { person: 'David Levy', catalogue: 'Messier', list: 'Finest NGC' },
    },
    url: 'https://rasc.ca/node/46938',
    certificate: true,
  },
  {
    id: 'hubble',
    name: 'Hubble Night Sky Challenge',
    by: { key: i18n('programs.withPartner'), params: { org: 'NASA', partner: 'Astronomical League' } },
    summary: {
      key: i18n('programs.summaries.hubble'),
      params: { first: 'Messier', second: 'Caldwell', telescope: 'Hubble' },
    },
    url: 'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubbles-night-sky-challenge/',
    certificate: false,
  },
];

/**
 * The programme a list or a split catalogue comes from, or null for the app's own lists
 * and plain catalogues such as Messier. A season or month of a split catalogue, such as
 * "rasc-winter" or "hubble-may", belongs to its catalogue's programme.
 */
export function programFor(listId: string): ObservingProgram | null {
  const catalogueId = listId.split('-')[0];
  const program =
    PROGRAMS.find((candidate) => candidate.id === listId) ?? PROGRAMS.find((candidate) => candidate.id === catalogueId);
  if (!program) return null;
  // In the user's language, translated when asked for, once the language has loaded.
  const say = ({ key, params }: Words): string => t(key, params);
  return { ...program, by: say(program.by), summary: say(program.summary) };
}
