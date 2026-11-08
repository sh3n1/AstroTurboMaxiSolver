import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { ScreenWakeService } from './core/screen-wake.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {
    // Starts keeping the screen on, following the setting, for the whole app.
    inject(ScreenWakeService);
  }
}
