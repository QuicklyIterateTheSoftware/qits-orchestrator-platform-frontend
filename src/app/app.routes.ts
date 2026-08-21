import type { Routes } from '@angular/router';
import { QitsMainLayout } from '@qits/ui-components';
import { NotFound } from './not-found/not-found';

/**
 * Two doors, both inside the platform chrome.
 *
 * **`QitsMainLayout` is the root route component** — the platform's convention, stated in the
 * component's own docs. Mounted this way the bar and the navigation mount once and survive every
 * navigation beneath them; wrapping each page in a tag would rebuild the whole skeleton on every
 * hop. It is an eager import for that reason: it is not a page, it is the frame the pages arrive
 * in, and a frame that loaded in its own chunk would show a blank application while it did.
 *
 * **The landing page is a page, not a `redirectTo`.** Where `/` goes depends on an answer from the
 * service — one process means go straight to it, more than one means choose — and a redirect cannot
 * ask. So `''` renders a component that reads the list and then either forwards or draws it, which
 * is also the only place that can say "the service could not be reached" instead of bouncing to a
 * URL that will fail the same way.
 *
 * **The path shape repeats the API's, noun for noun.** `/orchestrator/processes/gc` is the page for
 * what `GET /orchestrator/api/processes/gc/runs` answers. A bare kind under the base href would
 * have read better once and then swallowed every future top-level route.
 *
 * **A run is not its own address, and that is a decision.** A run belongs to a process and is only
 * ever read beside that process's run list, so the selected run is state on the process page rather
 * than a segment. It is the one thing here that a deep link cannot carry, and the cost is paid
 * knowingly: an operator sharing "look at this run" shares the process page, which opens on the
 * newest run — which is the one they meant nine times out of ten.
 */
export const routes: Routes = [
  {
    path: '',
    component: QitsMainLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./processes/processes-page').then((m) => m.ProcessesPage),
      },
      {
        path: 'processes/:kind',
        loadComponent: () => import('./processes/process-page').then((m) => m.ProcessPage),
      },
      { path: '**', component: NotFound },
    ],
  },
];
