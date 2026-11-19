// Builds the landing page into www/, next to the app (built into www/app/, served at /app/).
// See docs/deploy.md for how the two are hosted together.
//
// The landing is plain HTML and CSS in src/landing/. Its pages (index, privacy and terms) are
// templates: each text is a {{key}} in the language files in src/landing/i18n/, one per
// language, and each page is written once per language: English, the default, as
// index.html, the others as index.<language>.html. Every other file is copied as it is.
//
// Besides the language files' keys, a page can use these, filled in here:
//   {{@lang}} {{@ogLocale}}    the page's language
//   {{@url}} {{@alternates}}   its address, and its other languages' for search engines
//   {{@languages}}             the links to its other languages, top left
//   {{@remember}}              remembers the language chosen with those links
//   {{@redirect}}              the English home page only: sends a visitor whose browser
//                              speaks another of the languages to it, before anything shows
//   {{@translationNote}}       on a translation of the legal pages, that English prevails
//   {{@home}} {{@privacy}} {{@terms}} {{@github}} {{@gpl}}   addresses, in the page's language
// Texts may use the address ones too, such as a link to {{@privacy}}.
//
// The build fails if a page uses a text a language lacks, or a language has texts no page uses.

import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const SOURCE = 'src/landing';
const LANGUAGES_DIR = `${SOURCE}/i18n`;
const OUT = 'www';
const SITE = 'https://astroturbomaxisolver.app';
const DEFAULT = 'en';
const PAGES = ['index', 'privacy', 'terms'];
/** Where the language chosen with the links is remembered, read by the redirect. */
const CHOICE_KEY = 'astroturbomaxisolver.landingLanguage';
/** Each language's Open Graph locale, for link previews. */
const OG_LOCALES = { en: 'en_GB', es: 'es_ES' };

if (!existsSync(`${OUT}/app/index.html`)) {
  console.error('No app build in www/app/: run "ng build" first.');
  process.exit(1);
}

/** A language file's texts, by "area.name" key. */
function flatten(object, prefix = '', out = new Map()) {
  for (const [name, value] of Object.entries(object)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (value && typeof value === 'object') flatten(value, key, out);
    else out.set(key, String(value));
  }
  return out;
}

const languages = readdirSync(LANGUAGES_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -'.json'.length))
  // English first: it is the default, and what the others are checked against.
  .sort((a, b) => (a === DEFAULT ? -1 : b === DEFAULT ? 1 : a.localeCompare(b)));
const texts = new Map(
  languages.map((lang) => [lang, flatten(JSON.parse(readFileSync(`${LANGUAGES_DIR}/${lang}.json`, 'utf8')))]),
);

/** A page's file name in a language: index.html, or index.es.html. */
const fileName = (page, lang) => (lang === DEFAULT ? `${page}.html` : `${page}.${lang}.html`);
/** A page's path on the site: the English home page is the root. */
const path = (page, lang) => (page === 'index' && lang === DEFAULT ? '/' : `/${fileName(page, lang)}`);

/** The values a page fills in besides the language's texts. */
function pageValues(page, lang) {
  const others = languages.map((other) => ({ other, href: path(page, other) }));
  const values = {
    lang,
    ogLocale: OG_LOCALES[lang] ?? lang,
    url: SITE + path(page, lang),
    alternates: [
      ...others.map(({ other, href }) => `<link rel="alternate" hreflang="${other}" href="${SITE}${href}" />`),
      `<link rel="alternate" hreflang="x-default" href="${SITE}${path(page, DEFAULT)}" />`,
    ].join('\n    '),
    languages:
      `<nav class="languages" aria-label="${texts.get(lang).get('common.languagesLabel')}">` +
      others
        .map(({ other, href }) =>
          other === lang
            ? `<span aria-current="true" lang="${other}">${texts.get(other).get('common.languageName')}</span>`
            : `<a href="${href}" hreflang="${other}" lang="${other}" data-lang="${other}">${texts.get(other).get('common.languageName')}</a>`,
        )
        .join(' · ') +
      '</nav>',
    remember:
      '<script>\n' +
      '      // The language chosen with the links at the top is remembered, so the home page\n' +
      "      // doesn't send this visitor to their browser's language after all.\n" +
      "      document.querySelectorAll('[data-lang]').forEach((link) =>\n" +
      "        link.addEventListener('click', () => {\n" +
      '          try {\n' +
      `            localStorage.setItem('${CHOICE_KEY}', link.dataset.lang);\n` +
      '          } catch {\n' +
      '            // Blocked storage: the browser decides next time.\n' +
      '          }\n' +
      '        }),\n' +
      '      );\n' +
      '    </script>',
    redirect: page === 'index' && lang === DEFAULT ? redirectScript() : '',
    translationNote:
      lang === DEFAULT || page === 'index' ? '' : `<p class="note translation">${texts.get(lang).get('common.translationNote')}</p>`,
    home: path('index', lang),
    privacy: path('privacy', lang),
    terms: path('terms', lang),
    github: 'https://github.com/sh3n1/AstroTurboMaxiSolver',
    gpl: 'https://www.gnu.org/licenses/gpl-3.0.html',
  };
  return values;
}

/**
 * The English home page's redirect: a visitor whose browser speaks another of the languages
 * goes to it at once, before anything is drawn, unless they chose a language with the links.
 */
function redirectScript() {
  const pages = Object.fromEntries(languages.filter((l) => l !== DEFAULT).map((l) => [l, fileName('index', l)]));
  return (
    '<script>\n' +
    "      // A visitor whose browser speaks another of the page's languages goes to it before\n" +
    '      // anything is drawn, unless they chose a language with the links at the top.\n' +
    '      (() => {\n' +
    `        const pages = ${JSON.stringify(pages)};\n` +
    '        let chosen = null;\n' +
    '        try {\n' +
    `          chosen = localStorage.getItem('${CHOICE_KEY}');\n` +
    '        } catch {\n' +
    "          // Blocked storage: the browser's language decides.\n" +
    '        }\n' +
    '        const spoken = (navigator.languages ?? [navigator.language]).map((tag) => tag.toLowerCase().split("-")[0]);\n' +
    `        const wanted = chosen ?? spoken.find((code) => code === '${DEFAULT}' || code in pages);\n` +
    '        if (wanted && wanted in pages) location.replace(pages[wanted] + location.hash);\n' +
    '      })();\n' +
    '    </script>'
  );
}

const used = new Set();
const problems = [];

/** Fills a template's {{key}} and {{@value}} holes, texts first, since texts may hold values. */
function render(template, page, lang) {
  const values = pageValues(page, lang);
  const own = texts.get(lang);
  let html = template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    used.add(key);
    if (!own.has(key)) {
      problems.push(`${lang}.json lacks "${key}", used in ${page}.html`);
      return '';
    }
    return own.get(key);
  });
  html = html.replace(/\{\{\s*@(\w+)\s*\}\}/g, (_, name) => {
    if (!(name in values)) problems.push(`${page}.html uses {{@${name}}}, which the build doesn't fill in`);
    return values[name] ?? '';
  });
  return html;
}

// Everything but the templates and the language files, as it is.
cpSync(SOURCE, OUT, {
  recursive: true,
  filter: (from) => {
    const relative = from.replace(/\\/g, '/').slice(SOURCE.length + 1);
    return !relative.startsWith('i18n') && !PAGES.some((page) => relative === `${page}.html`);
  },
});
// The sitemap is written here, with each page in each language.
rmSync(`${OUT}/sitemap.xml`, { force: true });

for (const page of PAGES) {
  const template = readFileSync(`${SOURCE}/${page}.html`, 'utf8');
  for (const lang of languages) writeFileSync(`${OUT}/${fileName(page, lang)}`, render(template, page, lang));
}

// Each language has the same texts, and every text is used.
for (const [lang, own] of texts) {
  for (const key of own.keys()) {
    if (!used.has(key) && !key.startsWith('common.')) problems.push(`${lang}.json has "${key}", which no page uses`);
  }
  for (const key of texts.get(DEFAULT).keys()) {
    if (!own.has(key)) problems.push(`${lang}.json lacks "${key}"`);
  }
}
if (problems.length > 0) {
  console.error(`The landing's language files:\n  ${[...new Set(problems)].join('\n  ')}`);
  process.exit(1);
}

writeFileSync(`${OUT}/sitemap.xml`, sitemap());
console.log(`Landing built into www/: ${PAGES.length} pages in ${languages.join(', ')}`);

/** Every page in every language, each with its translations, as search engines like them. */
function sitemap() {
  const urls = PAGES.map((page) =>
    languages
      .map((lang) =>
        [
          '  <url>',
          `    <loc>${SITE}${path(page, lang)}</loc>`,
          ...languages.map(
            (other) => `    <xhtml:link rel="alternate" hreflang="${other}" href="${SITE}${path(page, other)}" />`,
          ),
          '  </url>',
        ].join('\n'),
      )
      .join('\n'),
  ).join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    `${urls}\n</urlset>\n`
  );
}
