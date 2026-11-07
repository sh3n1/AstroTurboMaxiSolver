import { Pipe } from '@angular/core';
import type { PipeTransform } from '@angular/core';

/** How much of the date and time to show. */
export type LocalTimeFormat = 'time' | 'time-seconds' | 'date-time';

const OPTIONS: Record<LocalTimeFormat, Intl.DateTimeFormatOptions> = {
  time: { hour: 'numeric', minute: '2-digit' },
  'time-seconds': { hour: 'numeric', minute: '2-digit', second: '2-digit' },
  'date-time': { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' },
};

/**
 * A date or time in the phone's own format, so it reads "21:30" in Spain and "9:30 PM"
 * in the United States, with month names in the phone's language. Angular's date pipe
 * would need every language's data bundled to do this, so the browser does it instead.
 */
@Pipe({ name: 'localTime' })
export class LocalTimePipe implements PipeTransform {
  transform(value: Date | string | null | undefined, format: LocalTimeFormat = 'time'): string {
    if (value === null || value === undefined) return '';
    const date = value instanceof Date ? value : new Date(value);
    // No locale given: the browser uses the phone's language and region settings.
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, OPTIONS[format]).format(date);
  }
}
