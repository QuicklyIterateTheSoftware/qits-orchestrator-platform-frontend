import type { QitsBadgeTone } from '@qits/ui-components';

/**
 * What colour a status is, in one place, for both the badge and the card.
 *
 * `QitsBadge` takes a *semantic* tone and never a colour, so the first half of this file is a
 * translation between two vocabularies rather than styling. The second half is the honest exception:
 * a card's left border is drawn by this application's own CSS and @qits/ui-components ships no
 * design tokens yet, so the hex values live here — beside the tone they belong to — instead of
 * being scattered through three templates. When the library grows tokens, this is the one file
 * that changes.
 *
 * **PENDING and RUNNING share the warning tone**, which is a decision rather than an oversight. On
 * a dependency board the reader's question is "what is left to happen", and a step waiting for its
 * dependency and a step in flight are the same answer to it. The pulse on the running card is what
 * separates the two, and it is motion rather than colour so it costs the palette nothing.
 */
const TONES: Readonly<Record<string, QitsBadgeTone>> = {
  PENDING: 'warning',
  RUNNING: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  SKIPPED: 'neutral',
};

/** The colour a card's left border and header strip take, one per tone. */
const TONE_COLOURS: Readonly<Record<QitsBadgeTone, string>> = {
  neutral: '#9ca3af',
  info: '#3b82f6',
  success: '#16a34a',
  warning: '#eab308',
  danger: '#dc2626',
};

/**
 * The tone for a status word.
 *
 * `neutral` for a status this build has not been taught: a new enum value on the service side must
 * render as a plain grey card rather than crash the board or silently claim success.
 */
export function toneOf(status: string): QitsBadgeTone {
  return TONES[status] ?? 'neutral';
}

/** The colour that tone is drawn in — the card's border, never the badge's. */
export function colourOf(status: string): string {
  return TONE_COLOURS[toneOf(status)];
}
