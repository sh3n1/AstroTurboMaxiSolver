import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { startFieldTest } from './core/dev-tools/field-test';
import { InstallService } from './core/platform/install.service';
import { ScreenWakeService } from './core/platform/screen-wake.service';
import { UpdateService } from './core/platform/update.service';
import { SensorService } from './core/sensors/sensor.service';
import { SkyBrightnessService } from './core/sky-conditions/sky-brightness.service';
import { LinkSyncService } from './core/sync/link-sync.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {
    // Starts keeping the screen on, following the setting, for the whole app.
    inject(ScreenWakeService);
    // Listens from the start for the browser's offer to install, which comes early.
    inject(InstallService);
    // Listens from the start for a new version, which the service worker finds on opening.
    inject(UpdateService);
    // Listens for a linked phone's data, for link sync, whenever two phones link.
    inject(LinkSyncService);
    // Sets the Bortle class from the location, while Auto is on, wherever the location is set.
    inject(SkyBrightnessService);
    // The sensors come back on if they were on when the app closed, as after a reload.
    inject(SensorService).resumeIfWereOn();
    // In development, records field tests while the laptop's collector answers. Not in a
    // production build, which swaps in an empty field-test.prod.ts.
    startFieldTest();
  }
}
