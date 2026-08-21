import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { RunStepDto, StepStatus } from '../api/dto';
import { QITS_SCHEDULER, type QitsScheduler } from '../ui/scheduler';
import { FlowBoard } from './flow-board';
import type { Rect } from './layout';
import { BoardMetrics, type BoardMeasurement } from './metrics';

/**
 * The board with the browser taken out of it.
 *
 * **jsdom lays nothing out**, so every `getBoundingClientRect` in it answers zero and a spec run
 * against the real `BoardMetrics` would assert that 0 equals 0 and pass whatever the code did.
 * Standing in for that one class — the seam it exists to be — puts real rectangles behind the
 * cards, and the wires become assertable geometry.
 *
 * It is a provider swap and never a `vi.mock`: the platform's vitest lesson records what module
 * patching costs, and a `TestBed` provider is scoped to the test that asked for it.
 */
@Injectable()
class StubMetrics extends BoardMetrics {
  /** Two columns of one card each, 100×40, with a 100px gap — chosen so the sums are readable. */
  static rects: ReadonlyMap<string, Rect> = new Map();

  override measure(): BoardMeasurement {
    return { width: 300, height: 200, cards: StubMetrics.rects };
  }

  override observe(): () => void {
    return () => undefined;
  }
}

/** A clock nothing waits for: the board's ticking durations must not start a real interval. */
const NOOP_SCHEDULER: QitsScheduler = {
  every: () => () => undefined,
  now: () => Date.parse('2026-08-21T10:00:30Z'),
};

describe('FlowBoard', () => {
  const step = (id: string, status: StepStatus, over: Partial<RunStepDto> = {}): RunStepDto => ({
    id,
    name: id,
    target: 'containers',
    dependsOn: [],
    status,
    startedAt: '2026-08-21T10:00:00Z',
    finishedAt: '2026-08-21T10:00:12Z',
    httpStatus: 200,
    request: { method: 'POST', url: 'http://dev-qits-containers:8080/containers/api/gc/images' },
    response: null,
    error: null,
    summary: `${id} did something`,
    ...over,
  });

  beforeEach(() => {
    StubMetrics.rects = new Map<string, Rect>([
      ['a', { x: 0, y: 0, width: 100, height: 40 }],
      ['b', { x: 200, y: 0, width: 100, height: 40 }],
    ]);
    TestBed.configureTestingModule({
      providers: [
        { provide: BoardMetrics, useClass: StubMetrics },
        { provide: QITS_SCHEDULER, useValue: NOOP_SCHEDULER },
      ],
    });
  });

  async function board(steps: readonly RunStepDto[]): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(FlowBoard);
    fixture.componentRef.setInput('steps', steps);
    await fixture.whenStable();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws one card per step, in columns by dependency depth', async () => {
    const element = await board([
      step('a', 'SUCCEEDED'),
      step('b', 'RUNNING', { dependsOn: ['a'] }),
    ]);

    const columns = element.querySelectorAll('.column');
    expect(columns).toHaveLength(2);
    expect(columns[0].querySelectorAll('.card')).toHaveLength(1);
    expect(element.querySelectorAll('[data-step-id]')).toHaveLength(2);
  });

  /** The measured half: a wire runs from the source's right edge to the target's left edge. */
  it('wires each card to the cards that depend on it, from the measured boxes', async () => {
    const element = await board([
      step('a', 'SUCCEEDED'),
      step('b', 'PENDING', { dependsOn: ['a'] }),
    ]);

    const wires = element.querySelectorAll('polyline');
    expect(wires).toHaveLength(1);
    expect(wires[0].getAttribute('points')).toBe('100,20 200,20');
  });

  it('bends the wire when the two cards are not on the same row', async () => {
    StubMetrics.rects = new Map<string, Rect>([
      ['a', { x: 0, y: 0, width: 100, height: 40 }],
      ['b', { x: 200, y: 100, width: 100, height: 40 }],
    ]);

    const element = await board([
      step('a', 'SUCCEEDED'),
      step('b', 'PENDING', { dependsOn: ['a'] }),
    ]);

    expect(element.querySelector('polyline')?.getAttribute('points')).toBe(
      '100,20 150,20 150,120 200,120',
    );
  });

  it('gives each status the tone that says what it is', async () => {
    const element = await board([
      step('a', 'PENDING'),
      step('b', 'RUNNING'),
      step('c', 'SUCCEEDED'),
      step('d', 'FAILED'),
      step('e', 'SKIPPED'),
    ]);

    const badges = Array.from(element.querySelectorAll('qits-badge span')).map(
      (badge) => badge.className,
    );
    expect(badges[0]).toContain('warning');
    expect(badges[1]).toContain('warning');
    expect(badges[2]).toContain('success');
    expect(badges[3]).toContain('danger');
    expect(badges[4]).toContain('neutral');
  });

  it('colours a card’s rail to match its status, and pulses only the running one', async () => {
    const element = await board([step('a', 'FAILED'), step('b', 'RUNNING')]);

    const cards = element.querySelectorAll<HTMLElement>('.card');
    expect(cards[0].style.borderLeftColor).toBe('rgb(220, 38, 38)');
    expect(cards[0].classList.contains('card-running')).toBe(false);
    expect(cards[1].classList.contains('card-running')).toBe(true);
  });

  it('shows the call as a method and a path, without the peer’s host', async () => {
    const element = await board([step('a', 'SUCCEEDED')]);

    expect(element.querySelector('.card-call')?.textContent).toBe('POST /containers/api/gc/images');
  });

  it('computes the duration rather than waiting to be told it', async () => {
    const element = await board([step('a', 'SUCCEEDED')]);

    expect(element.textContent).toContain('12s');
  });

  it('reports the card that was clicked', async () => {
    const fixture = TestBed.createComponent(FlowBoard);
    fixture.componentRef.setInput('steps', [step('a', 'SUCCEEDED'), step('b', 'FAILED')]);
    const picked: string[] = [];
    fixture.componentInstance.stepPicked.subscribe((id: string) => picked.push(id));
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.card')[1].click();

    expect(picked).toEqual(['b']);
  });

  it('answers the keyboard, because the card is a button in all but tag', async () => {
    const fixture = TestBed.createComponent(FlowBoard);
    fixture.componentRef.setInput('steps', [step('a', 'SUCCEEDED')]);
    const picked: string[] = [];
    fixture.componentInstance.stepPicked.subscribe((id: string) => picked.push(id));
    await fixture.whenStable();

    const card = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.card');
    card?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(picked).toEqual(['a']);
  });
});
