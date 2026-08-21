import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OrchestratorApi } from './orchestrator-api';

/**
 * The four calls, at the addresses qits-platform-orchestrator serves them at.
 *
 * The assertions worth having are the ones that are invisible on screen when they are wrong:
 * **every path is relative**, because a configured origin would leave the edge's session cookie
 * behind and turn every read into a 401; **the verbs are right**, because the one POST here starts
 * real deletions and a GET that should have been a POST fails silently as a 405; and **a failure
 * reaches the caller whole**, because the page draws the service's own sentence from it — and
 * because the 409 the start button depends on is only distinguishable by its status.
 */
describe('OrchestratorApi', () => {
  let api: OrchestratorApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(OrchestratorApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the processes at a relative path, as a bare array', async () => {
    const processes = api.processes();

    const request = http.expectOne('/orchestrator/api/processes');
    expect(request.request.method).toBe('GET');
    request.flush([{ kind: 'gc', name: 'Garbage collection', description: 'x', steps: [] }]);

    expect((await processes).map((process) => process.kind)).toEqual(['gc']);
  });

  it('asks for a process’s runs with the limit as a query parameter', async () => {
    const runs = api.runs('gc');

    const request = http.expectOne(
      (candidate) => candidate.url === '/orchestrator/api/processes/gc/runs',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('limit')).toBe('20');
    request.flush([{ id: 'r1' }]);

    expect((await runs).map((run) => run.id)).toEqual(['r1']);
  });

  it('starts a run with a POST that carries the dry-run flag', async () => {
    const started = api.startRun('gc', true);

    const request = http.expectOne(
      (candidate) => candidate.url === '/orchestrator/api/processes/gc/runs',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ dryRun: true });
    request.flush({ id: 'r9' }, { status: 202, statusText: 'Accepted' });

    expect((await started).id).toBe('r9');
  });

  /** The one status the start button reads rather than reports, so it must arrive intact. */
  it('lets a 409 through to the caller as a 409', async () => {
    const started = api.startRun('gc', false);

    http
      .expectOne((candidate) => candidate.url === '/orchestrator/api/processes/gc/runs')
      .flush({ message: 'a run is already active' }, { status: 409, statusText: 'Conflict' });

    await expect(started).rejects.toMatchObject({ status: 409 });
  });

  it('reads one run by id, bare', async () => {
    const run = api.run('r1');

    const request = http.expectOne('/orchestrator/api/runs/r1');
    expect(request.request.method).toBe('GET');
    request.flush({ id: 'r1', steps: [] });

    expect((await run).id).toBe('r1');
  });

  it('percent-encodes a kind and a run id rather than pasting them into the path', async () => {
    const runs = api.runs('a/b');
    http
      .expectOne((candidate) => candidate.url === '/orchestrator/api/processes/a%2Fb/runs')
      .flush([]);
    await runs;

    const run = api.run('a b');
    http.expectOne('/orchestrator/api/runs/a%20b').flush({ id: 'a b', steps: [] });
    await run;
  });

  it('rejects with the service’s own message rather than swallowing it', async () => {
    const processes = api.processes();

    http
      .expectOne('/orchestrator/api/processes')
      .flush({ message: 'no' }, { status: 503, statusText: 'Service Unavailable' });

    await expect(processes).rejects.toMatchObject({
      status: 503,
      error: { message: 'no' },
    });
  });
});
