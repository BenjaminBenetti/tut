import type { Direction } from "../../../core/model/direction";
import type { Rect } from "../../../core/model/grid";
import type { Rng } from "../../../core/model/rng";
import type {
  ArchitecturalFloorPlan,
  ArchitecturalPlan,
  ArchitecturalStyle,
  PlannedPartition,
  PlannedRoom,
} from "../../model/architectural-plan";
import type { Entrance, Room } from "../../model/building";
import { RoomKindIds } from "../../data/room-kind-ids";

// ===========================================
// Local architectural vocabulary
// ===========================================

/** Regions are authored with the entrance at z=0, before rotation to the facade. */
interface LocalFloorPlan {
  readonly rooms: readonly PlannedRoom[];
  readonly connections: readonly RoomConnection[];
}

/** A public opening, a private door, or an entirely open shared boundary. */
interface RoomConnection {
  readonly a: string;
  readonly b: string;
  readonly kind: "door" | "opening" | "open";
}

/** Dimensions measured across the frontage and away from it. */
interface PlanContext {
  readonly width: number;
  readonly depth: number;
  readonly entry: number;
  readonly corridorWidth: number;
  readonly policy: ArchitecturalPlan;
  readonly rng: Rng;
}

type Planner = (context: PlanContext) => LocalFloorPlan;

const PLANNERS: Readonly<Record<ArchitecturalStyle, Planner>> = {
  retail: retailPlan,
  workplace: workplacePlan,
  residential: residentialPlan,
  industrial: industrialPlan,
};

// ===========================================
// Reusable entrance-oriented layout
// ===========================================

/**
 * Designs one building in facade-local coordinates and rotates the whole
 * arrangement, including doorways, into map space. Every floor reuses it:
 * private partitions stack, and the stair planner finds matching landings.
 */
export function planArchitecturalFloor(
  footprint: Rect,
  entrance: Entrance,
  policy: ArchitecturalPlan,
  corridorWidth: number,
  rng: Rng,
): ArchitecturalFloorPlan | undefined {
  const horizontal = entrance.side === "n" || entrance.side === "s";
  const width = horizontal ? footprint.w : footprint.d;
  const depth = horizontal ? footprint.d : footprint.w;
  if (width < 6 || depth < 6) return undefined;
  // A deep public hall still needs a real service room behind it. Compact
  // lots use the generic partitioner instead of overlapping zero-depth rooms.
  if (
    policy.style === "retail" &&
    depth < policy.minimumPublicDepth + policy.serviceDepth.min
  )
    return undefined;
  if (
    policy.style === "industrial" &&
    (width < 2 * policy.serviceWidth.min + 4 ||
      depth < policy.minimumPublicDepth + 2)
  )
    return undefined;
  const entry = horizontal
    ? entrance.tile.x - footprint.x
    : entrance.tile.z - footprint.z;
  const local = PLANNERS[policy.style]({
    width,
    depth,
    entry,
    policy,
    corridorWidth,
    rng,
  });
  const partitions = partitionsFor(local, rng.fork("doorways"));
  return {
    rooms: local.rooms.map((room) => ({
      ...room,
      rect: rotateRect(room.rect, footprint, entrance.side),
    })),
    partitions: partitions.map((partition) => ({
      ...rotatePoint(partition.x, partition.z, footprint, entrance.side),
      side: rotateSide(partition.side, entrance.side),
      ...(partition.kind === undefined ? {} : { kind: partition.kind }),
    })),
  };
}

// ===========================================
// Distinct building organisations
// ===========================================

/** Broad sales floor with shallow, independently accessible rear service rooms. */
function retailPlan({
  width,
  depth,
  policy,
  rng,
}: PlanContext): LocalFloorPlan {
  const rear = Math.min(
    rng.nextInt(policy.serviceDepth.min, policy.serviceDepth.max),
    depth - policy.minimumPublicDepth,
  );
  const front = depth - rear;
  const rooms = [region("arrival", 0, 0, width, front, "arrival")];
  const connections: RoomConnection[] = [];
  const count = width >= 2 * policy.serviceWidth.min ? 2 : 1;
  const cut =
    count === 2
      ? rng.nextInt(policy.serviceWidth.min, width - policy.serviceWidth.min)
      : width;
  for (let index = 0; index < count; index++) {
    const x = index === 0 ? 0 : cut;
    const w = index === 0 ? cut : width - cut;
    const id = `service-${index}`;
    rooms.push(region(id, x, front, w, rear, "service"));
    connections.push({ a: "arrival", b: id, kind: "door" });
  }
  return { rooms, connections };
}

/** Open workfloor beside a reception and a short row of enclosed support rooms. */
function workplacePlan({
  width,
  depth,
  entry,
  policy,
  rng,
}: PlanContext): LocalFloorPlan {
  const onLeft = entry < width / 2;
  const needed = onLeft ? entry + 1 : width - entry;
  const blockWidth = Math.min(
    width - 3,
    Math.max(
      needed,
      rng.nextInt(policy.serviceWidth.min, policy.serviceWidth.max),
    ),
  );
  const blockX = onLeft ? 0 : width - blockWidth;
  const mainX = onLeft ? blockWidth : 0;
  const front = Math.min(
    depth - 3,
    rng.nextInt(policy.serviceDepth.min, policy.serviceDepth.max),
  );
  const rooms = [
    region("arrival", blockX, 0, blockWidth, front, "arrival"),
    {
      ...region("main", mainX, 0, width - blockWidth, depth, "main"),
      layoutSlot: "workfloor",
    },
  ];
  const connections: RoomConnection[] = [
    { a: "arrival", b: "main", kind: "opening" },
  ];
  const rear = depth - front;
  const count = rear >= 6 ? 2 : 1;
  const cut = count === 2 ? Math.floor(rear / 2) : rear;
  for (let index = 0; index < count; index++) {
    const z = front + (index === 0 ? 0 : cut);
    const d = index === 0 ? cut : rear - cut;
    const id = `service-${index}`;
    rooms.push(region(id, blockX, z, blockWidth, d, "service"));
    connections.push({ a: "main", b: id, kind: "door" });
  }
  return { rooms, connections };
}

/**
 * Public living/kitchen rooms open onto each other at the front; a short
 * hall behind them serves private rooms without crossing a bedroom.
 *
 *   entrance
 *   +----------+----+
 *   | living   :kit |    : broad opening
 *   +-----+  +-+----+
 *   | bed D  D bath |    D private doorway
 *   +-----+--+------+
 */
function residentialPlan({
  width,
  depth,
  entry,
  corridorWidth,
  policy,
  rng,
}: PlanContext): LocalFloorPlan {
  const front = Math.min(
    depth - 3,
    rng.nextInt(policy.serviceDepth.min, policy.serviceDepth.max),
  );
  const kitchenWidth = Math.min(
    width - 3,
    rng.nextInt(policy.serviceWidth.min, policy.serviceWidth.max),
  );
  const kitchenLeft = entry >= width / 2;
  const kitchenX = kitchenLeft ? 0 : width - kitchenWidth;
  const livingX = kitchenLeft ? kitchenWidth : 0;
  const livingWidth = width - kitchenWidth;
  const hallWidth = width >= 8 ? Math.max(1, Math.min(2, corridorWidth)) : 1;
  const hallX = Math.max(
    2,
    Math.min(
      width - hallWidth - 2,
      livingX + livingWidth - hallWidth,
      Math.max(livingX, Math.floor((width - hallWidth) / 2)),
    ),
  );
  const rear = depth - front;
  const rooms = [
    region("arrival", livingX, 0, livingWidth, front, "arrival"),
    {
      ...region("kitchen", kitchenX, 0, kitchenWidth, front, "service"),
      layoutSlot: "kitchen",
    },
    {
      ...region("hall", hallX, front, hallWidth, rear),
      kind: RoomKindIds.CORRIDOR,
    },
  ];
  const connections: RoomConnection[] = [
    { a: "arrival", b: "kitchen", kind: "opening" },
    { a: "arrival", b: "hall", kind: "open" },
  ];
  for (const [side, x, w] of [
    ["left", 0, hallX],
    ["right", hallX + hallWidth, width - hallX - hallWidth],
  ] as const) {
    const count = rear >= 6 && rng.chance(0.6) ? 2 : 1;
    const cut = count === 2 ? Math.floor(rear / 2) : rear;
    for (let index = 0; index < count; index++) {
      const id = `${side}-${index}`;
      rooms.push(
        region(
          id,
          x,
          front + (index === 0 ? 0 : cut),
          w,
          index === 0 ? cut : rear - cut,
          "service",
        ),
      );
      connections.push({ a: "hall", b: id, kind: "door" });
    }
  }
  const principal = rooms
    .filter((room) => room.id.startsWith("left") || room.id.startsWith("right"))
    .sort((a, b) => area(b.rect) - area(a.rect))[0];
  return {
    rooms: rooms.map((room) =>
      room.id === principal?.id
        ? { ...room, layoutRole: "main", layoutSlot: "bedroom" }
        : room,
    ),
    connections,
  };
}

/** A largely open L-shaped warehouse floor wraps a compact rear service block. */
function industrialPlan({
  width,
  depth,
  policy,
  rng,
}: PlanContext): LocalFloorPlan {
  const rear = Math.min(
    depth - policy.minimumPublicDepth,
    rng.nextInt(policy.serviceDepth.min, policy.serviceDepth.max),
  );
  const front = depth - rear;
  const blockWidth = Math.min(
    width - 4,
    2 * rng.nextInt(policy.serviceWidth.min, policy.serviceWidth.max),
  );
  const onLeft = rng.chance(0.5);
  const blockX = onLeft ? 0 : width - blockWidth;
  const mainX = onLeft ? blockWidth : 0;
  const rooms = [
    region("arrival", 0, 0, width, front, "arrival"),
    region("main", mainX, front, width - blockWidth, rear, "main"),
  ];
  const connections: RoomConnection[] = [
    { a: "arrival", b: "main", kind: "open" },
  ];
  const cut = Math.floor(blockWidth / 2);
  for (let index = 0; index < 2; index++) {
    const id = `service-${index}`;
    rooms.push(
      region(
        id,
        blockX + (index === 0 ? 0 : cut),
        front,
        index === 0 ? cut : blockWidth - cut,
        rear,
        "service",
      ),
    );
    connections.push({ a: "arrival", b: id, kind: "door" });
  }
  return { rooms, connections };
}

// ===========================================
// Partition geometry
// ===========================================

/** Walls separate adjoining regions except for explicitly planned connections. */
function partitionsFor(plan: LocalFloorPlan, rng: Rng): PlannedPartition[] {
  const partitions: PlannedPartition[] = [];
  for (let a = 0; a < plan.rooms.length; a++)
    for (let b = a + 1; b < plan.rooms.length; b++) {
      const first = plan.rooms[a];
      const second = plan.rooms[b];
      if (first === undefined || second === undefined) continue;
      const edge = sharedBoundary(first.rect, second.rect);
      if (edge.length === 0) continue;
      const connection = plan.connections.find(
        (item) =>
          (item.a === first.id && item.b === second.id) ||
          (item.a === second.id && item.b === first.id),
      );
      const openingWidth =
        connection?.kind === "open"
          ? edge.length
          : connection?.kind === "opening"
            ? Math.min(2, edge.length)
            : 1;
      const margin = edge.length >= openingWidth + 2 ? 1 : 0;
      const start = rng.nextInt(margin, edge.length - openingWidth - margin);
      edge.forEach((segment, index) => {
        const open =
          connection !== undefined &&
          index >= start &&
          index < start + openingWidth;
        const kind = open
          ? connection.kind === "door"
            ? "door"
            : undefined
          : "solid";
        partitions.push({
          ...segment,
          ...(kind === undefined ? {} : { kind }),
        });
      });
    }
  return partitions;
}

/** Shared tile edges between disjoint, axis-aligned room rectangles. */
function sharedBoundary(a: Rect, b: Rect): PlannedPartition[] {
  const edge: PlannedPartition[] = [];
  const xStart = Math.max(a.x, b.x);
  const xEnd = Math.min(a.x + a.w, b.x + b.w);
  const zStart = Math.max(a.z, b.z);
  const zEnd = Math.min(a.z + a.d, b.z + b.d);
  if (a.x + a.w === b.x || b.x + b.w === a.x) {
    const side = a.x < b.x ? "e" : "w";
    for (let z = zStart; z < zEnd; z++)
      edge.push({ x: side === "e" ? a.x + a.w - 1 : a.x, z, side });
  }
  if (a.z + a.d === b.z || b.z + b.d === a.z) {
    const side = a.z < b.z ? "s" : "n";
    for (let x = xStart; x < xEnd; x++)
      edge.push({ x, z: side === "s" ? a.z + a.d - 1 : a.z, side });
  }
  return edge;
}

/** Constructs a region without changing its plain-data optional fields. */
function region(
  id: string,
  x: number,
  z: number,
  w: number,
  d: number,
  layoutRole?: Room["layoutRole"],
): PlannedRoom {
  return {
    id,
    rect: { x, z, w, d },
    ...(layoutRole === undefined ? {} : { layoutRole }),
  };
}

/** Area used to identify the principal private room. */
function area(rect: Rect): number {
  return rect.w * rect.d;
}

/** Maps a facade-local tile into the building's map-space footprint. */
function rotatePoint(
  x: number,
  z: number,
  footprint: Rect,
  side: Direction,
): { x: number; z: number } {
  switch (side) {
    case "n":
      return { x: footprint.x + x, z: footprint.z + z };
    case "s":
      return { x: footprint.x + x, z: footprint.z + footprint.d - z - 1 };
    case "w":
      return { x: footprint.x + z, z: footprint.z + x };
    case "e":
      return { x: footprint.x + footprint.w - z - 1, z: footprint.z + x };
  }
}

/** Converts local room bounds, including reflected south and east frontages. */
function rotateRect(rect: Rect, footprint: Rect, side: Direction): Rect {
  const a = rotatePoint(rect.x, rect.z, footprint, side);
  const b = rotatePoint(
    rect.x + rect.w - 1,
    rect.z + rect.d - 1,
    footprint,
    side,
  );
  return {
    x: Math.min(a.x, b.x),
    z: Math.min(a.z, b.z),
    w: Math.abs(a.x - b.x) + 1,
    d: Math.abs(a.z - b.z) + 1,
  };
}

/** Transforms an interior edge's normal with the same facade mapping as its tile. */
function rotateSide(side: Direction, frontage: Direction): Direction {
  const mapped: Readonly<
    Record<Direction, Readonly<Record<Direction, Direction>>>
  > = {
    n: { n: "n", e: "e", s: "s", w: "w" },
    s: { n: "s", e: "e", s: "n", w: "w" },
    w: { n: "w", e: "s", s: "e", w: "n" },
    e: { n: "e", e: "s", s: "w", w: "n" },
  };
  return mapped[frontage][side];
}
