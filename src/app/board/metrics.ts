import { Injectable } from '@angular/core';
import type { Rect } from './layout';

/** Where every card ended up, and how big the board around them is. */
export interface BoardMeasurement {
  readonly width: number;
  readonly height: number;
  readonly cards: ReadonlyMap<string, Rect>;
}

/** Nothing measured yet — what the overlay draws before the first render has happened. */
export const NO_MEASUREMENT: BoardMeasurement = { width: 0, height: 0, cards: new Map() };

/** The attribute a card carries so it can be found and measured by step id. */
export const STEP_ATTRIBUTE = 'data-step-id';

/**
 * The only part of the board that talks to the browser: reading laid-out boxes, and being told when
 * they move.
 *
 * **It is a class, injected, for one reason: a spec needs to stand in for it.** Card positions come
 * from `getBoundingClientRect`, and jsdom answers every one of those calls with zeros — it parses
 * CSS but lays nothing out. So a spec asserting "the line runs from this card's right edge to that
 * card's left edge" against the real DOM would assert that 0 equals 0 and pass whatever the code
 * did. Provided as a stub with rectangles a test wrote itself, the geometry is asserted for real.
 *
 * It is a seam, never a `vi.mock`: the platform's vitest lesson records what module patching costs
 * — a shared registry mutated by one spec file changes what another sees, and green starts
 * depending on the order the files ran in.
 */
@Injectable({ providedIn: 'root' })
export class BoardMetrics {
  /**
   * Every card's box, in the board's own coordinates rather than the viewport's.
   *
   * Board-relative is what lets the SVG overlay sit inside the board with `position: absolute` and
   * stay right through a scroll: viewport coordinates would be correct for exactly one scroll
   * offset.
   */
  measure(host: HTMLElement): BoardMeasurement {
    const origin = host.getBoundingClientRect();
    const cards = new Map<string, Rect>();
    for (const element of Array.from(host.querySelectorAll<HTMLElement>(`[${STEP_ATTRIBUTE}]`))) {
      const id = element.getAttribute(STEP_ATTRIBUTE);
      if (!id) {
        continue;
      }
      const box = element.getBoundingClientRect();
      cards.set(id, {
        x: box.left - origin.left + host.scrollLeft,
        y: box.top - origin.top + host.scrollTop,
        width: box.width,
        height: box.height,
      });
    }
    return { width: host.scrollWidth, height: host.scrollHeight, cards };
  }

  /**
   * Call `onChange` whenever the cards may have moved, until the returned function is called.
   *
   * Both sources are needed and neither is enough. `ResizeObserver` catches the board's own size
   * changing — a card growing a second line of summary, the detail panel opening below — and the
   * window's `resize` catches a re-flow that leaves the board the same size while moving what is
   * inside it. `ResizeObserver` is behind a `typeof` guard because jsdom has not always had one,
   * and a board that threw on construction would take the whole page with it.
   */
  observe(host: HTMLElement, onChange: () => void): () => void {
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => onChange());
    observer?.observe(host);
    const onResize = () => onChange();
    window.addEventListener('resize', onResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }
}
