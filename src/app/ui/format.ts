/**
 * The small conversions the pages need, kept out of the templates so they can be asserted directly.
 *
 * **Every timestamp is rendered in UTC**, as in every sibling explorer: the service stamps
 * `Instant`s, and a browser-local rendering would make two operators looking at the same garbage
 * collection run disagree about when it happened.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** What is drawn where there is nothing to draw — one em dash, everywhere. */
export const NONE = '—';

function parse(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** `31 Jul 2026 14:02:11Z` — a run's own timestamp, year and seconds included. */
export function formatInstant(iso: string | null): string {
  const date = parse(iso);
  if (!date) {
    return NONE;
  }
  return (
    `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * `4m 12s`, `1h 04m`, `41s`.
 *
 * **A step's duration is computed here and never polled.** Both instants are on the step already,
 * so re-reading a run to learn what a subtraction knows would turn every card into traffic. `to` is
 * null for a step still running, in which case the caller passes the current time and the number
 * ticks locally.
 */
export function formatDuration(from: string | null, to: string | null, nowMs?: number): string {
  const start = parse(from);
  if (!start) {
    return NONE;
  }
  const end = parse(to)?.getTime() ?? nowMs;
  if (end === undefined) {
    return NONE;
  }
  return formatElapsed(end - start.getTime());
}

/** The same rendering, for a span the client measured itself rather than read off two fields. */
export function formatElapsed(millis: number): string {
  const total = Math.max(0, Math.round(millis / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  if (hours > 0) {
    return `${hours}h ${pad(minutes)}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${pad(seconds)}s`;
  }
  return `${seconds}s`;
}

/** `10 runs`, `1 run` — a count is never drawn without the noun it counts. */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/**
 * A request URL as a card can carry it: the path, without the scheme and host.
 *
 * The host is the wire alias of a peer service (`http://dev-qits-containers:8080`) and it is the
 * same for every step aimed at that peer, so on a card it is nine wasted characters that push the
 * one distinguishing part — the path — off the end. The detail panel shows the URL whole; this is
 * the short form for the board only.
 */
export function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * A JSON body as a reader can read it — two-space indented, or the value itself when it is already
 * a string.
 *
 * Nothing here throws: a response holding a cycle (it cannot, it came off the wire) or an
 * unserialisable value must not take the panel down with it, because the panel is where an operator
 * goes when a step has already gone wrong.
 */
export function prettyJson(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    // The service stores a peer's body as a string (a 1 MiB-truncated body is not JSON). Pretty-print
    // it when it still parses; show it as it came otherwise.
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
