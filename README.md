# QitsPlatformSpaOrchestrator

The orchestrator's frontend: the technical processes the platform runs against itself, and what each
step of a run actually did. Served by qits-platform-orchestrator at `/` on
`orchestrator.<env>.<domain>` through Quinoa. Two routes, both inside the platform chrome.

- **`/`** — every technical process. With one defined it forwards to that one, so today this address
  is a door rather than a page.
- **`/processes/<kind>`** — one process: the two start buttons, its recent runs, and the selected run
  drawn as a board of steps.

There is one process today, **`gc`** — the unified deletion run across the platform.

## What the process page shows

**Two buttons that start real work.** `Run now` deletes; `Dry run` does everything except that, and
is how a plan is reviewed before it is executed. Neither is greyed out while a run is going: the
service holds the one-run-at-a-time rule and answers `409`, and this page reports that as a
sentence. A button disabled by the client would be a second copy of the rule, and the two would
disagree the moment a run finished between a render and a click.

**The run list, in the service's own order.** Status, when it started, what triggered it, whether it
was a dry run, and its one-line summary. Picking a row moves the board to it; picking nothing shows
the newest, which is what the page opens on.

**The run as a board.** One card per step, in columns by dependency depth — column 0 is everything
that waits for nothing, and a step sits one column past the deepest thing it waits for. So a column
is "everything that could start at the same moment", and every line runs left to right. An SVG
overlay draws a line from each step to everything that depends on it: straight when the two cards
are level, a horizontal-vertical-horizontal elbow when they are not, so both ends leave and arrive
horizontally and a line stays traceable where several converge on one card.

**Colour says what a step is.** Pending and running are the same warning yellow — on a dependency
board "waiting" and "in flight" are the same answer to "what is left to happen" — and the running
card pulses, which is the difference in motion rather than in colour. Succeeded is green, failed
red, skipped grey. `src/app/ui/status-tone.ts` is the one place those colours are decided;
@qits/ui-components has no design tokens yet, which is the only reason they are hex values.

**Clicking a card opens it.** The request, its body pretty-printed, the peer's JSON response, the
error, the HTTP status. The response is collapsed by default and the toggle says how large it is —
the service bounds it at 1 MiB and a gc sweep really does use that.

**A RUNNING run is re-read every two seconds**, with one request in flight at a time, stopping the
moment the run turns terminal and on leaving the page. A poll that fails leaves the last good run on
screen and says so above it; blanking a board because one request timed out would lose more than it
tells. Durations are computed from the two instants each step already carries — a duration is never
a reason to make a request.

**This application handles no token.** Every call is a same-origin path under `/orchestrator/api`,
and the edge's session is what authenticates it. That is also why no request sets a `credentials`
option: same-origin sends the cookie by default.

## The contract it consumes

Four calls, pinned in the superproject's `qits-orchestrator-plan.md`
("Contracts → qits-platform-orchestrator"):

```
GET  /orchestrator/api/processes                      → [{kind, name, description, steps:[{id,name,target,dependsOn[]}]}]
GET  /orchestrator/api/processes/{kind}/runs?limit=20 → [{id, kind, trigger, dryRun, status, startedAt, finishedAt, summary}]
POST /orchestrator/api/processes/{kind}/runs {dryRun} → 202 {id}   (409 while a run of that kind is active)
GET  /orchestrator/api/runs/{id}                      → run + steps:[{id,name,target,dependsOn,status,…,request,response,error,summary}]
```

Two things the service must honour that the JSON shape alone does not say:

- **Every id in `dependsOn` is an `id` of a step in the same run.** That join is what the board's
  columns and lines are built from. An id matching nothing is drawn as no dependency at all — the
  page will not crash, but the graph will be wrong and nothing on screen will say so.
- **The four reads answer bare arrays and bare objects, not envelopes.** Every sibling explorer on
  this platform unwraps a `{items: […]}` wrapper; this one does not, because the contract does not
  have one.

## How it is served

qits-platform-orchestrator carries this repository as a git submodule at `service/src/main/webui` —
Quinoa's ui-dir — and builds it during `mvn package`, serving the bundle at `/`. The root is spelled
here as `baseHref` in `angular.json` and there as `quarkus.quinoa.ui-root-path`; the two move
together, and a disagreement serves a page whose every asset 404s. This repository ships no container
image of its own.

**This is a `system` app.** Its pages are about the platform's own housekeeping rather than about one
project, so it routes no `/<projectSlug>/...` form — `provideQitsScope('system')` in `app.config.ts`
says so, and picking a project in the chrome's picker leaves for qits-projects instead of rewriting
an address this app does not serve. The API keeps its `/orchestrator` segment and is path-routed on
every host, so the calls above are unchanged. The old bare-`/orchestrator` trailing-slash wart went
with the move to the root.

## Development server

```bash
ng serve
```

Then open `http://localhost:4200/`. `proxy.conf.json` forwards `/orchestrator/api`,
`/orchestrator/q`, `/projects/api` and `/main-navigation` to an edge on `localhost:8080`, because
`ng serve` puts none in front.

With no edge answering `/main-navigation` the sidebar renders "Navigation unavailable". That is the
intended degraded state, not a fault.

## Running the checks

```bash
npm run lint && npm test && npm run build
```

The same three, in the same order, are what `.config/qits/ci-post-receive.yml` runs on every push.
Note what that pipeline installs from: the npm proxy behind it is qits-platform-mirror, and the
`@qits` scope comes from qits-artifacts — so a run here cannot be green while either service is
down. Their deploys are taken alone, with the CI queue empty.

Installing on a developer machine needs a credential, and it is not in this repository. Every read
through the edge authenticates, so both registries answer 401 without one; `.npmrc` here carries the
routing only, and the `_auth` line comes from your own `~/.npmrc`, minted for your commissioned
workstation client. CI takes both the addresses and the credential from the step environment.

## Running unit tests

```bash
ng test
```

Vitest on jsdom — no browser, which is what lets CI run them.

**jsdom lays nothing out**, and the board's lines are geometry, so two things the browser owns are
injected rather than called: `BoardMetrics` (card rectangles, `ResizeObserver`) and `QITS_SCHEDULER`
(the poll's interval and the clock). A spec provides its own and asserts exact pixels and exact
polls. Neither is ever a `vi.mock` — a patched module leaks between spec files and makes green
depend on the order they ran in.

## Building

```bash
ng build
```

The bundle lands in `dist/qits-platform-spa-orchestrator/browser`, which is the path
`quarkus.quinoa.build-dir` names on the service side.
