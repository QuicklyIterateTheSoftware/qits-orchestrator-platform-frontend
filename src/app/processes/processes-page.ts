import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { ProcessDto } from '../api/dto';
import { ProcessCatalog } from '../api/process-catalog';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { plural } from '../ui/format';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';

/**
 * The front door: every technical process this service knows how to run.
 *
 * **With one process it forwards, and today there is one.** A list of a single row is a click
 * between an operator and the only thing they came for, so `/` lands on `/processes/gc` instead —
 * and it does so with `replaceUrl`, because a redirect left in the history turns the back button
 * into a bounce. The list is still written and still correct: the day a second process is defined
 * the same page stops forwarding and shows both, with no route change.
 *
 * **It forwards on the answer, never before it.** The redirect needs the list, so it cannot be a
 * `redirectTo` in the route table; and doing it here is what lets a service that cannot be reached
 * say so on a page, rather than bouncing to a URL that will fail the same way with less context.
 */
@Component({
  selector: 'app-processes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Async, Empty],
  styleUrls: ['../ui/page.css'],
  template: `
    <header class="head">
      <h1>Technical processes</h1>
    </header>
    <p class="lede">
      Multi-step jobs the platform runs against itself. Each one only sends requests to other
      services and records what happened.
    </p>

    <app-async
      [state]="state()"
      loadingLabel="Loading the processes"
      errorLabel="Could not load the processes"
      (retry)="load()"
    />

    @if (state().kind === 'ready') {
      @if (processes().length === 0) {
        <app-empty
          message="This service defines no technical process. That is a deployment with nothing to run, not an empty list."
        />
      } @else {
        <div class="scroll">
          <table>
            <caption>
              {{
                caption()
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">Process</th>
                <th scope="col">What it does</th>
                <th scope="col" class="num">Steps</th>
              </tr>
            </thead>
            <tbody>
              @for (process of processes(); track process.kind) {
                <tr>
                  <td>
                    <a [routerLink]="['/processes', process.kind]">{{ process.name }}</a>
                  </td>
                  <td class="value">{{ process.description }}</td>
                  <td class="num">{{ process.steps.length }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
})
export class ProcessesPage {
  private readonly catalog = inject(ProcessCatalog);
  private readonly router = inject(Router);

  protected readonly state = signal<Loadable<readonly ProcessDto[]>>(LOADING);

  protected readonly processes = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.value : [];
  });

  protected readonly caption = computed(() =>
    plural(this.processes().length, 'technical process', 'technical processes'),
  );

  constructor() {
    this.load();
  }

  /** The page's one request, re-issued by the retry button and by nothing else. */
  protected load(): void {
    this.state.set(LOADING);
    this.catalog.processes().then(
      (processes) => {
        this.state.set(ready(processes));
        if (processes.length === 1) {
          void this.router.navigate(['/processes', processes[0].kind], { replaceUrl: true });
        }
      },
      (error: unknown) => this.state.set(failed(error)),
    );
  }
}
