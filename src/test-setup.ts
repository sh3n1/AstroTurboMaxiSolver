import { setLocale, setTranslator } from './app/core/i18n/t';
import english from './assets/i18n/en.json';

// Polyfills for running unit tests under jsdom (the default Vitest environment).
// Ionic components such as ion-menu and ion-split-pane query `window.matchMedia`,
// which jsdom does not implement.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Plain code words its texts through t() from core/i18n: in unit tests it reads the English
// language file directly, so the tests check the real wording.

setTranslator((key, params) => {
  let text: unknown = english;
  for (const part of key.split('.')) text = (text as Record<string, unknown> | undefined)?.[part];
  if (typeof text !== 'string') return key;
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => String(params?.[name] ?? match));
});

// Numbers, dates and plurals in English too, whatever the computer running the tests uses.
setLocale('en');
