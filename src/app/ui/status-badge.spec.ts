import { TestBed } from '@angular/core/testing';
import { colourOf, toneOf } from './status-tone';
import { StatusBadge } from './status-badge';

/**
 * The map is the component, so the map is what is asserted — including the fallback, because a new
 * status on the service side must render as a plain badge rather than crash the board.
 */
describe('status tone', () => {
  it('reads a step waiting and a step in flight as the same colour', () => {
    expect(toneOf('PENDING')).toBe('warning');
    expect(toneOf('RUNNING')).toBe('warning');
  });

  it('gives an outcome the tone that says what it is', () => {
    expect(toneOf('SUCCEEDED')).toBe('success');
    expect(toneOf('FAILED')).toBe('danger');
  });

  /** A skipped step is what a failed dependency leaves behind — a non-event, not a failure. */
  it('reads SKIPPED as neutral', () => {
    expect(toneOf('SKIPPED')).toBe('neutral');
  });

  it('falls back to neutral for a status this build has never heard of', () => {
    expect(toneOf('SOMETHING_NEW')).toBe('neutral');
    expect(colourOf('SOMETHING_NEW')).toBe(colourOf('SKIPPED'));
  });

  it('gives each tone one colour, and the card and the badge read the same map', () => {
    expect(colourOf('FAILED')).toBe('#dc2626');
    expect(colourOf('SUCCEEDED')).toBe('#16a34a');
    expect(colourOf('RUNNING')).toBe(colourOf('PENDING'));
  });
});

describe('StatusBadge', () => {
  async function badgeOf(status: string): Promise<HTMLElement | null> {
    const fixture = TestBed.createComponent(StatusBadge);
    fixture.componentRef.setInput('status', status);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('qits-badge');
  }

  it('renders the status word itself — a coloured dot is not a status', async () => {
    expect((await badgeOf('SKIPPED'))?.textContent).toContain('SKIPPED');
  });

  it('passes the tone through to the platform badge', async () => {
    expect((await badgeOf('FAILED'))?.firstElementChild?.className).toContain('danger');
  });
});
