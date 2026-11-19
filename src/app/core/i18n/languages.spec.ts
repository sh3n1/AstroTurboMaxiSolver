import { describe, expect, it } from 'vitest';

import { pickLanguage, pickLocale } from './languages';

const AVAILABLE = ['en', 'es'];

describe('pickLanguage', () => {
  it('follows the phone, by the main part of its language', () => {
    expect(pickLanguage('auto', ['es-ES', 'en-GB'], AVAILABLE)).toBe('es');
    expect(pickLanguage('auto', ['fr-FR', 'es-MX'], AVAILABLE)).toBe('es');
  });

  it('takes the language chosen in Settings over the phone', () => {
    expect(pickLanguage('en', ['es-ES'], AVAILABLE)).toBe('en');
  });

  it('falls back to English when the app has none of them', () => {
    expect(pickLanguage('auto', ['fr-FR', 'de'], AVAILABLE)).toBe('en');
    expect(pickLanguage('auto', [], AVAILABLE)).toBe('en');
    // A language chosen once but no longer in the app.
    expect(pickLanguage('it', ['fr-FR'], AVAILABLE)).toBe('en');
  });
});

describe('pickLocale', () => {
  it('keeps the phone region when the phone speaks the language', () => {
    expect(pickLocale('en', ['en-GB', 'es-ES'])).toBe('en-GB');
    expect(pickLocale('es', ['en-GB', 'es-MX'])).toBe('es-MX');
  });

  it('uses the language alone when the phone does not speak it', () => {
    expect(pickLocale('en', ['fr-FR'])).toBe('en');
  });
});
