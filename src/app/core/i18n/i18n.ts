// The app's languages, with ngx-translate (MIT). Every text shown on screen lives in a
// language file, src/assets/i18n/<language>.json, under a key grouped by area, such as
// "settings.title". Templates use the `translate` pipe; plain code uses t() from ./t.
//
// Each language is its own file, downloaded at start and kept by the service worker for
// offline use. English is also loaded with any other language, for the texts it lacks.

import { provideHttpClient } from '@angular/common/http';
import type { EnvironmentProviders } from '@angular/core';
import { inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { firstValueFrom } from 'rxjs';

import { AppState } from '../app-state.service';

import { DEFAULT_LANGUAGE, pickLanguage } from './languages';
import { setTranslator } from './t';

/**
 * Sets up translations, and loads the language before the first page shows, so a page never
 * shows a raw key such as "settings.title" for a moment. The language is the one chosen in
 * Settings, or the phone's, or English: see pickLanguage. Changing it reloads the app.
 */
export function provideI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(),
    provideTranslateService({
      // Relative to the page's base address, so it works at / and at /app/.
      loader: provideTranslateHttpLoader({ prefix: './assets/i18n/', suffix: '.json' }),
      fallbackLang: DEFAULT_LANGUAGE,
    }),
    provideAppInitializer(async () => {
      const translate = inject(TranslateService);
      const language = pickLanguage(inject(AppState).settings().language, navigator.languages ?? []);
      await firstValueFrom(translate.use(language));
      setTranslator((key, params) => translate.instant(key, params) as string);
      // For screen readers and the browser's own wording, such as its date pickers.
      document.documentElement.lang = language;
    }),
  ]);
}
