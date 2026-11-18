import { isDevMode } from '@angular/core';
import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'tabs',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'sky', loadComponent: () => import('./pages/sky.page').then((m) => m.SkyPage) },
      { path: 'lists', loadComponent: () => import('./pages/lists.page').then((m) => m.ListsPage) },
      // Searching every target is part of Lists: it is the longest list of all.
      { path: 'lists/search', loadComponent: () => import('./pages/targets.page').then((m) => m.TargetsPage) },
      // The Targets tab became the search in Lists.
      { path: 'targets', redirectTo: 'lists/search', pathMatch: 'full' },
      {
        path: 'lists/catalogues',
        loadComponent: () => import('./pages/catalogues.page').then((m) => m.CataloguesPage),
      },
      // A catalogue split into lists, such as the RASC Finest NGC by season, on the same page.
      {
        path: 'lists/catalogues/:group',
        loadComponent: () => import('./pages/catalogues.page').then((m) => m.CataloguesPage),
      },
      { path: 'lists/log', loadComponent: () => import('./pages/log.page').then((m) => m.LogPage) },
      { path: 'lists/:id', loadComponent: () => import('./pages/list.page').then((m) => m.ListPage) },
      // The Lists tab replaced the session plan.
      { path: 'plan', redirectTo: 'lists', pathMatch: 'full' },
      { path: 'settings', loadComponent: () => import('./pages/settings.page').then((m) => m.SettingsPage) },
      // Parts of Settings on pages of their own, with a back arrow.
      {
        path: 'settings/equipment',
        loadComponent: () => import('./pages/equipment.page').then((m) => m.EquipmentPage),
      },
      { path: 'settings/credits', loadComponent: () => import('./pages/credits.page').then((m) => m.CreditsPage) },
      { path: '', redirectTo: 'sky', pathMatch: 'full' },
    ],
  },
  // For developing the app only: a published version has no device test, and its address
  // goes to the map like any other unknown one.
  {
    path: 'device-test',
    canMatch: [(): boolean => isDevMode()],
    loadComponent: () => import('./pages/device-test.page').then((m) => m.DeviceTestPage),
  },
  { path: 'align', loadComponent: () => import('./pages/align.page').then((m) => m.AlignPage) },
  { path: 'remote', loadComponent: () => import('./pages/remote.page').then((m) => m.RemotePage) },
  { path: '', redirectTo: 'tabs/sky', pathMatch: 'full' },
  // Anything else, such as an old link or the device test in a published version: the map.
  { path: '**', redirectTo: 'tabs/sky' },
];
