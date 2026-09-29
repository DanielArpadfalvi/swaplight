import { Routes } from '@angular/router';

/**
 * Bekötés a meglévő app routingjába, pl.:
 *   { path: 'projektinditas', loadChildren: () => import('./project-kickoff/project-kickoff.routes').then(m => m.PROJECT_KICKOFF_ROUTES) }
 */
export const PROJECT_KICKOFF_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./project-kickoff-list.component').then((m) => m.ProjectKickoffListComponent),
    title: 'Projektindítások',
  },
  {
    path: 'uj',
    loadComponent: () => import('./project-kickoff-form.component').then((m) => m.ProjectKickoffFormComponent),
    title: 'Új projekt indítása',
  },
  {
    path: ':id',
    loadComponent: () => import('./project-kickoff-status.component').then((m) => m.ProjectKickoffStatusComponent),
    title: 'Projektindítás állapota',
  },
];
