import { Injectable, inject } from '@angular/core';
import type { ProcessDto } from './dto';
import { OrchestratorApi } from './orchestrator-api';

/**
 * The process list, asked for once per tab.
 *
 * Three things need it — the sub-menu picker, the landing page's redirect, and the process page's
 * heading — and they are alive at the same moment, so a plain call in each would be three identical
 * requests on every navigation. The list is a *definition*: it changes when the service is
 * redeployed and not otherwise, so caching it for the life of the tab costs nothing in freshness.
 *
 * **A failed read is not cached.** Leaving a rejected promise in the field would make one 503
 * permanent for the whole session, and every retry button on the page would re-report an error that
 * is no longer happening.
 */
@Injectable({ providedIn: 'root' })
export class ProcessCatalog {
  private readonly api = inject(OrchestratorApi);
  private pending: Promise<readonly ProcessDto[]> | null = null;

  processes(): Promise<readonly ProcessDto[]> {
    this.pending ??= this.api.processes().catch((error: unknown) => {
      this.pending = null;
      throw error;
    });
    return this.pending;
  }
}
