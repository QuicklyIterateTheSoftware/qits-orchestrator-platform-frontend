import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsNavigationLinks } from '@qits/ui-components';
import type { ProcessDto, RunDto, RunStepDto, RunSummaryDto, StepStatus } from '../api/dto';
import { routes } from '../app.routes';
import { BoardMetrics, type BoardMeasurement } from '../board/metrics';
import type { Rect } from '../board/layout';
import { QITS_SCHEDULER, type QitsScheduler } from '../ui/scheduler';
import { POLL_INTERVAL_MS } from './process-page';

/** Rectangles the browser would have measured, so the wires are drawn from something real. */
@Injectable()
class StubMetrics extends BoardMetrics {
  override measure(): BoardMeasurement {
    const cards = new Map<string, Rect>([
      ['pins.ci', { x: 0, y: 0, width: 100, height: 40 }],
      ['artifacts.plan', { x: 200, y: 0, width: 100, height: 40 }],
    ]);
    return { width: 300, height: 100, cards };
  }

  override observe(): () => void {
    return () => undefined;
  }
}

/**
 * A clock the test moves by hand.
 *
 * The poll is the one behaviour on this page that is defined in seconds, and a spec that waited for
 * real ones would be slow and flaky in the same breath. `fire(ms)` runs the tasks registered at
 * that interval, so "one poll happened" is an exact statement — and `count(ms)` is how "polling
 * stopped" is asserted, which is otherwise invisible.
 */
class ManualScheduler implements QitsScheduler {
  private readonly tasks = new Map<number, { ms: number; fn: () => void }>();
  private nextId = 0;

  every(ms: number, fn: () => void): () => void {
    const id = this.nextId++;
    this.tasks.set(id, { ms, fn });
    return () => void this.tasks.delete(id);
  }

  now(): number {
    return Date.parse('2026-08-21T10:00:30Z');
  }

  count(ms: number): number {
    return Array.from(this.tasks.values()).filter((task) => task.ms === ms).length;
  }

  fire(ms: number): void {
    for (const task of Array.from(this.tasks.values())) {
      if (task.ms === ms) {
        task.fn();
      }
    }
  }
}

/**
 * The process page, one behaviour at a time.
 *
 * Driven through the router rather than by constructing the component, which is the house pattern:
 * the page is a lazy route and its own address is part of what it is.
 */
describe('ProcessPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let scheduler: ManualScheduler;

  const RUNS_URL = '/orchestrator/api/processes/gc/runs';

  const process: ProcessDto = {
    kind: 'gc',
    name: 'Garbage collection',
    description: 'The unified deletion run across the platform.',
    steps: [],
  };

  const step = (id: string, status: StepStatus, over: Partial<RunStepDto> = {}): RunStepDto => ({
    id,
    name: id,
    target: 'artifacts',
    dependsOn: [],
    status,
    startedAt: '2026-08-21T10:00:00Z',
    finishedAt: '2026-08-21T10:00:09Z',
    httpStatus: 200,
    request: { method: 'GET', url: 'http://dev-qits-ci:8080/ci/api/daemon' },
    response: { pins: [] },
    error: null,
    summary: `${id} summary`,
    ...over,
  });

  const summary = (over: Partial<RunSummaryDto> = {}): RunSummaryDto => ({
    id: 'run-1',
    kind: 'gc',
    trigger: 'manual',
    dryRun: false,
    status: 'SUCCEEDED',
    startedAt: '2026-08-21T10:00:00Z',
    finishedAt: '2026-08-21T10:01:00Z',
    summary: '12 images, 9.4 GB removed',
    ...over,
  });

  const run = (over: Partial<RunDto> = {}): RunDto => ({
    ...summary(),
    steps: [
      step('pins.ci', 'SUCCEEDED'),
      step('artifacts.plan', 'PENDING', { dependsOn: ['pins.ci'] }),
    ],
    ...over,
  });

  beforeEach(() => {
    scheduler = new ManualScheduler();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideQitsNavigationLinks([]),
        { provide: BoardMetrics, useClass: StubMetrics },
        { provide: QITS_SCHEDULER, useValue: scheduler },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function settle(): Promise<void> {
    for (let round = 0; round < 8; round += 1) {
      await Promise.resolve();
      await harness.fixture.whenStable();
    }
  }

  function page(): HTMLElement {
    return harness.fixture.nativeElement as HTMLElement;
  }

  function runsRequest() {
    return http.expectOne((candidate) => candidate.url === RUNS_URL && candidate.method === 'GET');
  }

  /** Open the page with the three reads it makes on arrival already answered. */
  async function open(runs: readonly RunSummaryDto[], detail: RunDto | null): Promise<void> {
    harness = await RouterTestingHarness.create('/processes/gc');
    await settle();
    http.expectOne('/orchestrator/api/processes').flush([process]);
    await settle();
    runsRequest().flush(runs);
    await settle();
    if (detail) {
      http.expectOne(`/orchestrator/api/runs/${detail.id}`).flush(detail);
      await settle();
    }
  }

  it('names the process and says what it does', async () => {
    await open([summary()], run());

    expect(page().querySelector('h1')?.textContent).toContain('Garbage collection');
    expect(page().querySelector('.lede')?.textContent).toContain('unified deletion run');
    http.verify();
  });

  it('lists the runs the service sent, in the order it sent them', async () => {
    await open(
      [summary({ id: 'run-2', startedAt: '2026-08-21T11:00:00Z' }), summary({ id: 'run-1' })],
      run({ id: 'run-2' }),
    );

    const rows = page().querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('21 Aug 2026 11:00:00Z');
    expect(rows[0].textContent).toContain('manual');
    expect(rows[0].textContent).toContain('9.4 GB removed');
    http.verify();
  });

  it('marks a dry run as one, in the list and above the board', async () => {
    await open([summary({ dryRun: true })], run({ dryRun: true }));

    expect(page().querySelector('tbody tr')?.textContent).toContain('dry run');
    expect(page().querySelector('.run-facts')?.textContent).toContain('dry run');
    http.verify();
  });

  it('opens on the newest run without being asked, and draws a card per step', async () => {
    await open([summary({ id: 'run-2' }), summary({ id: 'run-1' })], run({ id: 'run-2' }));

    expect(page().querySelectorAll('[data-step-id]')).toHaveLength(2);
    expect(page().querySelectorAll('polyline')).toHaveLength(1);
    http.verify();
  });

  it('gives each card the tone its status calls for', async () => {
    await open(
      [summary()],
      run({
        steps: [
          step('pins.ci', 'FAILED'),
          step('artifacts.plan', 'SKIPPED', { dependsOn: ['pins.ci'] }),
        ],
      }),
    );

    const cards = page().querySelectorAll<HTMLElement>('.card');
    expect(cards[0].style.borderLeftColor).toBe('rgb(220, 38, 38)');
    expect(cards[1].style.borderLeftColor).toBe('rgb(156, 163, 175)');
    http.verify();
  });

  it('reads a run the operator picked instead of the newest one', async () => {
    await open([summary({ id: 'run-2' }), summary({ id: 'run-1' })], run({ id: 'run-2' }));

    page().querySelectorAll<HTMLButtonElement>('.run-pick')[1].click();
    await settle();
    http.expectOne('/orchestrator/api/runs/run-1').flush(run({ id: 'run-1' }));
    await settle();

    expect(page().querySelector('.run-facts')?.textContent).toContain('run-1');
    http.verify();
  });

  it('opens a card’s request and response, and closes it again', async () => {
    await open([summary()], run());

    page().querySelectorAll<HTMLElement>('.card')[0].click();
    await settle();

    const detail = page().querySelector('app-step-detail');
    expect(detail?.textContent).toContain('GET http://dev-qits-ci:8080/ci/api/daemon');
    expect(detail?.querySelector('pre')).toBeNull();

    detail?.querySelector<HTMLButtonElement>('.toggle')?.click();
    await settle();
    expect(page().querySelector('app-step-detail pre')?.textContent).toContain('"pins"');

    page().querySelectorAll<HTMLElement>('.card')[0].click();
    await settle();
    expect(page().querySelector('app-step-detail')).toBeNull();
    http.verify();
  });

  it('starts a run, selects it, and re-reads the list', async () => {
    await open([summary({ id: 'run-1' })], run({ id: 'run-1' }));

    page().querySelectorAll<HTMLButtonElement>('.actions button')[0].click();
    await settle();

    const post = http.expectOne(
      (candidate) => candidate.url === RUNS_URL && candidate.method === 'POST',
    );
    expect(post.request.body).toEqual({ dryRun: false });
    post.flush({ id: 'run-2' }, { status: 202, statusText: 'Accepted' });
    await settle();

    runsRequest().flush([summary({ id: 'run-2', status: 'RUNNING', finishedAt: null }), summary()]);
    await settle();
    http.expectOne('/orchestrator/api/runs/run-2').flush(run({ id: 'run-2', status: 'RUNNING' }));
    await settle();

    expect(page().querySelector('.run-facts')?.textContent).toContain('run-2');
    // The new run is RUNNING, so the page is now polling it — the polling suite asserts that.
    expect(scheduler.count(POLL_INTERVAL_MS)).toBe(1);
    http.verify();
  });

  it('sends dryRun on the dry run button and on no other', async () => {
    await open([summary()], run());

    page().querySelectorAll<HTMLButtonElement>('.actions button')[1].click();
    await settle();

    const post = http.expectOne(
      (candidate) => candidate.url === RUNS_URL && candidate.method === 'POST',
    );
    expect(post.request.body).toEqual({ dryRun: true });
    post.flush({ id: 'run-3' }, { status: 202, statusText: 'Accepted' });
    await settle();
    runsRequest().flush([summary({ id: 'run-3' })]);
    await settle();
    http.expectOne('/orchestrator/api/runs/run-3').flush(run({ id: 'run-3' }));
    await settle();
    http.verify();
  });

  /** The service holds the one-run-at-a-time rule; the page reports it rather than duplicating it. */
  it('says a run is already active when the service answers 409', async () => {
    await open(
      [summary({ id: 'run-1', status: 'RUNNING', finishedAt: null })],
      run({ status: 'RUNNING' }),
    );

    page().querySelectorAll<HTMLButtonElement>('.actions button')[0].click();
    await settle();

    http
      .expectOne((candidate) => candidate.url === RUNS_URL && candidate.method === 'POST')
      .flush({ message: 'active' }, { status: 409, statusText: 'Conflict' });
    await settle();
    runsRequest().flush([summary({ id: 'run-1', status: 'RUNNING', finishedAt: null })]);
    await settle();

    expect(page().querySelector('.page-error')?.textContent).toContain('a run is already active');
    http.verify();
  });

  it('reports a start that failed for any other reason, with the service’s own words', async () => {
    await open([summary()], run());

    page().querySelectorAll<HTMLButtonElement>('.actions button')[0].click();
    await settle();
    http
      .expectOne((candidate) => candidate.url === RUNS_URL && candidate.method === 'POST')
      .flush({ message: 'containers is down' }, { status: 503, statusText: 'Down' });
    await settle();

    expect(page().querySelector('.page-error')?.textContent).toContain('503 containers is down');
    http.verify();
  });

  describe('polling', () => {
    it('re-reads a RUNNING run every two seconds and stops when it stops', async () => {
      await open(
        [summary({ id: 'run-1', status: 'RUNNING', finishedAt: null })],
        run({ status: 'RUNNING' }),
      );

      expect(scheduler.count(POLL_INTERVAL_MS)).toBe(1);

      scheduler.fire(POLL_INTERVAL_MS);
      await settle();
      http.expectOne('/orchestrator/api/runs/run-1').flush(run({ status: 'RUNNING' }));
      await settle();
      expect(scheduler.count(POLL_INTERVAL_MS)).toBe(1);

      scheduler.fire(POLL_INTERVAL_MS);
      await settle();
      http.expectOne('/orchestrator/api/runs/run-1').flush(run({ status: 'SUCCEEDED' }));
      await settle();
      // A run that stopped is the one moment the listing changes, so it is re-read exactly then.
      runsRequest().flush([summary()]);
      await settle();

      expect(scheduler.count(POLL_INTERVAL_MS)).toBe(0);
      http.verify();
    });

    it('never polls a run that was already terminal when it was read', async () => {
      await open([summary()], run());

      expect(scheduler.count(POLL_INTERVAL_MS)).toBe(0);
      http.verify();
    });

    it('keeps the last good run on screen when a poll fails, and says so', async () => {
      await open(
        [summary({ id: 'run-1', status: 'RUNNING', finishedAt: null })],
        run({ status: 'RUNNING' }),
      );

      scheduler.fire(POLL_INTERVAL_MS);
      await settle();
      http
        .expectOne('/orchestrator/api/runs/run-1')
        .flush(null, { status: 0, statusText: 'Unknown Error' });
      await settle();

      expect(page().querySelector('.stale')?.textContent).toContain('unreachable');
      expect(page().querySelectorAll('[data-step-id]')).toHaveLength(2);
      expect(scheduler.count(POLL_INTERVAL_MS)).toBe(1);
      http.verify();
    });
  });

  it('says a process has never run rather than drawing blank space', async () => {
    await open([], null);

    expect(page().querySelector('table')).toBeNull();
    expect(page().querySelector('app-empty')?.textContent).toContain('never run');
    http.verify();
  });

  it('reports a failed run list and retries it on request', async () => {
    harness = await RouterTestingHarness.create('/processes/gc');
    await settle();
    http.expectOne('/orchestrator/api/processes').flush([process]);
    await settle();
    runsRequest().flush({ message: 'nope' }, { status: 503, statusText: 'Service Unavailable' });
    await settle();

    expect(page().textContent).toContain('503 nope');

    page().querySelectorAll<HTMLButtonElement>('app-async button')[0].click();
    await settle();
    runsRequest().flush([summary()]);
    await settle();
    http.expectOne('/orchestrator/api/runs/run-1').flush(run());
    await settle();

    expect(page().querySelectorAll('tbody tr')).toHaveLength(1);
    http.verify();
  });
});
