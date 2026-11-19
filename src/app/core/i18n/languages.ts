// The app's languages, and which one to show. Plain code, with no Angular, so it can be tested.

/** The language the app is written in, shown when no other fits, and for any text a language lacks. */
export const DEFAULT_LANGUAGE = 'en';

/**
 * The languages the app has, each with its own file in src/assets/i18n, such as es.json.
 * Each is named in itself, as language pickers do, so anyone can find their own.
 * Add a language here when its file is added.
 */
export const LANGUAGES: readonly { code: string; name: string }[] = [{ code: 'en', name: 'English' }];

/** The setting's value that follows the phone's language. */
export const AUTO_LANGUAGE = 'auto';

/**
 * The language to show: the one chosen in Settings if the app has it, otherwise the first of
 * the phone's languages that it has, by its main part ("es-ES" gives "es"), otherwise English.
 */
export function pickLanguage(
  chosen: string,
  phone: readonly string[],
  available: readonly string[] = LANGUAGES.map((language) => language.code),
): string {
  if (chosen !== AUTO_LANGUAGE && available.includes(chosen)) return chosen;
  for (const tag of phone) {
    const code = tag.toLowerCase().split('-')[0];
    if (available.includes(code)) return code;
  }
  return DEFAULT_LANGUAGE;
}
