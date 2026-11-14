import { inject, isDevMode, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  RouteReuseStrategy,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { AppState } from './app/core/app-state.service';
import { ListsService } from './app/core/lists.service';
import { ObservingLogService } from './app/core/observing-log.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    // The kit, log and lists are read from the device's database before the first page
    // shows, so no page ever shows them empty for a moment. It takes a few milliseconds.
    provideAppInitializer(() =>
      Promise.all([inject(AppState).kitReady, inject(ObservingLogService).ready, inject(ListsService).ready]),
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
});
