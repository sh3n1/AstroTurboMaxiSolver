import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  colorPaletteOutline,
  contrastOutline,
  ellipseOutline,
  ellipsisHorizontalOutline,
  globeOutline,
  pricetagOutline,
  resizeOutline,
  sparklesOutline,
  starOutline,
  sunnyOutline,
} from 'ionicons/icons';

import { AppState } from './app-state.service';
import { compassShort, formatDec, formatRa, magnification, sunAltitudeDeg, trueFieldDeg } from './astronomy';
import type { BodyFacts } from './body-facts';
import { bodyFacts, discText, distanceText, lightTimeText } from './body-facts';
import { designations } from './designations';
import { arcsecText, pairBv, pairRelation, splitAdvice } from './double-stars';
import { LocalTimePipe } from './local-time.pipe';
import { SKY_SHADE_COLOURS } from './planning-time';
import {
  constellationName,
  equatorialSeparationDeg,
  eyepieceFit,
  moonNote,
  objectTypeText,
  otherNames,
  sizeText,
  starColourName,
} from './target-details';
import { iconDataUrl, targetIcon } from './target-icons';
import type { Target, TargetKind } from './targets';
import { tonight, tonightChart } from './tonight';

const TIME = new LocalTimePipe();
/** The Tonight chart's size, in its own units: it stretches to the panel's width. */
const CHART_WIDTH = 336;
const CHART_TOP = 6;
const CHART_HORIZON = 50;

/** Standard icons for the kinds without one of AstroFinder's own, as in the lists. */
const KIND_ICONS: Partial<Record<TargetKind, string>> = {
  Other: 'ellipsis-horizontal-outline',
  'Open cluster': 'sparkles-outline',
  'Globular cluster': 'ellipse-outline',
  Star: 'star-outline',
};

/**
 * The details of the selected target, shown under its name on the sky map. Mostly
 * pictures: chips with small icons for the facts, a chart of its height through the
 * night over the sky's own colours, and chips for how it looks in the eyepiece, the Moon,
 * and where to face. Short text, so it reads at arm's length, and compact, so the map
 * stays in view.
 */
@Component({
  selector: 'app-target-details',
  imports: [DecimalPipe, IonIcon, LocalTimePipe],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 6px 8px 2px 0;
      border-top: 1px solid #232a3d;
      font-size: calc(13px * var(--af-scale, 1));
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    /* A long chip, such as the Moon's next phases, wraps inside itself rather than overflowing. */
    .chip {
      display: inline-flex;
      flex-wrap: wrap;
      max-width: 100%;
      box-sizing: border-box;
      align-items: center;
      gap: 4px;
      padding: 1px 8px 1px 5px;
      border: 1px solid #2a3350;
      border-radius: 12px;
      color: var(--af-text);
      line-height: 1.5;
    }
    .chip ion-icon,
    .chip svg {
      flex: none;
      width: 1.3em;
      height: 1.3em;
      color: var(--ion-color-primary);
    }
    .quiet {
      color: var(--af-muted);
    }
    .quiet ion-icon {
      color: var(--af-muted);
    }
    .good {
      color: var(--ion-color-success);
    }
    /* The same amber as the app's other warnings. */
    .warn {
      color: #ffb454;
    }
    .tonight {
      border: 1px solid #2a3350;
      border-radius: 10px;
      padding: 3px 8px 0;
    }
    .tonight-head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .tonight-head strong {
      font-size: calc(14px * var(--af-scale, 1));
    }
    .tonight svg {
      display: block;
      width: 100%;
      height: auto;
    }
    /* Each part of a chip's text wraps as a whole, never in the middle. */
    .keep {
      white-space: nowrap;
    }
  `,
  template: `
    @let target = this.target();
    @let facts = this.facts();

    <!-- What it is, where among the stars, how bright and how big. -->
    <div class="chips">
      <span class="chip" data-testid="details-type">
        @if (typeIcon(); as icon) {
          <ion-icon aria-hidden="true" [src]="icon"></ion-icon>
        } @else {
          <ion-icon aria-hidden="true" [name]="kindIcons[target.kind] ?? 'ellipse-outline'"></ion-icon>
        }
        {{ type() }}
      </span>
      @if (constellation(); as name) {
        <span class="chip" data-testid="details-constellation">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M4 18l6-8 5 4 5-9" />
          </svg>
          {{ name }}
        </span>
      }
      @if (magnitudeText(); as mag) {
        <span class="chip"><ion-icon name="star-outline" aria-hidden="true"></ion-icon>{{ mag }}</span>
      }
      @if (facts) {
        <span class="chip"
          ><ion-icon name="resize-outline" aria-hidden="true"></ion-icon>disc {{ discText(facts.discArcsec) }}</span
        >
      } @else if (size(); as size) {
        <span class="chip"><ion-icon name="resize-outline" aria-hidden="true"></ion-icon>{{ size }}</span>
      }
    </div>

    <!-- Its height through the night, over the sky's colours from the time control. -->
    @let night = this.night();
    <div class="tonight">
      <div class="tonight-head">
        <span>
          <strong>Tonight</strong>
          @if (night.peak; as peak) {
            <span data-testid="details-highest"> · {{ peak.text }}</span>
          }
        </span>
        <span data-testid="details-pass" [class.good]="night.status.good" [class.warn]="!night.status.good">{{
          night.status.text
        }}</span>
      </div>
      <svg
        [attr.viewBox]="'0 0 ' + chartWidth + ' 74'"
        role="img"
        data-testid="tonight-chart"
        [attr.aria-label]="night.label"
      >
        @for (band of night.chart.bands; track band.x) {
          <rect [attr.x]="band.x" y="0" [attr.width]="band.width" height="52" [attr.fill]="shadeColours[band.shade]" />
        }
        <line
          x1="0"
          [attr.y1]="night.chart.goodY"
          [attr.x2]="chartWidth"
          [attr.y2]="night.chart.goodY"
          stroke="var(--af-muted)"
          stroke-dasharray="3 4"
          opacity="0.6"
        />
        <line x1="0" y1="50" [attr.x2]="chartWidth" y2="50" stroke="var(--af-muted)" opacity="0.6" />
        <polygon [attr.points]="night.chart.area" fill="var(--ion-color-primary)" fill-opacity="0.18" />
        <polyline
          [attr.points]="night.chart.line"
          fill="none"
          stroke="var(--af-text)"
          stroke-width="1.8"
          stroke-linejoin="round"
        />
        @if (night.chart.now; as now) {
          <line [attr.x1]="now.x" y1="0" [attr.x2]="now.x" y2="52" stroke="var(--ion-color-primary)" stroke-width="2" />
          <circle [attr.cx]="now.x" [attr.cy]="now.y" r="3.5" fill="var(--ion-color-primary)" />
        }
        @if (night.peak; as peak) {
          <circle [attr.cx]="peak.x" [attr.cy]="peak.y" r="3" fill="var(--af-text)" />
        }
        <text
          [attr.x]="chartWidth - 4"
          [attr.y]="night.chart.goodY - 3"
          text-anchor="end"
          font-size="13"
          fill="var(--af-muted)"
          stroke="#0a0e1a"
          stroke-width="3"
          paint-order="stroke"
        >
          30°
        </text>
        @if (night.chart.best; as best) {
          <rect
            [attr.x]="best.x"
            y="54"
            [attr.width]="best.width"
            height="3"
            rx="1.5"
            fill="var(--ion-color-success)"
          />
        }
        @for (hour of night.chart.hours; track hour.x; let first = $first) {
          <text
            [attr.x]="hour.x"
            y="72"
            [attr.text-anchor]="first ? 'start' : 'middle'"
            font-size="13"
            fill="var(--af-muted)"
          >
            {{ hour.label }}
          </text>
        }
      </svg>
    </div>

    <!-- At the eyepiece: how it fits the view, the pairs of a double, and for the Moon and planets their light and distance. -->
    <div class="chips">
      @if (eyepiece(); as view) {
        <span class="chip" data-testid="details-eyepiece" [attr.title]="view.title">
          <svg viewBox="0 0 84 84" aria-hidden="true">
            <defs>
              <clipPath [attr.id]="clipId"><circle cx="42" cy="42" r="40" /></clipPath>
            </defs>
            <circle cx="42" cy="42" r="40" [attr.fill]="shadeColours.night" />
            <g [attr.clip-path]="'url(#' + clipId + ')'">
              <ellipse
                cx="42"
                cy="42"
                [attr.rx]="view.rx"
                [attr.ry]="view.ry"
                transform="rotate(-35 42 42)"
                fill="var(--af-text)"
                fill-opacity="0.85"
              />
            </g>
            <circle cx="42" cy="42" r="40" fill="none" stroke="var(--af-muted)" stroke-width="6" />
          </svg>
          {{ view.text }}
        </span>
      }
      @if (double(); as double) {
        @for (pair of double.pairs; track pair.components) {
          <span class="chip" data-testid="details-pair" [attr.title]="pair.title">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <circle
                cx="20"
                cy="20"
                r="18"
                [attr.fill]="shadeColours.night"
                stroke="var(--af-muted)"
                stroke-width="3"
              />
              <path d="M20 2v6" stroke="var(--af-muted)" stroke-width="3" />
              <circle [attr.cx]="pair.main.x" [attr.cy]="pair.main.y" r="5.5" fill="var(--af-text)" />
              <circle [attr.cx]="pair.companion.x" [attr.cy]="pair.companion.y" r="3.5" fill="var(--af-text)" />
            </svg>
            <span class="keep">{{ pair.components }} {{ pair.sep }} apart at {{ pair.paDeg }}°</span>
            @if (pair.relation; as relation) {
              · <span class="keep">{{ relation }}</span>
            }
          </span>
        }
        <span class="chip" data-testid="details-split" [attr.title]="double.split.text">
          <svg viewBox="0 0 40 20" aria-hidden="true">
            <rect x="1" y="7" width="38" height="6" rx="3" [attr.fill]="shadeColours.astronomical" />
            <line x1="8" y1="2" x2="8" y2="18" stroke="var(--af-muted)" stroke-width="2.5" />
            <circle
              [attr.cx]="double.split.splits ? 33 : 5"
              cy="10"
              r="5"
              [attr.fill]="double.split.splits ? 'var(--ion-color-success)' : '#ffb454'"
            />
          </svg>
          <span [class.good]="double.split.splits" [class.warn]="!double.split.splits">{{ double.split.short }}</span>
          · limit {{ double.split.limit }}
        </span>
      }
      @if (facts) {
        <span class="chip" data-testid="details-distance">
          <svg viewBox="0 0 40 20" aria-hidden="true">
            <circle cx="5" cy="10" r="4.5" fill="#ffd36b" />
            <circle cx="13" cy="10" r="2.2" fill="var(--ion-color-primary)" />
            <line x1="17" y1="10" x2="31" y2="10" stroke="var(--af-muted)" stroke-width="2" stroke-dasharray="2 3" />
            <circle cx="35.5" cy="10" r="3.5" fill="var(--af-text)" />
          </svg>
          <span class="keep">{{ distanceText(facts.distanceAu) }} away</span> ·
          <span class="keep">{{ lightTimeText(facts.lightSeconds) }}</span>
        </span>
        <span class="chip"
          ><ion-icon name="contrast-outline" aria-hidden="true"></ion-icon
          >{{ facts.litFraction * 100 | number: '1.0-0' }}% lit</span
        >
        @if (facts.moon; as moon) {
          <span class="chip" data-testid="details-moon-phase">
            <span class="keep">Age {{ moon.ageDays | number: '1.0-0' }} days</span>
            @for (event of moonEvents(moon); track event.name) {
              · <span class="keep">{{ event.name }} {{ event.date | localTime: 'date' }}</span>
            }
          </span>
        }
      }
      @if (moon(); as moon) {
        <span class="chip" data-testid="details-moon" [attr.title]="moon.text">
          @if (moon.icon) {
            <ion-icon aria-hidden="true" [src]="moon.icon"></ion-icon>
          }
          <span [class.good]="!moon.warn" [class.warn]="moon.warn">{{ moon.short }}</span>
          @if (moon.away) {
            · {{ moon.away }}
          }
        </span>
      }
      <span class="chip" data-testid="details-where">
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r="18" fill="none" stroke="var(--af-muted)" stroke-width="3" />
          <path d="M22 4v6" stroke="var(--af-muted)" stroke-width="3" />
          @if (where().up) {
            <line
              x1="22"
              y1="22"
              [attr.x2]="where().arrowX"
              [attr.y2]="where().arrowY"
              stroke="#a9cbff"
              stroke-width="4"
              stroke-linecap="round"
            />
          }
        </svg>
        {{ where().text }}
      </span>
    </div>

    <!-- The rest, quieter: where it is in coordinates, and other names. -->
    <div class="chips">
      <span class="chip quiet">
        <ion-icon name="globe-outline" aria-hidden="true"></ion-icon>
        <span class="keep">RA {{ formatRa(target.raDeg) }}</span> ·
        <span class="keep">Dec {{ formatDec(target.decDeg) }}</span>
      </span>
      @if (facts) {
        <span class="chip quiet"
          ><ion-icon name="sunny-outline" aria-hidden="true"></ion-icon>{{ facts.sunAngleDeg | number: '1.0-0' }}° from
          the Sun</span
        >
      }
      @if (double()?.colours; as colours) {
        <span class="chip quiet" data-testid="details-colours"
          ><ion-icon name="color-palette-outline" aria-hidden="true"></ion-icon>{{ colours }}</span
        >
      }
      @if (names(); as names) {
        <span class="chip quiet" data-testid="details-names"
          ><ion-icon name="pricetag-outline" aria-hidden="true"></ion-icon>{{ names }}</span
        >
      }
    </div>
  `,
})
export class TargetDetailsComponent {
  readonly target = input.required<Target>();

  private readonly state = inject(AppState);

  protected readonly chartWidth = CHART_WIDTH;
  protected readonly shadeColours = SKY_SHADE_COLOURS;
  protected readonly kindIcons = KIND_ICONS;
  protected readonly formatRa = formatRa;
  protected readonly formatDec = formatDec;
  protected readonly discText = discText;
  protected readonly distanceText = distanceText;
  protected readonly lightTimeText = lightTimeText;
  /** Each box needs its own clip, in case two are ever on screen. */
  protected readonly clipId = `eyepiece-${Math.random().toString(36).slice(2, 8)}`;

  constructor() {
    addIcons({
      colorPaletteOutline,
      contrastOutline,
      ellipseOutline,
      ellipsisHorizontalOutline,
      globeOutline,
      pricetagOutline,
      resizeOutline,
      sparklesOutline,
      starOutline,
      sunnyOutline,
    });
  }

  private readonly power = computed(() =>
    magnification(this.state.settings().telescopeFocalMm, this.state.settings().eyepieceFocalMm),
  );
  private readonly fieldDeg = computed(() => {
    const { telescopeFocalMm, eyepieceFocalMm, eyepieceFieldDeg } = this.state.settings();
    return trueFieldDeg(telescopeFocalMm, eyepieceFocalMm, eyepieceFieldDeg);
  });

  /** For the Moon and planets: distance, disc, light. They change with the minute clock. */
  protected readonly facts = computed(() => {
    const body = this.target().body;
    return body ? bodyFacts(body, this.state.now()) : null;
  });

  protected readonly type = computed(() => objectTypeText(this.target()));
  /** AstroFinder's own icon for the target, as in the lists, or null for a standard one. */
  protected readonly typeIcon = computed(() => {
    const paths = targetIcon(this.target());
    return paths ? iconDataUrl(paths) : null;
  });
  // A constellation is its own place in the sky, so "Orion · in Orion" would add nothing.
  protected readonly constellation = computed(() => {
    const target = this.target();
    return target.kind === 'Constellation' ? null : constellationName(target.raDeg, target.decDeg);
  });
  protected readonly size = computed(() => sizeText(this.target()));

  /** The magnitude, both stars' for a double, or null where it isn't known. */
  protected readonly magnitudeText = computed(() => {
    const target = this.target();
    const pair = target.double?.pairs[0];
    if (pair) return `mag ${pair.mag1.toFixed(1)} and ${pair.mag2.toFixed(1)}`;
    return target.mag < 90 ? `mag ${target.mag.toFixed(1)}` : null;
  });

  protected readonly names = computed(() => {
    const target = this.target();
    return otherNames(target.aliases, [...designations(target), target.name]) || null;
  });

  /**
   * Tonight: its height through the night, the chart's shapes, and a few words on when
   * to look. Worked out with the minute clock: about eighty height checks each time.
   */
  protected readonly night = computed(() => {
    const target = this.target();
    const now = this.state.now();
    const { latitudeDeg, longitudeDeg } = this.state.settings();
    const night = tonight(
      (time) => this.state.positionAt(target, time).altDeg,
      (time) => sunAltitudeDeg(time, latitudeDeg, longitudeDeg),
      now,
    );
    const chart = tonightChart(night, now, CHART_WIDTH, CHART_TOP, CHART_HORIZON);
    const hours = chart.hours.map((hour) => ({ ...hour, label: TIME.transform(hour.time) }));

    let status: { text: string; good: boolean };
    if (night.best)
      status = { text: `Best ${TIME.transform(night.best.from)}–${TIME.transform(night.best.until)}`, good: true };
    else if (!night.highest) status = { text: 'Not up tonight', good: false };
    else if (night.highest.altDeg < 30) status = { text: 'Low tonight', good: false };
    else status = { text: 'Only up in twilight', good: false };

    // The highest point's label sits beside it, on the side with room.
    const peak =
      chart.peak && night.highest
        ? {
            ...chart.peak,
            text: `${Math.round(night.highest.altDeg)}° at ${TIME.transform(night.highest.time)}`,
          }
        : null;
    const label = night.highest
      ? `Height through the night: highest ${peak?.text}. ${status.text}.`
      : 'Below the horizon all night.';
    return { chart: { ...chart, hours }, peak, status, label };
  });

  /** How the target fits the eyepiece's field, drawn to scale, or null without a size. */
  protected readonly eyepiece = computed(() => {
    const target = this.target();
    const facts = this.facts();
    const sizeArcmin = facts ? facts.discArcsec / 60 : target.sizeArcmin;
    if (!sizeArcmin) return null;
    const minorArcmin = facts ? sizeArcmin : (target.minorArcmin ?? sizeArcmin);
    const fit = eyepieceFit(sizeArcmin, this.fieldDeg() * 60);
    const power = Math.round(this.power());
    // The field is a circle of radius 40; anything larger than the clip just overfills it.
    const rx = Math.min(62, Math.max(2.5, fit.share * 40));
    return {
      text: `${fit.word} at ${power}×`,
      title: `Your eyepiece shows ${this.fieldDeg().toFixed(1)}° at ${power}×`,
      rx,
      ry: Math.max(2, (rx * minorArcmin) / sizeArcmin),
    };
  });

  /** A double star's pairs, drawn north up, and whether the telescope splits the closest. */
  protected readonly double = computed(() => {
    const target = this.target();
    const double = target.double;
    if (!double) return null;
    const { telescopeApertureMm } = this.state.settings();
    const [mainBv, companionBv] = pairBv(double.spectral);
    // A named star's own colour index is better than one from its spectral type.
    const [main, companion] = [target.bv ?? mainBv, companionBv].map((value) =>
      value === null || value === undefined ? null : starColourName(value),
    );
    const advice = splitAdvice(double.pairs[0], telescopeApertureMm, this.power());
    return {
      pairs: double.pairs.map((pair) => {
        // North up and east to the left, as the sky looks facing south: 16 units apart.
        const angle = (pair.paDeg * Math.PI) / 180;
        const [dx, dy] = [-Math.sin(angle) * 16, -Math.cos(angle) * 16];
        return {
          components: pair.components,
          sep: arcsecText(pair.sepArcsec),
          paDeg: pair.paDeg,
          relation: pairRelation(pair),
          title: `mag ${pair.mag1.toFixed(1)} and ${pair.mag2.toFixed(1)}`,
          main: { x: round(20 - dx / 2), y: round(20 - dy / 2) },
          companion: { x: round(20 + dx / 2), y: round(20 + dy / 2) },
        };
      }),
      colours: main && companion ? `${main} and ${companion.toLowerCase()}` : null,
      split: { ...advice, limit: arcsecText(advice.limitArcsec) },
    };
  });

  /** The Moon: its phase, how far from the target, and whether its glare gets in the way. */
  protected readonly moon = computed(() => {
    const target = this.target();
    if (target.body === 'Moon') return null;
    const moon = this.state.targets().find((t) => t.id === 'Moon');
    if (!moon) return null;
    const now = this.state.now();
    const separation = equatorialSeparationDeg(target, moon);
    const moonAlt = this.state.positionAt(moon, now).altDeg;
    const note = moonNote(separation, moonAlt, moon.phase?.litFraction ?? 0);
    const paths = targetIcon(moon);
    return {
      text: note.text,
      warn: note.warn,
      short: moonAlt <= 0 ? 'Moon down' : note.warn ? 'Bright Moon' : 'No glare',
      away: moonAlt <= 0 ? null : `${Math.round(separation)}°`,
      icon: paths ? iconDataUrl(paths) : null,
    };
  });

  /** Which way to face and how high: an arrow on a small compass, north up. */
  protected readonly where = computed(() => {
    const { altDeg, azDeg } = this.state.positionAt(this.target(), this.state.now());
    const az = (azDeg * Math.PI) / 180;
    return {
      up: altDeg > 0,
      text: altDeg > 0 ? `${compassShort(azDeg)}, ${Math.round(altDeg)}° up` : 'Below the horizon',
      arrowX: round(22 + 15 * Math.sin(az)),
      arrowY: round(22 - 15 * Math.cos(az)),
    };
  });

  /** The next full and new Moon, the sooner one first. */
  protected moonEvents(moon: NonNullable<BodyFacts['moon']>): { name: string; date: Date }[] {
    return [
      { name: 'full Moon', date: moon.nextFull },
      { name: 'new Moon', date: moon.nextNew },
    ].sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}

const round = (value: number): number => Math.round(value * 10) / 10;
