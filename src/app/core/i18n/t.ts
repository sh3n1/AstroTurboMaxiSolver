// t(): a text in the user's language, for plain code with no Angular. Kept apart from
// i18n.ts, with no imports, so code that also runs in a web worker, such as astronomy.ts,
// can use it without pulling Angular in.

/** Values filled into a text, such as {{count}} in "{{count}} stars". */
export type TextParams = Record<string, string | number>;

/** Turns a key into its text in the user's language. */
type Translator = (key: string, params?: TextParams) => string;

/** Until the language has loaded, a text is shown as its key, which makes a gap easy to spot. */
let translator: Translator = (key) => key;

/** Sets how t() translates: the app's TranslateService, or en.json in unit tests. */
export function setTranslator(next: Translator): void {
  translator = next;
}

/**
 * A text in the user's language, for plain code with no Angular, such as the helpers that
 * word a target's size or distance. Templates use the translate pipe instead.
 */
export function t(key: string, params?: TextParams): string {
  return translator(key, params);
}

/**
 * Marks a text's key kept in a constant or a map, for the check in scripts/check-i18n.mjs,
 * and returns it unchanged. Translate it where it is shown.
 */
export const i18n = (key: string): string => key;
