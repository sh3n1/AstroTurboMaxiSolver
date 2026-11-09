import { Pipe } from '@angular/core';
import type { PipeTransform } from '@angular/core';

/** How much of the date and time to show. */
export type LocalTimeFormat = 'time' | 'time-seconds' | 'date' | 'day' | 'date-time';

const OPTIONS: Record<LocalTimeFormat, Intl.DateTimeFormatOptions> = {
  time: { hour: 'numeric', minute: '2-digit' },
  'time-seconds': { hour: 'numeric', minute: '2-digit', second: '2-digit' },
  date: { weekday: 'short', day: 'numeric', month: 'short' },
  day: { day: 'numeric', month: 'short' },
  'date-time': { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' },
};

/** The formats that show a date, which add the year when it isn't this one. */
const SHOWS_DATE = new Set<LocalTimeFormat>(['date', 'day', 'date-time']);

/**
 * A date or time in the phone's own format, so it reads "21:30" in Spain and "9:30 PM"
 * in the United States, with month names in the phone's language. Angular's date pipe
 * would need every language's data bundled to do this, so the browser does it instead.
 * A date in another year, as when planning ahead, gets a two-digit year: "Mon, Jan 4, 27".
 */
@Pipe({ name: 'localTime' })
export class LocalTimePipe implements PipeTransform {
  transform(value: Date | string | null | undefined, format: LocalTimeFormat = 'time'): string {
    if (value === null || value === undefined) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const otherYear = SHOWS_DATE.has(format) && date.getFullYear() !== new Date().getFullYear();
    const options: Intl.DateTimeFormatOptions = otherYear ? { ...OPTIONS[format], year: '2-digit' } : OPTIONS[format];
    // No locale given: the browser uses the phone's language and region settings.
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}
