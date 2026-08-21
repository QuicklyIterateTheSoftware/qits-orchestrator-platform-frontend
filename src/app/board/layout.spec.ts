import {
  columns,
  depths,
  edgePairs,
  edgePoints,
  edges,
  placeSteps,
  polylinePoints,
  type GraphNode,
  type Rect,
} from './layout';

/**
 * The board's arrangement, asserted as arithmetic rather than as pixels.
 *
 * This is the file the board's whole design exists for: splitting "which column" (pure) from "where
 * exactly" (measured) is what makes the first half assertable at all, because jsdom lays nothing
 * out and would answer every real measurement with a zero.
 *
 * The graph used throughout is the gc process's own, from `qits-orchestrator-plan.md`.
 */
describe('board layout', () => {
  const node = (id: string, ...dependsOn: string[]): GraphNode => ({ id, dependsOn });

  const GC: readonly GraphNode[] = [
    node('usage.before'),
    node('pins.deployments'),
    node('pins.ci'),
    node('artifacts.plan', 'pins.deployments', 'pins.ci'),
    node('artifacts.sweep', 'artifacts.plan'),
    node('containers.images', 'pins.deployments'),
    node('containers.volumes', 'usage.before'),
    node('containers.build-cache', 'containers.images'),
    node(
      'usage.after',
      'artifacts.sweep',
      'containers.images',
      'containers.volumes',
      'containers.build-cache',
    ),
  ];

  const rect = (x: number, y: number, width = 100, height = 40): Rect => ({ x, y, width, height });

  describe('depth', () => {
    it('puts everything that waits for nothing in the first column', () => {
      const depth = depths(GC);

      expect(depth.get('usage.before')).toBe(0);
      expect(depth.get('pins.deployments')).toBe(0);
      expect(depth.get('pins.ci')).toBe(0);
    });

    it('puts a step one past the deepest thing it waits for', () => {
      const depth = depths(GC);

      expect(depth.get('artifacts.plan')).toBe(1);
      expect(depth.get('artifacts.sweep')).toBe(2);
      expect(depth.get('containers.images')).toBe(1);
      expect(depth.get('containers.volumes')).toBe(1);
      expect(depth.get('containers.build-cache')).toBe(2);
      // Its deepest dependency is artifacts.sweep at 2 — not containers.volumes at 1.
      expect(depth.get('usage.after')).toBe(3);
    });

    it('ignores a dependency naming a step that is not on the board', () => {
      const depth = depths([node('a'), node('b', 'a', 'ghost')]);

      expect(depth.get('b')).toBe(1);
    });

    /**
     * A cycle would be a defect in the process definition; a blank page is a worse report of it.
     * The recursion is cut where it repeats, so the members land in adjacent columns and every step
     * still gets one — which is all the board needs to render and say so.
     */
    it('resolves a cycle instead of recursing forever', () => {
      const depth = depths([node('a', 'b'), node('b', 'a')]);

      expect(depth.size).toBe(2);
      expect(depth.get('b')).toBe(1);
      expect(depth.get('a')).toBe(2);
    });
  });

  describe('placement', () => {
    it('keeps declaration order within a column', () => {
      const placed = placeSteps(GC);
      const first = placed.filter((placement) => placement.column === 0);

      expect(first.map((placement) => placement.id)).toEqual([
        'usage.before',
        'pins.deployments',
        'pins.ci',
      ]);
      expect(first.map((placement) => placement.row)).toEqual([0, 1, 2]);
    });

    it('groups the steps into left-to-right columns', () => {
      expect(columns(GC).map((column) => column.map((step) => step.id))).toEqual([
        ['usage.before', 'pins.deployments', 'pins.ci'],
        ['artifacts.plan', 'containers.images', 'containers.volumes'],
        ['artifacts.sweep', 'containers.build-cache'],
        ['usage.after'],
      ]);
    });

    it('draws nothing at all for an empty run', () => {
      expect(columns([])).toEqual([]);
      expect(edgePairs([])).toEqual([]);
    });
  });

  describe('wires', () => {
    it('names one pair per dependency, from the step that must finish', () => {
      expect(edgePairs([node('a'), node('b', 'a'), node('c', 'a', 'b')])).toEqual([
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'c' },
      ]);
    });

    it('drops a dependency on a step that is not being drawn', () => {
      expect(edgePairs([node('b', 'ghost')])).toEqual([]);
    });

    it('runs a straight line between two cards on the same row', () => {
      // Both centres at y=20, so there is nothing to bend around.
      expect(edgePoints(rect(0, 0), rect(200, 0))).toEqual([
        { x: 100, y: 20 },
        { x: 200, y: 20 },
      ]);
    });

    /** Both ends leave and arrive horizontally, which is what keeps six lines across one gap
        traceable back to the card they came from. */
    it('bends at the middle of the gap when the cards are on different rows', () => {
      expect(edgePoints(rect(0, 0), rect(200, 100))).toEqual([
        { x: 100, y: 20 },
        { x: 150, y: 20 },
        { x: 150, y: 120 },
        { x: 200, y: 120 },
      ]);
    });

    it('leaves the right edge of the source and arrives at the left edge of the target', () => {
      const [start, ...rest] = edgePoints(rect(10, 10, 80, 60), rect(300, 10, 80, 60));
      expect(start).toEqual({ x: 90, y: 40 });
      expect(rest.at(-1)).toEqual({ x: 300, y: 40 });
    });

    it('draws only the wires whose two cards have both been measured', () => {
      const rects = new Map<string, Rect>([
        ['a', rect(0, 0)],
        ['b', rect(200, 0)],
      ]);

      const drawn = edges([node('a'), node('b', 'a'), node('c', 'a')], rects);

      expect(drawn.map((edge) => `${edge.from}>${edge.to}`)).toEqual(['a>b']);
    });

    it('renders a polyline’s points rounded to a tenth of a pixel', () => {
      expect(
        polylinePoints([
          { x: 1.04, y: 2.06 },
          { x: 3, y: 4 },
        ]),
      ).toBe('1,2.1 3,4');
    });
  });
});
