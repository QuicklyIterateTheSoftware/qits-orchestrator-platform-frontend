import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { QitsBadge, QitsButton } from '@qits/ui-components';
import { OrchestratorApi } from '../api/orchestrator-api';
import { ProcessCatalog } from '../api/process-catalog';
import { isTerminal, type ProcessDto, type RunDto, type RunSummaryDto } from '../api/dto';
import { FlowBoard } from '../board/flow-board';
import { StepDetail } from '../board/step-detail';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { NONE, formatInstant, plural } from '../ui/format';
import {
  IDLE,
  LOADING,
  describeError,
  failed,
  ready,
  statusOf,
  type Loadable,
} from '../ui/loadable';
import { QITS_SCHEDULER } from '../ui/scheduler';
import { StatusBadge } from '../ui/status-badge';

/**
 * How often a RUNNING run is re-read.
 *
 * Two seconds, and it is affordable here in a way it is not on the CI run page: a gc run is nine
 * steps and the poll's weight is one stored response body per finished step, not a growing log.
 * The number is in the contract's UX section, so it is spelled here once and exported for the spec
 * that drives the clock by it.
 */
export const POLL_INTERVAL_MS = 2000;

/**
 * One technical process: what it is, what it has done, and what the run on screen is doing now.
 *
 * **The two buttons are the only write on this platform's UI that starts platform work.** `Run now`
 * deletes things; `Dry run` does everything except that, and is how a plan is reviewed before it is
 * executed. Neither is disabled while a run is active, on purpose: the service holds that rule —
 * one run of a kind at a time — and it answers 409, which this page reports as a sentence. A button
 * greyed out by the client would be a second copy of the rule, and the two would disagree the
 * moment a run finished between a render and a click.
 *
 * **The selected run defaults to the newest and is not an address.** `currentRunId` is the
 * explicitly picked run *or* the first row the service sent; picking a row sets the first half, and
 * a new run started from here selects itself. A run is only ever read beside its process's list, so
 * it is state here rather than a route segment — noted in `app.routes.ts` as the one thing a deep
 * link cannot carry.
 *
 * **A failed poll leaves the last good run on screen.** It is still the last thing the server said,
 * and blanking a board because one request out of a hundred timed out would lose more than it
 * tells.
 */
@Component({
  selector: 'app-process-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, FlowBoard, QitsBadge, QitsButton, StatusBadge, StepDetail],
  styleUrls: ['../ui/page.css', './process-page.css'],
  templateUrl: './process-page.html',
})
export class ProcessPage {
  private readonly api = inject(OrchestratorApi);
  private readonly catalog = inject(ProcessCatalog);
  private readonly route = inject(ActivatedRoute);
  private readonly scheduler = inject(QITS_SCHEDULER);

  protected readonly none = NONE;

  private readonly params = toSignal(this.route.paramMap, { initialValue: convertToParamMap({}) });

  /** The process this page is about, straight out of the URL. */
  protected readonly kind = computed(() => this.params().get('kind') ?? '');

  protected readonly processState = signal<Loadable<ProcessDto | null>>(LOADING);
  protected readonly runsState = signal<Loadable<readonly RunSummaryDto[]>>(LOADING);
  protected readonly runState = signal<Loadable<RunDto>>(IDLE);

  /** The run an operator picked, or nothing — in which case the newest run is shown. */
  private readonly pickedRunId = signal<string | null>(null);
  protected readonly selectedStepId = signal<string | null>(null);

  protected readonly starting = signal(false);
  /** What came of pressing a button when it was not simply accepted — a 409, or a failure. */
  protected readonly startNote = signal('');
  /** A poll that did not answer, reported beside the run rather than replacing it. */
  protected readonly pollProblem = signal('');

  private stopPolling: (() => void) | null = null;
  private inFlight = false;
  private loadedRunId: string | null = null;

  protected readonly runs = computed(() => {
    const state = this.runsState();
    return state.kind === 'ready' ? state.value : [];
  });

  protected readonly caption = computed(() => plural(this.runs().length, 'run'));

  /** The run on screen: the picked one, or the newest the service listed. */
  protected readonly currentRunId = computed(
    () => this.pickedRunId() ?? this.runs()[0]?.id ?? null,
  );

  protected readonly run = computed(() => {
    const state = this.runState();
    return state.kind === 'ready' ? state.value : null;
  });

  protected readonly process = computed(() => {
    const state = this.processState();
    return state.kind === 'ready' ? state.value : null;
  });

  /** The process's name once it is known, and the kind from the URL until then. */
  protected readonly title = computed(() => this.process()?.name ?? this.kind());

  protected readonly description = computed(() => this.process()?.description ?? '');

  protected readonly selectedStep = computed(() => {
    const run = this.run();
    const stepId = this.selectedStepId();
    return run && stepId ? (run.steps.find((step) => step.id === stepId) ?? null) : null;
  });

  constructor() {
    // The kind comes from the URL, so a navigation between two processes must reset everything the
    // old one owned — including which run was picked, which belongs to a list this page is about to
    // throw away.
    effect(() => {
      const kind = this.kind();
      untracked(() => {
        this.reset();
        if (kind) {
          this.loadProcess();
          void this.loadRuns();
        }
      });
    });

    // Which run to read is derived from two things that both change under this page: the pick, and
    // the list the service answered. Deriving it means a fresh listing that puts a newer run first
    // moves the board to it, and a pick pins it there.
    effect(() => {
      const runId = this.currentRunId();
      untracked(() => this.openRun(runId));
    });

    inject(DestroyRef).onDestroy(() => this.stopPoll());
  }

  protected instant(iso: string | null): string {
    return formatInstant(iso);
  }

  /** The process definition — its name and description, and nothing the run list already carries. */
  protected loadProcess(): void {
    const kind = this.kind();
    this.processState.set(LOADING);
    this.catalog.processes().then(
      (processes) =>
        this.processState.set(ready(processes.find((process) => process.kind === kind) ?? null)),
      (error: unknown) => this.processState.set(failed(error)),
    );
  }

  /** The run list, re-read after every write and whenever a run reaches a terminal status. */
  protected async loadRuns(): Promise<void> {
    const kind = this.kind();
    if (this.runsState().kind !== 'ready') {
      this.runsState.set(LOADING);
    }
    try {
      this.runsState.set(ready(await this.api.runs(kind)));
    } catch (error) {
      this.runsState.set(failed(error));
    }
  }

  /** The retry beside the run: re-issue the read for the run already on screen. */
  protected reloadRun(): void {
    this.loadedRunId = null;
    this.openRun(this.currentRunId());
  }

  protected selectRun(runId: string): void {
    this.pickedRunId.set(runId);
    this.selectedStepId.set(null);
  }

  /** Clicking the chosen card again closes the panel — the second click of a toggle. */
  protected selectStep(stepId: string): void {
    this.selectedStepId.update((current) => (current === stepId ? null : stepId));
  }

  /**
   * Start a run, dry or real.
   *
   * A 409 is the service saying a run of this kind is already active. That is not an error to
   * report as a failure: it is the rule working, and the useful response is to say so and put the
   * active run on screen — which the reloaded list does, because it is the newest one.
   */
  protected async start(dryRun: boolean): Promise<void> {
    if (this.starting()) {
      return;
    }
    this.starting.set(true);
    this.startNote.set('');
    try {
      const started = await this.api.startRun(this.kind(), dryRun);
      this.pickedRunId.set(started.id);
      this.selectedStepId.set(null);
      await this.loadRuns();
    } catch (error) {
      if (statusOf(error) === 409) {
        this.startNote.set(
          'Not started: a run is already active for this process. It is the one shown below.',
        );
        this.pickedRunId.set(null);
        await this.loadRuns();
      } else {
        this.startNote.set(`Could not start a run — ${describeError(error)}.`);
      }
    } finally {
      this.starting.set(false);
    }
  }

  private reset(): void {
    this.stopPoll();
    this.pickedRunId.set(null);
    this.selectedStepId.set(null);
    this.startNote.set('');
    this.pollProblem.set('');
    this.runsState.set(LOADING);
    this.runState.set(IDLE);
    this.loadedRunId = null;
  }

  private openRun(runId: string | null): void {
    if (runId === this.loadedRunId) {
      return;
    }
    this.loadedRunId = runId;
    this.stopPoll();
    this.pollProblem.set('');
    if (!runId) {
      this.runState.set(IDLE);
      return;
    }
    this.runState.set(LOADING);
    this.api.run(runId).then(
      (run) => this.accept(run),
      (error: unknown) => this.runState.set(failed(error)),
    );
  }

  /**
   * One poll. It re-reads only the run: the listing changes at most once per run, when it stops, so
   * it is re-read then rather than every two seconds.
   */
  private async poll(): Promise<void> {
    const runId = this.loadedRunId;
    if (this.inFlight || !runId) {
      return;
    }
    this.inFlight = true;
    try {
      const run = await this.api.run(runId);
      const stopped = isTerminal(run.status);
      this.accept(run);
      this.pollProblem.set('');
      if (stopped) {
        await this.loadRuns();
      }
    } catch (error) {
      this.pollProblem.set(describeError(error));
    } finally {
      this.inFlight = false;
      this.syncPolling();
    }
  }

  private accept(run: RunDto): void {
    this.runState.set(ready(run));
    this.syncPolling();
  }

  /**
   * Poll while the run on screen is RUNNING, and stop for good when it is not. A terminal run is
   * already complete — every step has its outcome written — so there is nothing a further read
   * could add.
   */
  private syncPolling(): void {
    if (this.run()?.status === 'RUNNING') {
      this.stopPolling ??= this.scheduler.every(POLL_INTERVAL_MS, () => void this.poll());
    } else {
      this.stopPoll();
    }
  }

  private stopPoll(): void {
    this.stopPolling?.();
    this.stopPolling = null;
  }
}
