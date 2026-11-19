// Pipes for numbers and counts in the user's language, for templates. The language is set
// once at start and changing it reloads the app, so the pipes are pure.

import { Pipe } from '@angular/core';
import type { PipeTransform } from '@angular/core';

import type { TextParams } from './t';
import { num, tn } from './t';

/**
 * A number in the user's language, like Angular's number pipe: `value | num: '1.1-2'` gives
 * at least one and at most two decimals. The digits before the dot are not used.
 */
@Pipe({ name: 'num' })
export class NumPipe implements PipeTransform {
  transform(value: number | null | undefined, digits = '1.0-3'): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '';
    const [, minDigits, maxDigits] = /^\d+\.(\d+)-(\d+)$/.exec(digits) ?? ['', '0', '3'];
    return num(value, Number(maxDigits), Number(minDigits));
  }
}

/** A text that depends on a count, in the user's language: `'lists.seenTimes' | plural: count`. */
@Pipe({ name: 'plural' })
export class PluralPipe implements PipeTransform {
  transform(key: string, count: number, params?: TextParams): string {
    return tn(key, count, params);
  }
}
