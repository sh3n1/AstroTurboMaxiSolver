import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AppState } from '../app-state.service';
import { formatDec, formatRa } from '../astronomy/astronomy';
import { RemoteService } from '../remote/remote.service';
import { SensorService } from '../sensors/sensor.service';
import type { ViewMode } from '../sky-map/sky-style';

/**
 * The sky map's readout, in its top left corner: where the telescope points, how wide the
 * view is, and the few warnings worth a line there. The sky page places it and gives it its
 * box: this is only what it says.
 */
@Component({
  selector: 'app-pointing-readout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, DecimalPipe],
  styles: `
    /* A warning, such as the finder phone's sensors being off. */
    .warn {
      color: var(--ion-color-warning);
      font-weight: 600;
    }
  `,
  template: `
    <!-- The sensor button shows whether sensors are on, so only a missing compass is worth a line. -->
    @if (state.sensorsActive() && !sensors.hasCompass()) {
      {{ 'readout.noCompass' | translate }}<br />
    }
    <!-- On a screen phone, the finder's position only follows the telescope while its sensors run. -->
    @if (state.remoteFinder() && !remote.finderSteering()) {
      <span class="warn" data-testid="finder-sensors-off">{{ 'readout.finderSensorsOff' | translate }}</span
      ><br />
    }
    {{
      'readout.altAz'
        | translate
          : { alt: (state.pointing().altDeg | number: '1.0-0'), az: (state.pointing().azDeg | number: '1.0-0') }
    }}<br />
    <!-- Hidden unless chosen in Settings, since most observers steer by the map, not coordinates. -->
    @if (state.settings().showEquatorial) {
      <span data-testid="equatorial">{{ 'readout.raDec' | translate: { ra: pointingRa(), dec: pointingDec() } }}</span>
      <br />
    }
    @if (mode() === 'eyepiece') {
      {{
        'readout.eyepiece'
          | translate: { power: (power() | number: '1.0-0'), field: (eyepieceField() | number: '1.1-2') }
      }}
    } @else {
      {{ 'readout.field' | translate: { field: (fieldDeg() | number: '1.0-0') } }}
      @if (mode() === 'ring') {
        <br /><span data-testid="ring-readout">{{
          'readout.ring' | translate: { field: (eyepieceField() | number: '1.1-2'), power: (power() | number: '1.0-0') }
        }}</span>
      }
    }
  `,
})
export class PointingReadoutComponent {
  /** The view on show, and the sky map's width in degrees. */
  readonly mode = input.required<ViewMode>();
  readonly fieldDeg = input.required<number>();

  protected readonly state = inject(AppState);
  protected readonly sensors = inject(SensorService);
  protected readonly remote = inject(RemoteService);
  protected readonly power = this.state.power;
  protected readonly eyepieceField = this.state.trueField;
  protected readonly pointingRa = computed(() => formatRa(this.state.pointingEquatorial().raDeg));
  protected readonly pointingDec = computed(() => formatDec(this.state.pointingEquatorial().decDeg));
}
