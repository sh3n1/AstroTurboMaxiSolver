import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'tabs',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'sky', loadComponent: () => import('./pages/sky.page').then((m) => m.SkyPage) },
      { path: 'targets', loadComponent: () => import('./pages/targets.page').then((m) => m.TargetsPage) },
      { path: 'plan', loadComponent: () => import('./pages/plan.page').then((m) => m.PlanPage) },
      { path: 'settings', loadComponent: () => import('./pages/settings.page').then((m) => m.SettingsPage) },
      { path: '', redirectTo: 'sky', pathMatch: 'full' },
    ],
  },
  { path: 'device-test', loadComponent: () => import('./pages/device-test.page').then((m) => m.DeviceTestPage) },
  { path: 'align', loadComponent: () => import('./pages/align.page').then((m) => m.AlignPage) },
  { path: '', redirectTo: 'tabs/sky', pathMatch: 'full' },
];
