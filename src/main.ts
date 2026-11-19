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
import { provideI18n } from './app/core/i18n/i18n';
import { ListsService } from './app/core/lists/lists.service';
import { ObservingLogService } from './app/core/log/observing-log.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    // The texts on screen, in the user's language: see core/i18n/i18n.ts.
    provideI18n(),
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
