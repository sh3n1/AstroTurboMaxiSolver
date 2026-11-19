// The app's languages, with ngx-translate (MIT). Every text shown on screen lives in a
// language file, src/assets/i18n/<language>.json, under a key grouped by area, such as
// "settings.title". Templates use the `translate` pipe; code uses TranslateService.instant().
//
// Each language is its own file, downloaded at start and kept by the service worker for
// offline use, so a user only downloads their own language.

import { provideHttpClient } from '@angular/common/http';
import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { firstValueFrom } from 'rxjs';

/** The language the app is written in, used for any text another language lacks. */
export const DEFAULT_LANGUAGE = 'en';

/**
 * Sets up translations, and loads the language before the first page shows, so a page never
 * shows a raw key such as "settings.title" for a moment.
 */
export function provideI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(),
    provideTranslateService({
      // Relative to the page's base address, so it works at / and at /app/.
      loader: provideTranslateHttpLoader({ prefix: './assets/i18n/', suffix: '.json' }),
      lang: DEFAULT_LANGUAGE,
      fallbackLang: DEFAULT_LANGUAGE,
    }),
    provideAppInitializer(() => firstValueFrom(inject(TranslateService).use(DEFAULT_LANGUAGE))),
  ]);
}

/**
 * Marks a text's key kept in a constant or a map, for the check in scripts/check-i18n.mjs,
 * and returns it unchanged. Translate it where it is shown.
 */
export const i18n = (key: string): string => key;
