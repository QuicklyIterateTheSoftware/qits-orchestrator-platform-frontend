import {
  NONE,
  formatDuration,
  formatElapsed,
  formatInstant,
  plural,
  prettyJson,
  shortUrl,
} from './format';

/**
 * The conversions, including the ones that only ever matter when the data is imperfect: a step that
 * never started, a response that is a string rather than an object, a URL the service spelled in a
 * way `URL` cannot parse.
 */
describe('format', () => {
  it('renders an instant in UTC, so two operators read the same clock', () => {
    expect(formatInstant('2026-08-21T09:12:04Z')).toBe('21 Aug 2026 09:12:04Z');
    expect(formatInstant(null)).toBe(NONE);
    expect(formatInstant('not a date')).toBe(NONE);
  });

  it('measures a finished step from its own two instants', () => {
    expect(formatDuration('2026-08-21T09:12:00Z', '2026-08-21T09:16:12Z')).toBe('4m 12s');
    expect(formatDuration('2026-08-21T09:00:00Z', '2026-08-21T10:04:00Z')).toBe('1h 04m');
  });

  /** A running step has no end, so the caller's clock is the end — which is why it ticks. */
  it('measures a running step against the clock it was given', () => {
    expect(formatDuration('2026-08-21T09:12:00Z', null, Date.parse('2026-08-21T09:12:41Z'))).toBe(
      '41s',
    );
  });

  it('says nothing rather than zero for a step that never started', () => {
    expect(formatDuration(null, null, 0)).toBe(NONE);
    expect(formatDuration('2026-08-21T09:12:00Z', null)).toBe(NONE);
  });

  it('never renders a negative span', () => {
    expect(formatElapsed(-5000)).toBe('0s');
  });

  it('drops the peer’s host from a call, and leaves an unparseable URL alone', () => {
    expect(shortUrl('http://dev-qits-containers:8080/containers/api/gc/usage')).toBe(
      '/containers/api/gc/usage',
    );
    expect(shortUrl('/already/relative')).toBe('/already/relative');
  });

  it('pretty-prints a body, and passes a string through as it is', () => {
    expect(prettyJson({ dryRun: true })).toBe('{\n  "dryRun": true\n}');
    expect(prettyJson('plain text')).toBe('plain text');
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson('{"a":1 …truncated')).toBe('{"a":1 …truncated');
    expect(prettyJson(null)).toBe('');
    expect(prettyJson(undefined)).toBe('');
  });

  it('counts with the noun it counts', () => {
    expect(plural(1, 'run')).toBe('1 run');
    expect(plural(3, 'run')).toBe('3 runs');
  });
});
