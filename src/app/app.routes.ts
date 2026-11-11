import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'tabs',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'sky', loadComponent: () => import('./pages/sky.page').then((m) => m.SkyPage) },
      { path: 'targets', loadComponent: () => import('./pages/targets.page').then((m) => m.TargetsPage) },
      { path: 'lists', loadComponent: () => import('./pages/lists.page').then((m) => m.ListsPage) },
      {
        path: 'lists/catalogues',
        loadComponent: () => import('./pages/catalogues.page').then((m) => m.CataloguesPage),
      },
      // A catalogue split into lists, such as the RASC Finest NGC by season, on the same page.
      {
        path: 'lists/catalogues/:group',
        loadComponent: () => import('./pages/catalogues.page').then((m) => m.CataloguesPage),
      },
      { path: 'lists/:id', loadComponent: () => import('./pages/list.page').then((m) => m.ListPage) },
      // The Bookmarks tab replaced the session plan.
      { path: 'plan', redirectTo: 'lists', pathMatch: 'full' },
      { path: 'settings', loadComponent: () => import('./pages/settings.page').then((m) => m.SettingsPage) },
      { path: '', redirectTo: 'sky', pathMatch: 'full' },
    ],
  },
  { path: 'device-test', loadComponent: () => import('./pages/device-test.page').then((m) => m.DeviceTestPage) },
  { path: 'align', loadComponent: () => import('./pages/align.page').then((m) => m.AlignPage) },
  { path: '', redirectTo: 'tabs/sky', pathMatch: 'full' },
];
