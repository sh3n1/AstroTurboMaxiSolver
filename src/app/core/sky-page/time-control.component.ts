import type { ElementRef } from '@angular/core';
import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { IonButton, IonDatetime, IonIcon, IonModal } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronBack, chevronDown, chevronForward, close, cloud, cloudOutline, timeOutline } from 'ionicons/icons';

import { APP_ICONS } from '../app-icons';
import { AppState } from '../app-state.service';
import { sunAltitudeDeg } from '../astronomy/astronomy';
import { LocalTimePipe } from '../local-time.pipe';
import type { SeeingQuality } from '../sky-conditions/forecast';
import { forecastAt, seeingQuality, shownSeeing } from '../sky-conditions/forecast';
import { ForecastService } from '../sky-conditions/forecast.service';
import { THEME } from '../theme';

import {
  PLANNING_RANGE_MS,
  STEP_MINUTES,
  addDays,
  clampToRange,
  isoDay,
  onDay,
  SKY_SHADE_COLOURS,
  skyShade,
  snapToStep,
  timeAfterDrag,
} from './planning-time';

/** Formats the forecast's download time. */
const TIME_PIPE = new LocalTimePipe();
/** The ruler's scale: an hour is about a finger's width and a half. */
const PX_PER_HOUR = 72;
/** A dark edge around the labels and the marker, so they stand out on the bright day too. */
const EDGE_COLOUR = THEME.ink;
/** How finely the ruler checks where the Sun is, in minutes. */
const SHADE_STEP_MINUTES = 10;
/** The ruler's height, and each forecast row's, before the text size scales them. */
const RULER_HEIGHT = 52;
const ROW_HEIGHT = 30;
/** The width of the rows' label column, with their icons. Keep in step with .row-label. */
const LABEL_COLUMN_WIDTH = 34;
/** Clear sky is dark, cloud is light grey, and the shades between in proportion. */
const CLEAR_SKY = [15, 22, 38];
const CLOUDY_SKY = [184, 192, 208];
const CLEAR_SKY_CSS = 'rgb(15 22 38)';
/** Seeing's colours: green for good, the panel's blue for fair, amber and red for poor and bad. */
const SEEING_COLOURS: Record<SeeingQuality, string> = {
  good: '#2f6f52',
  fair: '#33405a',
  poor: '#7a5523',
  bad: '#7a2e2e',
};

/**
 * The time control, for planning: the sky at another time. It sits at the bottom of
 * every tab, so the lists change as the time does. While a time is chosen, a light blue
 * band always says so, with a button back to now. The time is chosen by dragging a ruler
 * of hours, shaded for day, twilight and full darkness, or by day with the arrows and a
 * calendar. Plate solving pauses meanwhile, since the camera sees the real sky.
 */
@Component({
  selector: 'app-time-control',
  host: { '[class.showing]': 'state.timeControlOpen() || state.planning()' },
  imports: [LocalTimePipe, IonButton, IonDatetime, IonIcon, IonModal],
  styles: `
    :host {
      display: block;
      background: rgb(var(--af-surface-rgb) / 94%);
      color: var(--af-text);
    }
    /*
     * A light blue line above and below while it shows anything, so it stands apart from
     * the map or the page above it. Closed with nothing to say, it has no lines.
     */
    :host(.showing) {
      border-top: 2px solid var(--ion-color-primary);
      border-bottom: 2px solid var(--ion-color-primary);
    }
    /* Closed while another time is on show: one line saying which, and a way back to now. */
    .band {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 4px 2px 12px;
      min-height: 48px;
    }
    .band-text {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: calc(15px * var(--af-scale));
      font-weight: 600;
      color: var(--af-text);
      background: none;
      border: none;
      text-align: start;
      padding: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* The same amber clock as the sky map's button, at the same size. */
    .band-text ion-icon {
      flex: none;
      font-size: 24px;
      color: var(--ion-color-warning);
    }
    .row {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 4px 0;
    }
    /* Words as written, not in capitals as Ionic's buttons would have them. */
    ion-button {
      text-transform: none;
      font-size: calc(16px * var(--af-scale));
      margin: 0;
      /* Narrow sides, so the day and time keep room beside five buttons. */
      --padding-start: 6px;
      --padding-end: 6px;
    }
    /* The day and time, on one line: tapping it opens the calendar. */
    .when {
      flex: 1;
      min-width: 0;
      --padding-start: 4px;
      --padding-end: 4px;
      --color: var(--af-text);
    }
    /* The day above the time, so both fit beside the buttons at large text sizes. */
    .when {
      height: auto;
      min-height: 48px;
    }
    .when-text {
      display: flex;
      flex-direction: column;
      align-items: center;
      line-height: 1.15;
    }
    .when-text span {
      white-space: nowrap;
    }
    .day {
      font-size: calc(13px * var(--af-scale));
      font-weight: 500;
    }
    .time {
      font-size: calc(18px * var(--af-scale));
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    canvas {
      display: block;
      width: 100%;
      touch-action: none;
      cursor: grab;
    }
    /* The ruler, with the forecast rows' icons over its left edge. */
    .ruler {
      position: relative;
    }
    /*
     * Each forecast row's label: an icon in a solid column at the left, like a frozen
     * column in a table. Exactly the row's height, so the cells pass cleanly behind it.
     */
    .row-label {
      position: absolute;
      left: 0;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      width: calc(34px * var(--af-scale));
      background: var(--af-surface);
      border-right: 1px solid var(--af-edge);
      pointer-events: none;
    }
    .row-label ion-icon {
      font-size: calc(18px * var(--af-scale));
    }
    .forecast-status {
      padding: 2px 12px 4px;
      text-align: end;
      font-size: calc(13px * var(--af-scale));
    }
    canvas:focus-visible {
      outline: 2px solid var(--ion-color-primary);
    }
    /* Words for screen readers, since some buttons only show icons. */
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    /*
     * A phone on its side: the buttons and the ruler share one line, the ruler taking the
     * width that is left, so the control costs the short screen half the height.
     */
    @media (orientation: landscape) and (max-height: 520px) {
      :host {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
      }
      .row {
        flex: none;
        padding: 0 2px;
      }
      .when {
        flex: none;
        min-width: 96px;
      }
      .ruler {
        flex: 1;
        min-width: 0;
      }
      .band,
      .forecast-status {
        flex: 1 0 100%;
      }
    }
  `,
  template: `
    @if (state.timeControlOpen()) {
      <div class="row">
        <ion-button fill="clear" data-testid="previous-day" (click)="shiftDays(-1)">
          <ion-icon slot="icon-only" name="chevron-back" aria-hidden="true"></ion-icon>
          <span class="visually-hidden">Previous day</span>
        </ion-button>
        <ion-button fill="clear" class="when" data-testid="pick-day" (click)="pickingDay.set(true)">
          <span class="when-text">
            <span class="day">{{ shown() | localTime: 'date' }}</span>
            <span class="time" data-testid="planned-time">{{ shown() | localTime }}</span>
          </span>
        </ion-button>
        <ion-button fill="clear" data-testid="next-day" (click)="shiftDays(1)">
          <ion-icon slot="icon-only" name="chevron-forward" aria-hidden="true"></ion-icon>
          <span class="visually-hidden">Next day</span>
        </ion-button>
        <ion-button fill="clear" data-testid="time-now" [disabled]="!state.planning()" (click)="backToNow()">
          Now
        </ion-button>
        <!-- Shows or hides the forecast rows under the ruler: a cloud, filled while they show. -->
        <ion-button
          fill="clear"
          data-testid="expand-time"
          [attr.aria-pressed]="forecast.shown()"
          (click)="forecast.toggle()"
        >
          <ion-icon
            slot="icon-only"
            aria-hidden="true"
            [name]="forecast.shown() ? 'cloud' : 'cloud-outline'"
          ></ion-icon>
          <span class="visually-hidden">Clouds and seeing</span>
        </ion-button>
        <ion-button fill="clear" data-testid="close-time" (click)="state.timeControlOpen.set(false)">
          <ion-icon slot="icon-only" name="chevron-down" aria-hidden="true"></ion-icon>
          <span class="visually-hidden">Close the time control</span>
        </ion-button>
      </div>
      <!-- Drag sideways to change the time. The arrow keys work too, for keyboards. -->
      <div class="ruler">
        <canvas
          #ruler
          data-testid="time-ruler"
          tabindex="0"
          role="slider"
          aria-label="Time of the sky"
          [attr.aria-valuetext]="shown() | localTime: 'date-time'"
          [attr.aria-valuenow]="shown().getTime()"
          [attr.aria-valuemin]="earliest().getTime()"
          [attr.aria-valuemax]="latest().getTime()"
          (pointerdown)="startDrag($event)"
          (pointermove)="drag($event)"
          (pointerup)="endDrag()"
          (pointercancel)="endDrag()"
          [style.height.px]="canvasHeight()"
          (keydown)="key($event)"
        ></canvas>
        @if (forecast.shown()) {
          <div class="row-label" [style.top.px]="rulerHeight()" [style.height.px]="rowHeight() - 1">
            <ion-icon name="cloud-outline" aria-hidden="true"></ion-icon>
          </div>
          <div class="row-label" [style.top.px]="rulerHeight() + rowHeight()" [style.height.px]="rowHeight() - 1">
            <ion-icon [src]="appIcons.seeing" aria-hidden="true"></ion-icon>
          </div>
        }
      </div>
      @if (forecast.shown()) {
        <div class="forecast-status" data-testid="forecast-status">{{ forecastStatus() }}</div>
      }
      <!--
        The calendar: a small card over the map, in the app's colours (styled in global.scss,
        since Ionic moves the modal out of this component). Tapping a day picks it and closes.
      -->
      <ion-modal class="day-picker-modal" [isOpen]="pickingDay()" (didDismiss)="pickingDay.set(false)">
        <ng-template>
          <div class="day-picker-card">
            <ion-datetime
              presentation="date"
              data-testid="day-picker"
              [value]="isoDay(shown())"
              [min]="isoDay(earliest())"
              [max]="isoDay(latest())"
              (ionChange)="pickDay($event)"
            ></ion-datetime>
            <div class="day-picker-actions">
              <ion-button fill="clear" data-testid="day-picker-today" (click)="pickToday()">Today</ion-button>
              <ion-button
                fill="clear"
                data-testid="day-picker-close"
                aria-label="Close"
                (click)="pickingDay.set(false)"
              >
                <ion-icon slot="icon-only" name="close" aria-hidden="true"></ion-icon>
              </ion-button>
            </div>
          </div>
        </ng-template>
      </ion-modal>
    } @else if (state.planning()) {
      <div class="band" data-testid="planning-band">
        <!-- Tapping the words opens the time control again. -->
        <button class="band-text" type="button" (click)="state.timeControlOpen.set(true)">
          <ion-icon name="time-outline" aria-hidden="true"></ion-icon>
          <span>Showing {{ shown() | localTime: 'date' }} · {{ shown() | localTime }}</span>
        </button>
        <!-- "Now" goes back to the real time, as on the time control, and the band goes with it. -->
        <ion-button fill="clear" data-testid="band-now" aria-label="Back to now" (click)="backToNow()">Now</ion-button>
      </div>
    }
  `,
})
export class TimeControlComponent {
  protected readonly state = inject(AppState);
  protected readonly forecast = inject(ForecastService);
  private readonly ruler = viewChild<ElementRef<HTMLCanvasElement>>('ruler');

  /** The time on show: the chosen one, or now. */
  protected readonly shown = computed(() => this.state.plannedTime() ?? this.state.now());
  protected readonly pickingDay = signal(false);
  protected readonly appIcons = APP_ICONS;
  protected readonly earliest = computed(() => new Date(this.state.now().getTime() - PLANNING_RANGE_MS));
  protected readonly latest = computed(() => new Date(this.state.now().getTime() + PLANNING_RANGE_MS));
  protected readonly isoDay = isoDay;

  /** The ruler's height and each forecast row's, in pixels at the text size set. */
  protected readonly rulerHeight = computed(() => RULER_HEIGHT * this.state.textScale());
  protected readonly rowHeight = computed(() => ROW_HEIGHT * this.state.textScale());
  protected readonly canvasHeight = computed(
    () => this.rulerHeight() + (this.forecast.shown() ? 2 * this.rowHeight() : 0),
  );

  /** Under the rows: when the forecast was downloaded, or why there is none. */
  protected readonly forecastStatus = computed(() => {
    if (!this.state.settings().locationSet) return 'Set a location for the forecast';
    const forecast = this.forecast.forecast();
    if (this.forecast.updating() && !forecast) return 'Updating…';
    if (!forecast) return 'No forecast';
    const fetched = new Date(forecast.fetchedAt);
    const today = fetched.toDateString() === new Date().toDateString();
    return `Updated ${TIME_PIPE.transform(fetched, today ? 'time' : 'date-time')}`;
  });

  /** Where a drag started, and the time then. */
  private dragStart: { x: number; time: Date } | null = null;

  constructor() {
    addIcons({
      chevronBack,
      chevronDown,
      chevronForward,
      close,
      cloud,
      cloudOutline,
      timeOutline,
    });
    // Redraws the ruler when the time, the place, the text size or the forecast changes, or it opens.
    effect((onCleanup) => {
      const canvas = this.ruler()?.nativeElement;
      if (!canvas) return;
      // The ruler's width changes when the phone is turned, so it is drawn again to fit.
      const resizes = new ResizeObserver(() => this.rulerWidth.set(canvas.clientWidth));
      resizes.observe(canvas);
      onCleanup(() => resizes.disconnect());
    });
    effect(() => {
      const canvas = this.ruler()?.nativeElement;
      this.rulerWidth();
      if (canvas) this.drawRuler(canvas, this.shown());
    });
  }

  /** The ruler's width on screen. Read by the drawing, so a new width draws it again. */
  private readonly rulerWidth = signal(0);

  /** Chooses a time, rounded to the step and kept within a year of now. */
  private choose(time: number): void {
    this.state.plannedTime.set(snapToStep(clampToRange(time, Date.now())));
  }

  protected shiftDays(days: number): void {
    this.choose(addDays(this.shown(), days).getTime());
  }

  protected pickDay(event: Event): void {
    const value = (event as CustomEvent<{ value?: string | string[] | null }>).detail.value;
    if (typeof value === 'string') this.choose(onDay(this.shown(), value.slice(0, 10)).getTime());
    this.pickingDay.set(false);
  }

  /** Jumps to today, keeping the time of day on show. */
  protected pickToday(): void {
    this.choose(onDay(this.shown(), isoDay(new Date())).getTime());
    this.pickingDay.set(false);
  }

  /**
   * Back to the real time. The control stays as it was: open on the ruler, so the
   * user can carry on from now, or closed when this came from the planning band.
   */
  protected backToNow(): void {
    this.state.plannedTime.set(null);
  }

  protected startDrag(event: PointerEvent): void {
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.dragStart = { x: event.clientX, time: this.shown() };
  }

  protected drag(event: PointerEvent): void {
    if (!this.dragStart) return;
    const time = timeAfterDrag(this.dragStart.time, event.clientX - this.dragStart.x, this.pxPerHour(), Date.now());
    // Only a real change, so the lists and map don't redo their work for nothing.
    if (time.getTime() !== this.shown().getTime()) this.state.plannedTime.set(time);
  }

  protected endDrag(): void {
    this.dragStart = null;
  }

  /** The arrow keys move a step, and Page Up and Down an hour. */
  protected key(event: KeyboardEvent): void {
    const minutes: Record<string, number> = {
      ArrowRight: STEP_MINUTES,
      ArrowLeft: -STEP_MINUTES,
      PageUp: 60,
      PageDown: -60,
    };
    if (!(event.key in minutes)) return;
    event.preventDefault();
    this.choose(this.shown().getTime() + minutes[event.key] * 60_000);
  }

  private pxPerHour(): number {
    return PX_PER_HOUR * this.state.textScale();
  }

  /**
   * The ruler: the sky's shade through the hours around the chosen time, a tick each
   * quarter hour, the hours labelled, a day's name at midnight, and a marker in the middle.
   */
  private drawRuler(canvas: HTMLCanvasElement, time: Date): void {
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    // The heights come from the signals, since the canvas may not have resized yet.
    const height = this.rulerHeight();
    const fullHeight = this.canvasHeight();
    if (!width) return;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(fullHeight * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);

    const pxPerHour = this.pxPerHour();
    const centre = width / 2;
    const xOf = (t: number) => centre + ((t - time.getTime()) / 3_600_000) * pxPerHour;
    const halfSpanMs = (centre / pxPerHour) * 3_600_000;
    const { latitudeDeg, longitudeDeg } = this.state.settings();

    // The sky's shade, a strip every ten minutes.
    const stepMs = SHADE_STEP_MINUTES * 60_000;
    const first = Math.floor((time.getTime() - halfSpanMs) / stepMs) * stepMs;
    for (let t = first; t < time.getTime() + halfSpanMs + stepMs; t += stepMs) {
      const middle = new Date(t + stepMs / 2);
      ctx.fillStyle = SKY_SHADE_COLOURS[skyShade(sunAltitudeDeg(middle, latitudeDeg, longitudeDeg))];
      ctx.fillRect(xOf(t), 0, (stepMs / 3_600_000) * pxPerHour + 1, height);
    }

    // Ticks and labels, in the phone's own clock format.
    const style = getComputedStyle(canvas);
    const text = style.getPropertyValue('--af-text').trim() || THEME.text;
    const accent = style.getPropertyValue('--ion-color-primary').trim() || THEME.primary;
    const scale = this.state.textScale();
    ctx.strokeStyle = text;
    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.font = `600 ${Math.round(14 * scale)}px system-ui, sans-serif`;
    const hourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
    const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
    const quarter = 15 * 60_000;
    for (let t = Math.ceil((time.getTime() - halfSpanMs) / quarter) * quarter; xOf(t) <= width; t += quarter) {
      const x = xOf(t);
      const date = new Date(t);
      const isHour = date.getMinutes() === 0;
      ctx.lineWidth = isHour ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, isHour ? height * 0.35 : height * 0.18);
      ctx.stroke();
      if (isHour) {
        const label = date.getHours() === 0 ? dayFormat.format(date) : hourFormat.format(date);
        // Outlined first, like the map's labels, then filled in the text colour.
        ctx.save();
        ctx.strokeStyle = EDGE_COLOUR;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeText(label, x, height - 8);
        ctx.restore();
        ctx.fillText(label, x, height - 8);
      }
    }

    if (this.forecast.shown()) this.drawForecast(ctx, width, height, xOf, time.getTime() - halfSpanMs, text);

    // The marker for the chosen time, through the forecast rows too: a wider dark line
    // first, as an edge, so the light blue shows on the bright blue day.
    ctx.beginPath();
    ctx.moveTo(centre, 0);
    ctx.lineTo(centre, fullHeight);
    ctx.strokeStyle = EDGE_COLOUR;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  /**
   * The forecast rows under the ruler, an hour a cell: cloud cover as a grey from dark
   * (clear) to light (cloudy) with its percentage, and seeing coloured by how good it is,
   * in arcseconds. Hours outside the forecast stay empty.
   */
  private drawForecast(
    ctx: CanvasRenderingContext2D,
    width: number,
    top: number,
    xOf: (t: number) => number,
    from: number,
    text: string,
  ): void {
    const forecast = this.forecast.forecast();
    const pxPerHour = this.pxPerHour();
    const row = this.rowHeight();
    ctx.fillStyle = CLEAR_SKY_CSS;
    ctx.fillRect(0, top, width, 2 * row);
    if (!forecast) return;
    ctx.font = `700 ${Math.round(13 * this.state.textScale())}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    // A figure is drawn only where it fits whole beside the rows' label column.
    const labelColumn = LABEL_COLUMN_WIDTH * this.state.textScale();
    const fits = (label: string, middle: number) => middle - ctx.measureText(label).width / 2 > labelColumn + 2;
    const hour = 3_600_000;
    for (let t = Math.floor(from / hour) * hour; xOf(t - hour / 2) <= width; t += hour) {
      const cell = forecastAt(forecast, t);
      if (!cell) continue;
      const left = xOf(t - hour / 2);
      const middle = xOf(t);
      if (cell.cloudPercent !== null) {
        const share = cell.cloudPercent / 100;
        const [r, g, b] = CLEAR_SKY.map((c, i) => Math.round(c + (CLOUDY_SKY[i] - c) * share));
        ctx.fillStyle = `rgb(${r} ${g} ${b})`;
        ctx.fillRect(left, top, pxPerHour + 0.5, row - 1);
        // Dark figures on light cloud, light ones on clear sky.
        ctx.fillStyle = share > 0.55 ? THEME.ink : text;
        const label = `${Math.round(cell.cloudPercent)}%`;
        if (fits(label, middle)) ctx.fillText(label, middle, top + row / 2);
      }
      if (cell.seeingArcsec !== null) {
        ctx.fillStyle = SEEING_COLOURS[seeingQuality(cell.seeingArcsec)];
        ctx.fillRect(left, top + row, pxPerHour + 0.5, row - 1);
        ctx.fillStyle = text;
        const label = `${shownSeeing(cell.seeingArcsec).toFixed(1)}″`;
        if (fits(label, middle)) ctx.fillText(label, middle, top + row * 1.5);
      }
    }
    ctx.textBaseline = 'alphabetic';
  }
}
