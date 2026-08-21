import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QitsNavSubmenuSlot, provideQitsNavigationLinks } from '@qits/ui-components';
import { App } from './app';
import { routes } from './app.routes';
import { BoardMetrics, NO_MEASUREMENT, type BoardMeasurement } from './board/metrics';
import { QITS_SCHEDULER, type QitsScheduler } from './ui/scheduler';

/**
 * A fixture navigation, not the platform's. `provideQitsNavigationLinks` answers the layout's
 * `QITS_NAVIGATION` from a literal, so the chrome makes no `/main-navigation` request — which is
 * what keeps `http.verify()` honest instead of failing on a call this file never asked for.
 */
const NAV = [
  { label: 'Deployments', href: '/platform-deployments/' },
  { label: 'Orchestrator', href: '/orchestrator/' },
] as const;

@Injectable()
class StubMetrics extends BoardMetrics {
  override measure(): BoardMeasurement {
    return NO_MEASUREMENT;
  }
  override observe(): () => void {
    return () => undefined;
  }
}

const NOOP_SCHEDULER: QitsScheduler = { every: () => () => undefined, now: () => 0 };

const PROCESS = { kind: 'gc', name: 'Garbage collection', description: 'gc', steps: [] };

/**
 * The shell owns two things — the outlet and the sub-menu — so those are what is asserted here,
 * plus the route table putting both doors inside the chrome.
 *
 * The layout assertion is not ceremony. Both pages here are an administrator's, and one
 * accidentally mounted outside `QitsMainLayout` would be a screen that starts platform-wide
 * deletions with no way back to anything — invisible on the page itself and a two-character edit
 * away in this table.
 */
describe('App', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideQitsNavigationLinks(NAV),
        { provide: BoardMetrics, useClass: StubMetrics },
        { provide: QITS_SCHEDULER, useValue: NOOP_SCHEDULER },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  /**
   * The sub-menu is *offered*, not drawn: it is an `<ng-template>` the layout renders somewhere
   * else, so the shell on its own paints an outlet and nothing at all — and the picker inside it
   * makes no request until the chrome asks for it. That is the assertion, and it is also why every
   * other spec in this repository sees exactly one `/processes` read.
   */
  it('is an outlet and an offered sub-menu, and no page of its own', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const shell = fixture.nativeElement as HTMLElement;
    expect(shell.querySelector('router-outlet')).not.toBeNull();
    expect(shell.querySelector('h1')).toBeNull();
    expect(TestBed.inject(QitsNavSubmenuSlot).template()).not.toBeNull();
    http.verify();
  });

  it('draws the process listing at the base path, inside the chrome', async () => {
    const harness = await RouterTestingHarness.create('/');
    // Two processes, so the landing page stays a listing rather than forwarding.
    http
      .expectOne('/orchestrator/api/processes')
      .flush([PROCESS, { ...PROCESS, kind: 'other', name: 'Other' }]);
    await harness.fixture.whenStable();

    const layout = harness.routeNativeElement as HTMLElement;
    expect(layout.tagName.toLowerCase()).toBe('qits-main-layout');
    expect(layout.querySelectorAll('nav a')).toHaveLength(NAV.length);
    expect(layout.querySelector('main app-processes-page')).not.toBeNull();
    http.verify();
  });

  /** With one process the landing page is a door, not a choice — and it must not stack history. */
  it('forwards the base path to the only process there is', async () => {
    const harness = await RouterTestingHarness.create('/');
    http.expectOne('/orchestrator/api/processes').flush([PROCESS]);
    for (let round = 0; round < 8; round += 1) {
      await Promise.resolve();
      await harness.fixture.whenStable();
    }
    http
      .expectOne((candidate) => candidate.url === '/orchestrator/api/processes/gc/runs')
      .flush([]);
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/processes/gc');
    expect(
      (harness.routeNativeElement as HTMLElement).querySelector('main app-process-page'),
    ).not.toBeNull();
    http.verify();
  });

  it('routes a process kind to the process page, still inside the chrome', async () => {
    const harness = await RouterTestingHarness.create('/processes/gc');
    http.expectOne('/orchestrator/api/processes').flush([PROCESS]);
    await harness.fixture.whenStable();
    http
      .expectOne((candidate) => candidate.url === '/orchestrator/api/processes/gc/runs')
      .flush([]);
    await harness.fixture.whenStable();

    const layout = harness.routeNativeElement as HTMLElement;
    expect(layout.tagName.toLowerCase()).toBe('qits-main-layout');
    expect(layout.querySelector('main app-process-page')).not.toBeNull();
    http.verify();
  });

  it('draws an unknown URL under /orchestrator/ as a page, still inside the chrome', async () => {
    const harness = await RouterTestingHarness.create('/nothing-here');

    const layout = harness.routeNativeElement as HTMLElement;
    expect(layout.tagName.toLowerCase()).toBe('qits-main-layout');
    expect(layout.querySelector('main app-not-found')).not.toBeNull();
    http.verify();
  });
});
