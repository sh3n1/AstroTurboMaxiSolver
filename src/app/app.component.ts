import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { InstallService } from './core/install.service';
import { ScreenWakeService } from './core/screen-wake.service';
import { LinkSyncService } from './core/sync/link-sync.service';
import { UpdateService } from './core/update.service';

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
  }
}
