import { describe, expect, it } from "vitest";

import { GREAT_POD_TUNING } from "../../data/great-pod-tuning";
import type {
  GreatPodAxis,
  GreatPodLayout,
} from "../../model/great-pod-layout";
import type { ColumnCoord } from "../../model/road";
import { planGreatPod } from "./great-pod-planner";

// ===========================================
// Fixture
// ===========================================

/** The column the fixtures centre their pods on. */
const CENTRE: ColumnCoord = { x: 20, z: 20 };

/** The eight steps a unit may take, diagonals included. */
const STEPS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/** A column's key. */
function key(column: ColumnCoord): string {
  return `${String(column.x)}:${String(column.z)}`;
}

/** First Skyfall's pod on `axis`. */
function plan(axis: GreatPodAxis): GreatPodLayout {
  return planGreatPod(CENTRE, 2, axis, GREAT_POD_TUNING);
}

/** Every wall column of the plan. */
function walls(layout: GreatPodLayout): ColumnCoord[] {
  return [...layout.hull, ...layout.seams, ...layout.membrane, ...layout.ribs];
}

/**
 * The columns an eight-way walker reaches from `from` over the plan's
 * open columns (floor and apron) plus `opened`, never leaving the disc.
 * Eight-way on purpose: a diagonal gap in a wall would let it through.
 */
function flood(
  layout: GreatPodLayout,
  from: ColumnCoord,
  opened: readonly ColumnCoord[] = [],
): Set<string> {
  const open = new Set([...layout.floor, ...layout.apron, ...opened].map(key));
  const seen = new Set<string>([key(from)]);
  const queue: ColumnCoord[] = [from];
  for (const column of queue) {
    for (const [dx, dz] of STEPS) {
      const next = { x: column.x + dx, z: column.z + dz };
      if (!open.has(key(next)) || seen.has(key(next))) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}

/** The columns of the core's square. */
function coreSquare(layout: GreatPodLayout): ColumnCoord[] {
  const columns: ColumnCoord[] = [];
  for (let dz = 0; dz < layout.core.size; dz++) {
    for (let dx = 0; dx < layout.core.size; dx++) {
      columns.push({ x: layout.core.x + dx, z: layout.core.z + dz });
    }
  }
  return columns;
}

/** A column of the apron, outside the hull, due west of the centre. */
function outside(layout: GreatPodLayout): ColumnCoord {
  return { x: CENTRE.x - layout.discRadius, z: CENTRE.z };
}

/** The chamber of `id`. */
function chamber(layout: GreatPodLayout, id: string): ColumnCoord {
  const found = layout.chambers.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no chamber ${id}`);
  return found.centre;
}

// ===========================================
// Tests
// ===========================================

describe("planGreatPod", () => {
  it("sorts every column of the disc into exactly one part", () => {
    const layout = plan("ns");
    const parts = [
      layout.apron,
      layout.hull,
      layout.seams,
      layout.membrane,
      layout.ribs,
      layout.floor,
    ];
    const all = parts.flat().map(key);
    expect(new Set(all).size).toBe(all.length);
    const disc = layout.discRadius;
    let inside = 0;
    for (let dz = -disc; dz <= disc; dz++) {
      for (let dx = -disc; dx <= disc; dx++) {
        if (Math.hypot(dx, dz) <= disc + 0.5) inside++;
      }
    }
    expect(all.length).toBe(inside);
    // The mouths are floor, the verge apron.
    const floor = new Set(layout.floor.map(key));
    const apron = new Set(layout.apron.map(key));
    expect(layout.mouths.every((column) => floor.has(key(column)))).toBe(true);
    expect(layout.verge.every((column) => apron.has(key(column)))).toBe(true);
    // The core's square is floor for the mission to stand the core on.
    expect(coreSquare(layout).every((column) => floor.has(key(column)))).toBe(
      true,
    );
  });

  it.each<GreatPodAxis>(["ns", "ew"])(
    "seals the pod: nothing outside walks in, even diagonally (%s)",
    (axis) => {
      const layout = plan(axis);
      const reached = flood(layout, outside(layout));
      expect(layout.floor.filter((column) => reached.has(key(column)))).toEqual(
        [],
      );
    },
  );

  it.each<GreatPodAxis>(["ns", "ew"])(
    "puts the seams and the mouths on the axis, three wide on each side (%s)",
    (axis) => {
      const layout = plan(axis);
      const across = (column: ColumnCoord): number =>
        axis === "ns" ? column.x - CENTRE.x : column.z - CENTRE.z;
      expect(layout.seams.length).toBeGreaterThan(0);
      for (const column of [...layout.seams, ...layout.mouths]) {
        expect(Math.abs(across(column)), key(column)).toBeLessThanOrEqual(
          GREAT_POD_TUNING.mouthHalfWidth,
        );
      }
      // Three seam columns straight out from the core on each side.
      const along = (column: ColumnCoord): number =>
        axis === "ns" ? column.z - CENTRE.z : column.x - CENTRE.x;
      const ends = layout.seams.filter(
        (column) => Math.abs(along(column)) === GREAT_POD_TUNING.hullRadius,
      );
      expect(ends).toHaveLength(6);
      expect(layout.mouths.length).toBe(6);
    },
  );

  it.each<GreatPodAxis>(["ns", "ew"])(
    "opens a way to the core through either seam, and only the route chambers on it (%s)",
    (axis) => {
      const layout = plan(axis);
      const reached = flood(layout, outside(layout), layout.seams);
      expect(
        coreSquare(layout).every((column) => reached.has(key(column))),
      ).toBe(true);
      for (const room of layout.chambers) {
        const expected = room.role !== "side";
        expect(reached.has(key(room.centre)), room.id).toBe(expected);
      }
    },
  );

  it("seals each side chamber from the rest of the pod", () => {
    const layout = plan("ns");
    for (const id of ["pod-east", "pod-west"]) {
      const reached = flood(layout, chamber(layout, id));
      expect(reached.has(key(CENTRE)), id).toBe(false);
      for (const other of layout.chambers) {
        if (other.id === id) continue;
        expect(reached.has(key(other.centre)), `${id} → ${other.id}`).toBe(
          false,
        );
      }
    }
  });

  it("leaves a two-wide way from each seam to the core, for a brute or a pair of mechs abreast", () => {
    const layout = plan("ns");
    const open = new Set([...layout.floor, ...layout.seams].map(key));
    const fits = (x: number, z: number): boolean =>
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].every(([dx, dz]) => open.has(key({ x: x + dx!, z: z + dz! })));
    // A 2×2 block flood from just inside the north seam.
    const start = {
      x: CENTRE.x - 1,
      z: CENTRE.z - GREAT_POD_TUNING.hullRadius,
    };
    expect(fits(start.x, start.z)).toBe(true);
    const seen = new Set([key(start)]);
    const queue = [start];
    for (const block of queue) {
      for (const [dx, dz] of STEPS) {
        const next = { x: block.x + dx, z: block.z + dz };
        if (seen.has(key(next)) || !fits(next.x, next.z)) continue;
        seen.add(key(next));
        queue.push(next);
      }
    }
    // The block gets up against the core's north face.
    expect(seen.has(key({ x: CENTRE.x - 1, z: layout.core.z - 2 }))).toBe(true);
  });

  it("leaves room by the core for a whole squad and a chamber's brood in each room", () => {
    const layout = plan("ew");
    const core = new Set(coreSquare(layout).map(key));
    const coreRoom = layout.floor.filter(
      (column) =>
        !core.has(key(column)) &&
        Math.hypot(column.x - CENTRE.x, column.z - CENTRE.z) <=
          GREAT_POD_TUNING.membraneRadius + 0.5,
    );
    expect(coreRoom.length).toBeGreaterThanOrEqual(16);
    for (const id of ["pod-north", "pod-east", "pod-south", "pod-west"]) {
      const room = flood(layout, chamber(layout, id));
      const floor = new Set(layout.floor.map(key));
      const own = [...room].filter((column) => floor.has(column));
      expect(own.length, id).toBeGreaterThanOrEqual(12);
    }
  });

  it("names the axis chambers route and the others side, round a core chamber", () => {
    const roles = (axis: GreatPodAxis): Record<string, string> =>
      Object.fromEntries(
        plan(axis).chambers.map((room) => [room.id, room.role]),
      );
    expect(roles("ns")).toEqual({
      "pod-core": "core",
      "pod-north": "route",
      "pod-south": "route",
      "pod-east": "side",
      "pod-west": "side",
    });
    expect(roles("ew")).toMatchObject({
      "pod-north": "side",
      "pod-east": "route",
    });
    const layout = plan("ns");
    const floor = new Set(layout.floor.map(key));
    for (const room of layout.chambers) {
      expect(floor.has(key(room.centre)), room.id).toBe(true);
    }
  });

  it("is the same plan for the same inputs, and every wall is inside the hull", () => {
    expect(plan("ns")).toEqual(plan("ns"));
    for (const column of walls(plan("ew"))) {
      expect(
        Math.hypot(column.x - CENTRE.x, column.z - CENTRE.z),
      ).toBeLessThanOrEqual(GREAT_POD_TUNING.hullRadius + 0.5);
    }
  });
});
