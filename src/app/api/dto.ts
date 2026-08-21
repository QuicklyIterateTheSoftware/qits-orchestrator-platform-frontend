/**
 * What qits-platform-orchestrator answers, spelled as the pinned contract spells it
 * (`qits-orchestrator-plan.md`, "Contracts → qits-platform-orchestrator").
 *
 * **The four reads are bare JSON, not envelopes.** The contract writes
 * `GET /processes → [{kind, …}]`, so an array is what arrives and an array is what this app parses.
 * Every sibling explorer on this platform unwraps a `{items: […]}` envelope instead; this one does
 * not, and a service that grew one would break these pages silently — which is why the API spec
 * asserts the shape rather than trusting it.
 */

/** A step's outcome. `SKIPPED` is what a failed dependency leaves behind, never a failure itself. */
export type StepStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

/** A run's outcome. Narrower than a step's: a run is never pending and never skipped. */
export type RunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED';

/** What started a run: a person pressing a button, or the service's own cron. */
export type RunTrigger = 'manual' | 'scheduled';

/** One step of a process *definition* — the shape, with no run behind it. */
export interface ProcessStepDto {
  readonly id: string;
  readonly name: string;
  readonly target: string;
  readonly dependsOn: readonly string[];
}

/** A technical process this service knows how to run. Today there is exactly one: `gc`. */
export interface ProcessDto {
  readonly kind: string;
  readonly name: string;
  readonly description: string;
  readonly steps: readonly ProcessStepDto[];
}

/** A run as the listing shows it: everything except the steps. */
export interface RunSummaryDto {
  readonly id: string;
  readonly kind: string;
  readonly trigger: RunTrigger;
  readonly dryRun: boolean;
  readonly status: RunStatus;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly summary: string | null;
}

/** What one step *did*: the call it made, what came back, and how it ended. */
export interface RunStepDto {
  readonly id: string;
  readonly name: string;
  readonly target: string;
  readonly dependsOn: readonly string[];
  readonly status: StepStatus;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly httpStatus: number | null;
  readonly request: {
    readonly method: string;
    readonly url: string;
    readonly body?: unknown;
  } | null;
  /** The peer's JSON body, stored whole. It can be large — the detail panel collapses it. */
  readonly response: unknown;
  readonly error: string | null;
  readonly summary: string | null;
}

/** One run with its steps — what `GET /runs/{id}` answers and what the board draws. */
export interface RunDto extends RunSummaryDto {
  readonly steps: readonly RunStepDto[];
}

/** What `POST /processes/{kind}/runs` answers: 202 and the id of the run it accepted. */
export interface StartedRunDto {
  readonly id: string;
}

/** A run that has stopped. Only `RUNNING` is worth polling. */
export function isTerminal(status: RunStatus): boolean {
  return status !== 'RUNNING';
}
