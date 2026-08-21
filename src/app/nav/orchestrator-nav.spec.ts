import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter, type Routes } from '@angular/router';
import { OrchestratorNav } from './orchestrator-nav';

/** A destination for the router to land on, so a URL can be asserted without mounting a page. */
@Component({
  selector: 'app-nav-spec-blank',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class Blank {}

/**
 * The real route table is not used here on purpose: this spec is about the mapping between the URL
 * and the pill, and mounting the real pages would drag their reads in and assert them by accident.
 */
const STUB_ROUTES: Routes = [{ path: '**', component: Blank }];

/**
 * The sub-navigation, which is the whole navigation of this app.
 *
 * The assertions are all about one rule: the URL decides what the pill shows, in both directions
 * and including the direction nobody tests — a URL naming a process that is not in the list.
 */
describe('OrchestratorNav', () => {
  let http: HttpTestingController;
  let router: Router;
  let fixture: ComponentFixture<OrchestratorNav>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(STUB_ROUTES),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  async function mount(kinds: readonly string[]): Promise<void> {
    fixture = TestBed.createComponent(OrchestratorNav);
    await fixture.whenStable();
    http.expectOne('/orchestrator/api/processes').flush(
      kinds.map((kind) => ({
        kind,
        name: `${kind} process`,
        description: '',
        steps: [],
      })),
    );
    await settle();
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 4; round += 1) {
      await Promise.resolve();
      await fixture.whenStable();
    }
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function options(): string[] {
    return Array.from(element().querySelectorAll('.qits-picker-option')).map(
      (row) => row.textContent?.trim() ?? '',
    );
  }

  function pill(): string | null {
    return element().querySelector('.qits-picker-value')?.textContent?.trim() ?? null;
  }

  it('offers one option per process, named as the service names it', async () => {
    await mount(['gc', 'reindex']);

    expect(options()).toEqual(['gc process', 'reindex process']);
    expect(pill()).toBeNull();
  });

  it('shows the process the URL names', async () => {
    await mount(['gc', 'reindex']);

    await router.navigate(['/processes', 'reindex']);
    await settle();

    expect(pill()).toBe('reindex process');
  });

  /** Deep link: the seed matters as much as the stream — no NavigationEnd arrives before render. */
  it('shows the process of a URL that was already current when it was built', async () => {
    await router.navigate(['/processes', 'gc']);
    await mount(['gc']);

    expect(pill()).toBe('gc process');
  });

  /** A pill for a process nobody can visit would be a label the picker cannot even draw. */
  it('shows nothing for a URL naming a process the list does not contain', async () => {
    await mount(['gc']);

    await router.navigate(['/processes', 'nope']);
    await settle();

    expect(pill()).toBeNull();
    expect(options()).toEqual(['gc process']);
  });

  it('ignores a first segment that is not the processes noun', async () => {
    await mount(['gc']);

    await router.navigate(['/', 'gc']);
    await settle();

    expect(pill()).toBeNull();
  });

  it('navigates to the process that is picked', async () => {
    await mount(['gc', 'reindex']);

    element().querySelectorAll<HTMLElement>('.qits-picker-option')[1].click();
    await settle();

    expect(router.url).toBe('/processes/reindex');
  });

  it('goes back to the landing page when the pick is cleared', async () => {
    await mount(['gc']);
    await router.navigate(['/processes', 'gc']);
    await settle();

    element().querySelector<HTMLButtonElement>('.qits-picker-clear')?.click();
    await settle();

    expect(router.url).toBe('/');
  });

  it('says so when the list could not be read, rather than showing an empty picker', async () => {
    fixture = TestBed.createComponent(OrchestratorNav);
    await fixture.whenStable();
    http.expectOne('/orchestrator/api/processes').flush(null, { status: 503, statusText: 'Down' });
    await settle();

    expect(element().textContent).toContain('Could not load the processes');
    expect(element().querySelector('qits-picker')).toBeNull();
  });
});
