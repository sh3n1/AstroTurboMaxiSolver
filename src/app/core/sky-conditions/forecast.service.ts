import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { AppState } from '../app-state.service';

import type { Forecast, OpenMeteoResponse } from './forecast';
import { forecastIsFor, forecastUrl, parseForecast } from './forecast';

const FORECAST_KEY = 'astroturbomaxisolver.forecast';
/**
 * A forecast is fetched again only once the kept one is this old, however often the
 * panel opens: the model itself only changes every few hours.
 */
const REFRESH_AFTER_MS = 15 * 60_000;
/** While the rows are on show, how often to check whether the forecast is due again. */
const CHECK_EVERY_MS = 60_000;

// Browser storage can be blocked or cleared, so the forecast must work without it.
function loadForecast(): Forecast | null {
  try {
    const stored = localStorage.getItem(FORECAST_KEY);
    return stored ? (JSON.parse(stored) as Forecast) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Without storage, the forecast lasts until the app closes.
  }
}

/**
 * The cloud and seeing forecast shown under the time control's ruler. The last forecast
 * is kept, so it still shows offline, with the time it was downloaded. A new one is
 * fetched when the time control opens with the rows on show, when the rows come on show
 * and while they stay on show, but only once the kept one is 15 minutes old, or for
 * another place.
 */
@Injectable({ providedIn: 'root' })
export class ForecastService {
  private readonly state = inject(AppState);

  /** The last forecast downloaded, for whichever place. */
  private readonly stored = signal<Forecast | null>(loadForecast());
  /** Whether the forecast rows are on show under the ruler. Collapsed each time the time control opens. */
  readonly shown = signal(false);
  /** True while a forecast is downloading. */
  readonly updating = signal(false);
  /** Set when the last download failed, so the panel can say why nothing new came. */
  readonly failed = signal(false);

  /** The forecast for the place set, or null when there is none for it. */
  readonly forecast = computed(() => {
    const forecast = this.stored();
    const { latitudeDeg, longitudeDeg, locationSet } = this.state.settings();
    return forecast && locationSet && forecastIsFor(forecast, latitudeDeg, longitudeDeg) ? forecast : null;
  });

  constructor() {
    // The rows close with the time control, so it always opens collapsed.
    effect(() => {
      if (!this.state.timeControlOpen()) untracked(() => this.shown.set(false));
    });
    // Checks when the time control opens with the rows on show, when the rows come on
    // show or the place changes, and each minute while they stay on show. Only those are
    // watched: a failed download must not retry in a loop.
    effect((onCleanup) => {
      const { latitudeDeg, longitudeDeg } = this.state.settings();
      if (!this.shown() || !this.state.timeControlOpen() || Number.isNaN(latitudeDeg + longitudeDeg)) return;
      untracked(() => void this.refreshIfDue());
      const timer = setInterval(() => void this.refreshIfDue(), CHECK_EVERY_MS);
      onCleanup(() => clearInterval(timer));
    });
    // Coming back online is a good moment to catch up.
    window.addEventListener('online', () => {
      if (this.shown() && this.state.timeControlOpen()) void this.refreshIfDue();
    });
  }

  toggle(): void {
    this.shown.set(!this.shown());
  }

  /** Downloads a new forecast if the one kept is missing, 15 minutes old, or for another place. */
  async refreshIfDue(): Promise<void> {
    const { latitudeDeg, longitudeDeg, locationSet } = this.state.settings();
    const current = this.forecast();
    const fresh = current && Date.now() - current.fetchedAt < REFRESH_AFTER_MS;
    if (!locationSet || fresh || this.updating() || !navigator.onLine) return;
    this.updating.set(true);
    try {
      const response = await fetch(forecastUrl(latitudeDeg, longitudeDeg));
      if (!response.ok) throw new Error(`Forecast: HTTP ${response.status}`);
      const forecast = parseForecast(
        (await response.json()) as OpenMeteoResponse,
        latitudeDeg,
        longitudeDeg,
        Date.now(),
      );
      this.stored.set(forecast);
      store(FORECAST_KEY, forecast);
      this.failed.set(false);
    } catch {
      // The kept forecast stays on show, with its time, until a download works.
      this.failed.set(true);
    } finally {
      this.updating.set(false);
    }
  }
}
