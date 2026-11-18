import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { AppState } from '../app-state.service';
import { sunAltitudeDeg } from '../astronomy/astronomy';
import { designations } from '../catalog/designations';
import type { Target } from '../catalog/targets';
import { LocalTimePipe } from '../local-time.pipe';
import { sideways } from '../sensors/sideways';
import { SKY_SHADE_COLOURS } from '../sky-page/planning-time';

import { tonight, tonightChart } from './tonight';

const TIME = new LocalTimePipe();

// The chart's size, in its own units: it stretches to the page's width. Taller than the
// details' chart, since several lines share it.
const CHART_WIDTH = 336;
/**
 * On a phone on its side the chart is drawn twice as wide for the same height, so it fills
 * the screen's width and the night's hours spread out, instead of growing taller with it.
 */
const SIDEWAYS_CHART_WIDTH = 720;
const CHART_TOP = 8;
const CHART_HORIZON = 112;
const CHART_HEIGHT = 136;

/** At most this many lines, so the chart stays readable. The rest are listed as "+3 more". */
const MAX_LINES = 8;

/**
 * One colour per target, told apart by lightness as well as hue. No orange (other apps'
 * guidance), red (the reticle), green (on target) or light blue (guidance) among them.
 */
const LINE_COLOURS = ['#ffd76a', '#6fe3e3', '#c9a0ff', '#ff9ecf', '#f2f4ff', '#8f9dff', '#d8c08a', '#b6e3a0'];

/** A target's line on the chart, with its label at its highest point. */
interface PlanLine {
  target: Target;
  label: string;
  colour: string;
  line: string;
  peak: { x: number; y: number; text: string } | null;
}

/**
 * How high each of several targets is through tonight, on one chart over the sky's own
 * colours, so a night's plan can be put in order. Tapping a name picks out its line.
 */
@Component({
  selector: 'app-plan-chart',
  // Everything shown comes from signals, so the page is checked only when one changes,
  // not each time the sky map behind it updates.
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      padding: 8px 16px 4px;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }
    /* The names, each with its line's colour. A tap picks one out. */
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 6px;
      margin-top: 6px;
    }
    .legend button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      padding: 2px 10px;
      border: 1px solid var(--ion-border-color);
      border-radius: 16px;
      background: none;
      color: var(--af-text);
      font: inherit;
      font-size: calc(14px * var(--af-scale, 1));
    }
    .legend button[aria-pressed='true'] {
      border-color: var(--af-text);
    }
    .swatch {
      width: 14px;
      height: 4px;
      border-radius: 2px;
    }
    .more {
      align-self: center;
      color: var(--af-muted);
      font-size: calc(14px * var(--af-scale, 1));
    }
  `,
  template: `
    @let chart = plan();
    <svg
      [attr.viewBox]="'0 0 ' + chartWidth() + ' ' + chartHeight"
      role="img"
      data-testid="plan-chart"
      [attr.aria-label]="chart.label"
    >
      @for (band of chart.bands; track band.x) {
        <rect
          [attr.x]="band.x"
          y="0"
          [attr.width]="band.width"
          [attr.height]="horizon + 2"
          [attr.fill]="shadeColours[band.shade]"
        />
      }
      <line
        x1="0"
        [attr.y1]="chart.goodY"
        [attr.x2]="chartWidth()"
        [attr.y2]="chart.goodY"
        stroke="var(--af-muted)"
        stroke-dasharray="3 4"
        opacity="0.6"
      />
      <line
        x1="0"
        [attr.y1]="horizon"
        [attr.x2]="chartWidth()"
        [attr.y2]="horizon"
        stroke="var(--af-muted)"
        opacity="0.6"
      />
      <text
        [attr.x]="chartWidth() - 4"
        [attr.y]="chart.goodY - 3"
        text-anchor="end"
        font-size="13"
        fill="var(--af-muted)"
        stroke="var(--af-ink)"
        stroke-width="3"
        paint-order="stroke"
      >
        30°
      </text>

      @for (line of chart.lines; track line.target.id) {
        @let dim = !!picked() && picked() !== line.target.id;
        <polyline
          data-testid="plan-line"
          [attr.points]="line.line"
          fill="none"
          [attr.stroke]="line.colour"
          [attr.stroke-width]="picked() === line.target.id ? 3 : 2"
          [attr.opacity]="dim ? 0.25 : 1"
          stroke-linejoin="round"
        />
      }
      <!-- The names on top of every line, so no line hides one. -->
      @for (line of chart.lines; track line.target.id) {
        @if (line.peak; as peak) {
          @let dim = !!picked() && picked() !== line.target.id;
          <g [attr.opacity]="dim ? 0.25 : 1">
            <circle [attr.cx]="peak.x" [attr.cy]="peak.y" r="2.5" [attr.fill]="line.colour" />
            <text
              [attr.x]="peak.x"
              [attr.y]="peak.y - 5"
              [attr.text-anchor]="peak.x < 30 ? 'start' : peak.x > chartWidth() - 30 ? 'end' : 'middle'"
              font-size="12"
              font-weight="700"
              [attr.fill]="line.colour"
              stroke="var(--af-ink)"
              stroke-width="3"
              paint-order="stroke"
            >
              {{ line.label }}
            </text>
          </g>
        }
      }

      @if (chart.now; as now) {
        <line
          [attr.x1]="now.x"
          y1="0"
          [attr.x2]="now.x"
          [attr.y2]="horizon + 2"
          stroke="var(--ion-color-primary)"
          stroke-width="2"
        />
      }
      @for (hour of chart.hours; track hour.x; let first = $first) {
        <text
          [attr.x]="hour.x"
          [attr.y]="chartHeight - 4"
          [attr.text-anchor]="first ? 'start' : 'middle'"
          font-size="13"
          fill="var(--af-muted)"
        >
          {{ hour.label }}
        </text>
      }
    </svg>

    <div class="legend">
      @for (line of chart.lines; track line.target.id) {
        <button
          type="button"
          data-testid="plan-legend"
          [attr.aria-pressed]="picked() === line.target.id"
          (click)="pick(line.target.id)"
        >
          <span class="swatch" [style.background]="line.colour"></span>{{ line.label }}
        </button>
      }
      @if (chart.more > 0) {
        <span class="more">+{{ chart.more }} more</span>
      }
    </div>
  `,
})
export class PlanChartComponent {
  /** The targets, in the plan's order. */
  readonly targets = input.required<readonly Target[]>();

  private readonly state = inject(AppState);

  protected readonly chartWidth = computed(() => (sideways() ? SIDEWAYS_CHART_WIDTH : CHART_WIDTH));
  protected readonly chartHeight = CHART_HEIGHT;
  protected readonly horizon = CHART_HORIZON;
  protected readonly shadeColours = SKY_SHADE_COLOURS;

  /** The target whose line is picked out, or null for all alike. */
  protected readonly picked = signal<string | null>(null);

  protected pick(id: string): void {
    this.picked.set(this.picked() === id ? null : id);
  }

  /**
   * Every target's height through tonight, with the minute clock. The sky's shades,
   * the hours and now are the same for all, so they come from the first.
   */
  protected readonly plan = computed(() => {
    const now = this.state.now();
    const width = this.chartWidth();
    const { latitudeDeg, longitudeDeg } = this.state.settings();
    // Each target once, even if a catalogue lists it under two numbers.
    const unique = [...new Map(this.targets().map((t) => [t.id, t])).values()];
    const shown = unique.slice(0, MAX_LINES);
    const sunAt = (time: Date): number => sunAltitudeDeg(time, latitudeDeg, longitudeDeg);

    let base: ReturnType<typeof tonightChart> | null = null;
    const lines: PlanLine[] = shown.map((target, i) => {
      const night = tonight((time) => this.state.positionAt(target, time).altDeg, sunAt, now);
      const chart = tonightChart(night, now, width, CHART_TOP, CHART_HORIZON);
      base ??= chart;
      return {
        target,
        label: designations(target)[0] ?? target.id,
        colour: LINE_COLOURS[i % LINE_COLOURS.length],
        line: chart.line,
        peak:
          chart.peak && night.highest
            ? { ...chart.peak, text: `${Math.round(night.highest.altDeg)}° at ${TIME.transform(night.highest.time)}` }
            : null,
      };
    });

    // With no targets, the night's shades alone: a chart with nothing on it.
    base ??= tonightChart(
      tonight(() => -90, sunAt, now),
      now,
      width,
      CHART_TOP,
      CHART_HORIZON,
    );
    const { bands, hours, goodY } = base;
    const label =
      'Height through the night: ' +
      lines.map((l) => (l.peak ? `${l.label}, highest ${l.peak.text}` : `${l.label}, not up`)).join('; ');
    return {
      bands,
      goodY,
      now: base.now,
      hours: hours.map((hour) => ({ ...hour, label: TIME.transform(hour.time) })),
      lines,
      more: unique.length - shown.length,
      label,
    };
  });
}
