import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { QitsPicker, type QitsPickerOption } from '@qits/ui-components';
import type { ProcessDto } from '../api/dto';
import { ProcessCatalog } from '../api/process-catalog';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';

/**
 * Which technical process is being looked at, as the sub-menu under this application's entry in the
 * platform navigation.
 *
 * <p><b>The picker is the whole navigation of this app.</b> Everything below `/orchestrator/` is
 * addressed by process kind, so choosing one is not a filter over a page — it *is* the page, and
 * the URL says so. That is why the selection is derived from the router rather than held here: a
 * reader arriving on a deep link, pressing back, or being redirected by the landing page must all
 * leave the pill showing the process actually on screen.
 *
 * <p>There is one process today, and the picker is still right: a list of one is a list, the URL it
 * routes to is the one the landing page redirects to anyway, and the day a second technical process
 * is defined nothing here changes.
 *
 * <p>Declared by the shell, not by a page: `RouterOutlet` destroys the outgoing component after
 * creating the incoming one, so a declaration inside a page would be torn down and rebuilt on every
 * hop, in a menu that did not itself change.
 */
@Component({
  selector: 'app-orchestrator-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsPicker],
  template: `
    @switch (processes().kind) {
      @case ('loading') {
        <p class="hint">Loading processes…</p>
      }
      @case ('error') {
        <p class="hint error" role="alert">Could not load the processes.</p>
      }
      @default {
        <qits-picker
          [options]="options()"
          [value]="selected()"
          (valueChange)="onProcess($event)"
          ariaLabel="Technical process"
          placeholder="Pick a process"
          emptyLabel="No processes defined"
        />
      }
    }
  `,
  styles: `
    /* The layout contributes a bare block and no opinions, so every rule this menu needs is here.
       It renders inside a 240px column that already scrolls and pads, hence no padding of its own. */
    :host {
      display: block;
      min-width: 0;
      padding: 4px 0 8px;
    }
    .hint {
      margin: 6px 10px;
      font-size: 12px;
      color: #6b7280;
    }
    .error {
      color: #b91c1c;
    }
  `,
})
export class OrchestratorNav {
  private readonly catalog = inject(ProcessCatalog);
  private readonly router = inject(Router);

  protected readonly processes = signal<Loadable<readonly ProcessDto[]>>(LOADING);

  /**
   * The URL, as a signal, because Angular 21.2 has no signal-valued `Router.url` — only a string
   * getter and `currentNavigation`, which is null once a navigation has finished. The seed matters
   * as much as the stream: a reader who lands directly on a process URL gets no `NavigationEnd`
   * before the first render.
   */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** The kind in `/processes/<kind>`, which is where every page of this app puts it. */
  private readonly routeKind = computed(() => {
    const path = this.url().split('#')[0].split('?')[0];
    const segments = path.split('/').filter(Boolean);
    return segments[0] === 'processes' && segments[1] ? decodeURIComponent(segments[1]) : undefined;
  });

  protected readonly options = computed<QitsPickerOption<string>[]>(() => {
    const state = this.processes();
    return state.kind === 'ready'
      ? state.value.map((process) => ({ value: process.kind, label: process.name }))
      : [];
  });

  /** The process on screen — or nothing, for a URL naming one this list does not contain. */
  protected readonly selected = computed(() => {
    const kind = this.routeKind();
    return kind && this.options().some((option) => option.value === kind) ? kind : undefined;
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.processes.set(LOADING);
    try {
      this.processes.set(ready(await this.catalog.processes()));
    } catch (error) {
      this.processes.set(failed(error));
    }
  }

  /** Choosing a process goes to it; clearing the picker goes back to the landing page. */
  protected onProcess(kind: string | undefined): void {
    void this.router.navigate(kind ? ['/processes', kind] : ['/']);
  }
}
