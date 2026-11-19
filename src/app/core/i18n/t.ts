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
 * The locale numbers, dates and plurals follow, such as "es-ES": the app's language, with the
 * phone's region when they share it. Undefined until set, which leaves them to the browser.
 */
let locale: string | undefined;

/** Sets the locale, once the language is chosen: see i18n.ts. */
export function setLocale(next: string): void {
  locale = next;
  numberFormats.clear();
}

/** The locale, for the browser's date formats: undefined means the phone's own. */
export function appLocale(): string | undefined {
  return locale;
}

/** Number formats made once each, since the sky map formats numbers on every frame. */
const numberFormats = new Map<string, Intl.NumberFormat>();

/**
 * A number in the user's language, such as "4,5" in Spanish, with between `minDigits` and
 * `maxDigits` decimals. Only for the screen: files and data keep a decimal point.
 */
export function num(value: number, maxDigits = 0, minDigits = maxDigits): string {
  const key = `${minDigits}-${maxDigits}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits });
    numberFormats.set(key, format);
  }
  // A value that rounds to zero is zero: -0.2 at no decimals is "0", not "-0".
  return format.format(Number(value.toFixed(maxDigits)) === 0 ? 0 : value);
}

/**
 * A text that depends on a count, such as "1 star" or "3 stars": its key holds one form per
 * plural category of the language (one, few, many, other...), and `other` always. The count
 * is passed to the text as {{count}}.
 */
export function tn(key: string, count: number, params?: TextParams): string {
  const category = new Intl.PluralRules(locale).select(count);
  const values = { count: num(count), ...params };
  const text = translator(`${key}.${category}`, values);
  return text === `${key}.${category}` ? translator(`${key}.other`, values) : text;
}

/**
 * Marks a text's key kept in a constant or a map, for the check in scripts/check-i18n.mjs,
 * and returns it unchanged. Translate it where it is shown.
 */
export const i18n = (key: string): string => key;
