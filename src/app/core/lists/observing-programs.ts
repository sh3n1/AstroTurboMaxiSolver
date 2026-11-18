// The observing programmes some of the app's lists come from: clubs' and societies' lists
// with a purpose, and often a certificate for finishing them. The app has only the lists'
// designations; the motivation, the advice and the rules are on the programmes' own pages,
// which the program card links to. The summaries are the app's own words.

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

const PROGRAMS: readonly ObservingProgram[] = [
  {
    id: 'herschel400',
    name: 'Herschel 400',
    by: 'Astronomical League · list by the Ancient City Astronomy Club',
    summary: "400 of William Herschel's discoveries: the next step after Messier. Best with 8 inches or more.",
    url: 'https://www.astroleague.org/herschel-400-observing-program/',
    certificate: true,
  },
  {
    id: 'herschel2',
    name: 'Herschel II',
    by: 'Astronomical League · list by the Rose City Astronomers',
    summary: "The next 400 of Herschel's discoveries, fainter. Finishing it takes 10 inches or more.",
    url: 'https://www.astroleague.org/?p=8482',
    certificate: true,
  },
  {
    id: 'sac110',
    name: '110 Best NGC Objects',
    by: 'Saguaro Astronomy Club',
    summary: 'The best NGC objects that Messier missed, chosen by two Arizona observers.',
    url: 'https://www.saguaroastro.org/110-best-ngc-objects/',
    certificate: false,
  },
  {
    id: 'explore-universe',
    name: 'Explore the Universe',
    by: 'Royal Astronomical Society of Canada',
    summary: 'A first programme, for the eye, binoculars or a small telescope.',
    url: 'https://rasc.ca/node/47112',
    certificate: true,
  },
  {
    id: 'urban',
    name: 'Urban Observing Program',
    by: 'Astronomical League',
    summary: "Objects that show from a city, where the Milky Way can't be seen.",
    url: 'https://www.astroleague.org/?p=8458',
    certificate: true,
  },
  {
    id: 'assa100',
    name: 'Top-100 Deep-Sky Objects',
    by: 'Astronomical Society of Southern Africa',
    summary: "The southern sky's finest, for binoculars or a small telescope.",
    url: 'https://assa.saao.ac.za/sections/deep-sky/assa-top-100/',
    certificate: true,
  },
  {
    id: 'rasc',
    name: 'Finest NGC',
    by: 'Royal Astronomical Society of Canada · list by Alan Dyer',
    summary: '110 bright NGC objects, by season: the next step after Messier.',
    url: 'https://www.rasc.ca/finest-ngc-objects',
    certificate: true,
  },
  {
    id: 'gems',
    name: 'Deep-Sky Gems',
    by: 'Royal Astronomical Society of Canada · list by David H. Levy',
    summary: "154 of David Levy's favourites, by season, after Messier and the Finest NGC.",
    url: 'https://rasc.ca/node/46938',
    certificate: true,
  },
  {
    id: 'hubble',
    name: 'Hubble Night Sky Challenge',
    by: 'NASA, with the Astronomical League',
    summary: 'Each month, Messier and Caldwell objects that Hubble has photographed.',
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
  return (
    PROGRAMS.find((program) => program.id === listId) ?? PROGRAMS.find((program) => program.id === catalogueId) ?? null
  );
}
