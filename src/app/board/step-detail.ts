import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { RunStepDto } from '../api/dto';
import { NONE, formatInstant, prettyJson } from '../ui/format';
import { StatusBadge } from '../ui/status-badge';

/**
 * One step, whole: the call it made, what came back, and what went wrong.
 *
 * **This is why the board is clickable at all.** A card can carry a status and a one-line summary;
 * an operator reviewing a garbage collection run needs the plan the sweep was given, the list of
 * images that were kept and why, and the peer's own error text. All three are in the response body,
 * and the response body is the one field on a run that is measured in hundreds of kilobytes.
 *
 * **So the response is collapsed by default and the request is not.** The request is three short
 * lines and says what was asked for; the response is bounded at 1 MiB by the service and would
 * otherwise push everything below it — including the error — off the screen. Opening it is one
 * click, and the toggle says how many characters are waiting so the click is an informed one.
 */
@Component({
  selector: 'app-step-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatusBadge],
  template: `
    <section class="detail">
      <header class="detail-head">
        <h3>{{ step().name }}</h3>
        <app-status-badge [status]="step().status" />
      </header>

      <dl class="facts">
        <dt>Step id</dt>
        <dd class="mono">{{ step().id }}</dd>
        <dt>Target</dt>
        <dd>{{ step().target }}</dd>
        <dt>Depends on</dt>
        <dd class="mono">{{ dependsOn() }}</dd>
        <dt>Started</dt>
        <dd>{{ instant(step().startedAt) }}</dd>
        <dt>Finished</dt>
        <dd>{{ instant(step().finishedAt) }}</dd>
        <dt>HTTP status</dt>
        <dd>{{ step().httpStatus ?? none }}</dd>
      </dl>

      @if (step().summary; as summary) {
        <p class="summary">{{ summary }}</p>
      }

      @if (step().error; as error) {
        <p class="error" role="alert">{{ error }}</p>
      }

      <h4>Request</h4>
      @if (step().request; as request) {
        <p class="mono call">{{ request.method }} {{ request.url }}</p>
        @if (body()) {
          <pre class="json">{{ body() }}</pre>
        } @else {
          <p class="subtle">No body.</p>
        }
      } @else {
        <p class="subtle">This step made no request.</p>
      }

      <h4>
        Response
        @if (response()) {
          <button type="button" class="toggle" (click)="toggle()">
            {{ open() ? 'Hide' : 'Show' }} {{ size() }}
          </button>
        }
      </h4>
      @if (!response()) {
        <p class="subtle">Nothing came back.</p>
      } @else if (open()) {
        <pre class="json">{{ response() }}</pre>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .detail {
      margin-top: 1rem;
      padding: 0.9rem 1rem 1rem;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      background: #ffffff;
    }
    .detail-head {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .detail-head h3 {
      margin: 0;
      font-size: 1.05rem;
    }
    h4 {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin: 1rem 0 0.35rem;
      font-size: 0.8rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .facts {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.15rem 0.9rem;
      margin: 0.75rem 0 0;
      font-size: 0.9rem;
    }
    .facts dt {
      color: #6b7280;
    }
    .facts dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .summary {
      margin: 0.75rem 0 0;
    }
    .error {
      margin: 0.75rem 0 0;
      padding: 0.5rem 0.7rem;
      border-radius: 0.375rem;
      color: #b91c1c;
      background: #fef2f2;
      border: 1px solid #fecaca;
      overflow-wrap: anywhere;
    }
    .call {
      margin: 0;
      overflow-wrap: anywhere;
    }
    /* Bounded and scrolling: a gc sweep response lists every blob it touched, and a pane that grew
       to fit it would bury the run list under a page of JSON. */
    .json {
      margin: 0.35rem 0 0;
      padding: 0.6rem 0.75rem;
      max-height: 24rem;
      overflow: auto;
      border-radius: 0.375rem;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8rem;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .toggle {
      font: inherit;
      font-size: 0.75rem;
      text-transform: none;
      letter-spacing: normal;
      padding: 1px 8px;
      border: 1px solid #d1d5db;
      border-radius: 999px;
      background: #ffffff;
      color: #1f2937;
      cursor: pointer;
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.85em;
    }
    .subtle {
      margin: 0.35rem 0 0;
      color: #6b7280;
    }
  `,
})
export class StepDetail {
  readonly step = input.required<RunStepDto>();

  protected readonly none = NONE;
  protected readonly open = signal(false);

  protected readonly dependsOn = computed(() => {
    const dependencies = this.step().dependsOn ?? [];
    return dependencies.length > 0 ? dependencies.join(', ') : NONE;
  });

  protected readonly body = computed(() => prettyJson(this.step().request?.body));

  protected readonly response = computed(() => prettyJson(this.step().response));

  /** `12.4 kB` — what opening the pane is about to cost, said before it is clicked. */
  protected readonly size = computed(() => {
    const characters = this.response().length;
    return characters < 1024 ? `${characters} B` : `${(characters / 1024).toFixed(1)} kB`;
  });

  protected instant(iso: string | null): string {
    return formatInstant(iso);
  }

  protected toggle(): void {
    this.open.update((open) => !open);
  }
}
