import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QITS_API_BASE } from './api-base';
import type { ProcessDto, RunDto, RunSummaryDto, StartedRunDto } from './dto';

/**
 * Everything this app says to qits-platform-orchestrator, through the edge, at `/orchestrator/api`.
 *
 * **Three reads and one write, and the write is the point of the application.** Starting a run is
 * the one thing an operator can do here that nothing else on the platform offers: the scheduler
 * runs `gc` at 03:40 and this button is how it is run at any other moment, dry or for real.
 *
 * **Every path is relative.** The SPA is served at `/orchestrator/` by the service itself, behind
 * the edge that serves `/orchestrator/api/…`, so a same-origin absolute path is what lets the
 * browser's session cookie reach the service. A configured origin would move every call
 * cross-origin, leave the cookie behind, and answer 401 with nothing on screen to explain it.
 *
 * **Failures are thrown, not described.** An `HttpErrorResponse` reaching a caller still holds the
 * service's `{"message": …}` body; `ui/loadable.ts` is the one place that body is read.
 */
@Injectable({ providedIn: 'root' })
export class OrchestratorApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(QITS_API_BASE);

  /** Every technical process this service knows, with the step graph each one will run. */
  processes(): Promise<readonly ProcessDto[]> {
    return firstValueFrom(this.http.get<ProcessDto[]>(`${this.base}/orchestrator/api/processes`));
  }

  /**
   * One process's recent runs, newest first.
   *
   * The order is the SERVICE's and is not re-sorted here: a client sorting by `startedAt` would
   * disagree with it the moment two runs share an instant, and the list would reorder itself under
   * the reader's cursor on the next poll.
   */
  runs(kind: string, limit = 20): Promise<readonly RunSummaryDto[]> {
    return firstValueFrom(
      this.http.get<RunSummaryDto[]>(`${this.runsUrl(kind)}`, {
        params: new HttpParams().set('limit', limit),
      }),
    );
  }

  /**
   * Start a run. 202, not 200: the run has been *accepted*, not finished, and the caller re-reads
   * it for anything else.
   *
   * A 409 means a run of this kind is already active — the service's own guard, and the same one
   * the scheduler obeys. It reaches the caller as an `HttpErrorResponse`, because "already running"
   * is a sentence for the operator rather than a failure to swallow.
   */
  startRun(kind: string, dryRun: boolean): Promise<StartedRunDto> {
    return firstValueFrom(this.http.post<StartedRunDto>(this.runsUrl(kind), { dryRun }));
  }

  /** One run with its steps — the board's whole source, and what the poll re-reads. */
  run(runId: string): Promise<RunDto> {
    return firstValueFrom(
      this.http.get<RunDto>(`${this.base}/orchestrator/api/runs/${encodeURIComponent(runId)}`),
    );
  }

  private runsUrl(kind: string): string {
    return `${this.base}/orchestrator/api/processes/${encodeURIComponent(kind)}/runs`;
  }
}
