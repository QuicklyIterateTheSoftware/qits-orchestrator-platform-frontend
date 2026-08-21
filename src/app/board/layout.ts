/**
 * Where the cards go, and where the lines between them run.
 *
 * Every function here is **pure**: nodes in, geometry out. That is deliberate and it is what makes
 * the board testable at all — the alternative, a component that reads the DOM and positions things
 * in the same breath, can only be asserted by rendering it in a browser that has a layout engine,
 * and jsdom is not one. Split this way the *arrangement* is asserted from plain arrays and only the
 * *measurement* needs a seam.
 */

/** The one thing the layout needs to know about a step: its id, and what it waits for. */
export interface GraphNode {
  readonly id: string;
  readonly dependsOn: readonly string[];
}

/** A box on the board, in the board's own coordinates. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where one step sits: which column, and how far down it. */
export interface Placement {
  readonly id: string;
  readonly column: number;
  readonly row: number;
}

/** One dependency, drawn as a line from the step that must finish to the step that waits. */
export interface Edge {
  readonly from: string;
  readonly to: string;
  readonly points: readonly Point[];
}

/**
 * The column each step belongs in: its **dependency depth**.
 *
 * Depth 0 is a step that waits for nothing; otherwise it is one more than the deepest thing it
 * waits for. So a column is "everything that could start at the same moment", which is the reading
 * the board exists to give — and every line therefore runs left to right, never backwards.
 *
 * Two defences, both for graphs a service could send and a reader would still have to look at:
 *
 * - **A dependency naming a step that is not here is ignored.** It contributes no depth rather than
 *   crashing the page, and it draws no line, because there is nothing to draw one to.
 * - **A cycle resolves rather than recursing forever.** A step already being visited counts as
 *   depth 0 for the step asking about it, so a cycle lands its members in adjacent columns and the
 *   board still renders. A cycle would be a defect in the process definition, and a blank page is
 *   the worst possible way to report one.
 */
export function depths(nodes: readonly GraphNode[]): ReadonlyMap<string, number> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const known = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (id: string): number => {
    const cached = known.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const node = byId.get(id);
    if (!node || visiting.has(id)) {
      return 0;
    }
    visiting.add(id);
    let depth = 0;
    for (const dependency of node.dependsOn ?? []) {
      if (byId.has(dependency)) {
        depth = Math.max(depth, depthOf(dependency) + 1);
      }
    }
    visiting.delete(id);
    known.set(id, depth);
    return depth;
  };

  for (const node of nodes) {
    depthOf(node.id);
  }
  return known;
}

/**
 * Every step placed, in **declaration order**.
 *
 * Order within a column is the order the service listed the steps in, and it is not sorted here:
 * that order is the process definition's own, it is the order the steps actually run in, and a
 * client that re-sorted by name would put `usage.after` above `usage.before` in the same column.
 */
export function placeSteps(nodes: readonly GraphNode[]): readonly Placement[] {
  const depth = depths(nodes);
  const filled: number[] = [];
  return nodes.map((node) => {
    const column = depth.get(node.id) ?? 0;
    const row = filled[column] ?? 0;
    filled[column] = row + 1;
    return { id: node.id, column, row };
  });
}

/** The steps of each column, left to right — what the template iterates over. */
export function columns<T extends GraphNode>(nodes: readonly T[]): readonly (readonly T[])[] {
  const placed = placeSteps(nodes);
  const byColumn: T[][] = [];
  placed.forEach((placement, index) => {
    (byColumn[placement.column] ??= []).push(nodes[index]);
  });
  // A column can only be empty if a deeper one is filled, which the depth rule forbids; the
  // fallback is here so a hole could never become an `undefined` in a template.
  return byColumn.map((column) => column ?? []);
}

/** Every dependency as a pair, dropping the ones naming a step that is not on the board. */
export function edgePairs(
  nodes: readonly GraphNode[],
): readonly { readonly from: string; readonly to: string }[] {
  const present = new Set(nodes.map((node) => node.id));
  return nodes.flatMap((node) =>
    (node.dependsOn ?? [])
      .filter((dependency) => present.has(dependency))
      .map((dependency) => ({ from: dependency, to: node.id })),
  );
}

/** Two rows count as the same row when their centres are within this many pixels. */
const ALIGNED_PX = 1.5;

/**
 * The line for one dependency: out of the right edge of the step that must finish, into the left
 * edge of the step that waits.
 *
 * **Straight when the two cards are level**, which on this board is the common case — a chain of
 * single dependencies lands in one row and reads as one arrow. **An elbow when they are not**: a
 * short horizontal stub out of the source, a vertical run at the midpoint of the gap between the
 * two columns, and a horizontal stub into the target. Both ends therefore leave and arrive
 * horizontally, which is what makes a line traceable back to the edge it came from when six of them
 * cross the same gap. A single diagonal would be shorter and unreadable at the point where it
 * matters, which is where several lines converge on one card.
 */
export function edgePoints(from: Rect, to: Rect): readonly Point[] {
  const start = { x: from.x + from.width, y: from.y + from.height / 2 };
  const end = { x: to.x, y: to.y + to.height / 2 };
  if (Math.abs(start.y - end.y) <= ALIGNED_PX) {
    return [start, end];
  }
  const bend = start.x + (end.x - start.x) / 2;
  return [start, { x: bend, y: start.y }, { x: bend, y: end.y }, end];
}

/** Every line the overlay draws, for the cards that have actually been measured. */
export function edges(
  nodes: readonly GraphNode[],
  rects: ReadonlyMap<string, Rect>,
): readonly Edge[] {
  return edgePairs(nodes).flatMap(({ from, to }) => {
    const source = rects.get(from);
    const target = rects.get(to);
    return source && target ? [{ from, to, points: edgePoints(source, target) }] : [];
  });
}

/** The `points` attribute of an SVG polyline, rounded to a tenth of a pixel. */
export function polylinePoints(points: readonly Point[]): string {
  return points.map((point) => `${round(point.x)},${round(point.y)}`).join(' ');
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
