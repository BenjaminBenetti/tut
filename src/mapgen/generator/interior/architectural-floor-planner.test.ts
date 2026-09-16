import { describe, expect, it } from "vitest";
import { DIRECTIONS, type Direction } from "../../../core/model/direction";
import {
  oppositeDirection,
  rectContains,
  stepGridPos,
} from "../../../core/service/grid-math";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { BUILDING_TEMPLATES } from "../../data/building-templates";
import { BUILDING_ROOM_PROGRAMS } from "../../data/building-room-programs";
import type { KnownBuildingKindId } from "../../data/building-kind-ids";
import { SurfaceIds } from "../../data/surfaces";
import type { Entrance } from "../../model/building";
import { MapDraft } from "../../model/map-draft";
import { unreachableInteriorTiles } from "./building-reachability";
import { partitionFloor, planFloor } from "./room-partitioner";
import { assignRoomPurposes } from "./room-programmer";

/** An enclosed shell, with its door halfway along the requested facade. */
function fixture(
  kind: KnownBuildingKindId,
  side: Direction,
  w: number,
  d: number,
  seed: number,
) {
  const draft = new MapDraft(
    w + 4,
    d + 4,
    new SequentialIdGenerator(),
    SurfaceIds.GRASS,
  );
  const footprint = { x: 2, z: 2, w, d };
  const entrance: Entrance = {
    tile: {
      x: side === "w" ? 2 : side === "e" ? w + 1 : 2 + Math.floor(w / 2),
      y: 0,
      z: side === "n" ? 2 : side === "s" ? d + 1 : 2 + Math.floor(d / 2),
    },
    side,
  };
  for (let z = 2; z < d + 2; z++)
    for (let x = 2; x < w + 2; x++) {
      const tile = { x, y: 0, z };
      draft.addTile({
        ...tile,
        surface: SurfaceIds.FLOOR,
        buildingId: "building",
      });
      if (x === 2) draft.setWall(tile, "w", "solid");
      if (x === w + 1) draft.setWall(tile, "e", "solid");
      if (z === 2) draft.setWall(tile, "n", "solid");
      if (z === d + 1) draft.setWall(tile, "s", "solid");
    }
  draft.setWall(entrance.tile, entrance.side, "door");
  const rng = new Mulberry32Rng(seed);
  const plan = planFloor(
    footprint,
    BUILDING_TEMPLATES[kind].interior,
    rng.fork("plan"),
    entrance,
  );
  const rooms = partitionFloor(
    draft,
    "building",
    0,
    0,
    footprint,
    plan,
    rng.fork("rooms"),
  );
  return { draft, footprint, entrance, plan, rooms };
}

describe("architectural floor plans", () => {
  it("covers every tile exactly once and keeps all rooms connected on every facade", () => {
    for (const kind of Object.keys(
      BUILDING_TEMPLATES,
    ) as KnownBuildingKindId[]) {
      for (const side of DIRECTIONS)
        for (const [w, d] of [
          [6, 6],
          [7, 6],
          [10, 8],
          [14, 12],
        ])
          for (let seed = 0; seed < 5; seed++) {
            const { draft, rooms, entrance } = fixture(
              kind,
              side,
              w!,
              d!,
              seed,
            );
            const cells = new Set<string>();
            for (const room of rooms) {
              expect(room.rect.w, `${kind}/${side}`).toBeGreaterThanOrEqual(1);
              expect(room.rect.d, `${kind}/${side}`).toBeGreaterThanOrEqual(1);
              for (let z = room.rect.z; z < room.rect.z + room.rect.d; z++)
                for (let x = room.rect.x; x < room.rect.x + room.rect.w; x++) {
                  const key = `${x},${z}`;
                  expect(
                    cells.has(key),
                    `${kind}/${side}/${seed} duplicate ${key}`,
                  ).toBe(false);
                  cells.add(key);
                  expect(draft.getTile({ x, y: 0, z })?.roomId).toBe(room.id);
                }
            }
            expect(cells.size).toBe(w! * d!);
            expect(
              unreachableInteriorTiles(draft, "building", [], entrance.tile, 0),
              `${kind}/${side}/${seed}`,
            ).toEqual([]);
            for (const tile of draft.tilesOfBuilding("building"))
              for (const direction of DIRECTIONS) {
                const next = stepGridPos(tile, direction);
                expect(draft.wallAt(tile, direction)).toBe(
                  draft.wallAt(next, oppositeDirection(direction)),
                );
              }
          }
    }
  });

  it("gives a compact shop a broad sales floor and small rooms behind it", () => {
    for (const side of DIRECTIONS) {
      const horizontal = side === "n" || side === "s";
      const { rooms, entrance } = fixture(
        "shop",
        side,
        horizontal ? 7 : 6,
        horizontal ? 6 : 7,
        7,
      );
      const sales = rooms.find((room) => room.layoutRole === "arrival")!;
      expect(rectContains(sales.rect, entrance.tile.x, entrance.tile.z)).toBe(
        true,
      );
      expect(sales.rect.w * sales.rect.d).toBe(28);
      expect(Math.min(sales.rect.w, sales.rect.d)).toBeGreaterThanOrEqual(4);
      expect(
        rooms.filter((room) => room.layoutRole === "service"),
      ).toHaveLength(2);
      expect(rooms.every((room) => room.kind !== "corridor")).toBe(true);
    }
  });

  it("organises offices around a principal open workfloor and front reception", () => {
    const { rooms, entrance } = fixture("tower", "e", 8, 10, 8);
    const main = rooms.find((room) => room.layoutRole === "main")!;
    const arrival = rooms.find((room) => room.layoutRole === "arrival")!;
    expect(rectContains(arrival.rect, entrance.tile.x, entrance.tile.z)).toBe(
      true,
    );
    expect(main.rect.w * main.rect.d).toBeGreaterThan(
      arrival.rect.w * arrival.rect.d,
    );
    expect(rooms.some((room) => room.layoutRole === "service")).toBe(true);
    expect(rooms.every((room) => room.kind !== "corridor")).toBe(true);
  });

  it("separates public and private rooms with a short residential hall", () => {
    const { rooms, entrance, draft } = fixture("house", "n", 6, 6, 9);
    const hall = rooms.find((room) => room.kind === "corridor")!;
    const living = rooms.find((room) => room.layoutRole === "arrival")!;
    expect(hall.rect.z).toBeGreaterThan(living.rect.z);
    expect(hall.rect.d).toBe(3);
    expect(rooms).toHaveLength(5);
    expect(rectContains(living.rect, entrance.tile.x, entrance.tile.z)).toBe(
      true,
    );
    const frontOfHall = { x: hall.rect.x, y: 0, z: hall.rect.z };
    expect(draft.wallAt(frontOfHall, "n")).toBeUndefined();
  });

  it("keeps at least three quarters of a warehouse as an open connected workfloor", () => {
    for (let seed = 0; seed < 10; seed++) {
      const { rooms, plan } = fixture("warehouse", "n", 10, 10, seed);
      const open = rooms.filter(
        (room) => room.layoutRole === "arrival" || room.layoutRole === "main",
      );
      expect(
        open.reduce((sum, room) => sum + room.rect.w * room.rect.d, 0),
      ).toBeGreaterThanOrEqual(75);
      expect(
        rooms.filter((room) => room.layoutRole === "service"),
      ).toHaveLength(2);
      expect(
        plan.architecture?.partitions.filter((edge) => edge.kind === undefined)
          .length,
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it("reuses matching geometry and doorways on every floor", () => {
    const { draft, rooms, plan, footprint } = fixture(
      "apartment",
      "w",
      10,
      12,
      12,
    );
    for (const tile of draft.tilesOfBuilding("building"))
      draft.addTile({ ...tile, y: 2 });
    const upper = partitionFloor(
      draft,
      "building",
      1,
      2,
      footprint,
      plan,
      new Mulberry32Rng(987),
    );
    expect(
      upper.map(({ rect, layoutRole, kind }) => ({ rect, layoutRole, kind })),
    ).toEqual(
      rooms.map(({ rect, layoutRole, kind }) => ({ rect, layoutRole, kind })),
    );
    for (const partition of plan.architecture?.partitions ?? [])
      expect(draft.wallAt({ ...partition, y: 2 }, partition.side)).toBe(
        draft.wallAt({ ...partition, y: 0 }, partition.side),
      );
  });

  it("keeps kitchens in public kitchen slots and bathrooms in private service rooms", () => {
    for (const kind of ["house", "apartment"] as const)
      for (const side of DIRECTIONS)
        for (let seed = 0; seed < 8; seed++) {
          const { rooms, entrance } = fixture(kind, side, 6, 6, seed);
          const assigned = assignRoomPurposes(
            rooms,
            BUILDING_ROOM_PROGRAMS[kind].ground,
            entrance.tile,
            true,
            new Mulberry32Rng(seed),
          );
          expect(
            assigned.find((room) => room.layoutSlot === "kitchen")?.kind,
          ).toBe("kitchen");
          expect(
            assigned.find((room) => room.layoutSlot === "bedroom")?.kind,
          ).toBe("bedroom");
          const bathroom = assigned.find((room) => room.kind === "bathroom");
          expect(bathroom).toBeDefined();
          expect(bathroom?.layoutSlot).toBeUndefined();
          expect(
            assigned.filter((room) => room.kind === "kitchen"),
          ).toHaveLength(1);
        }
  });

  it("keeps the principal workfloor an office upstairs as well as downstairs", () => {
    const { rooms, entrance } = fixture("tower", "w", 8, 10, 13);
    for (const floor of ["ground", "upper"] as const) {
      const assigned = assignRoomPurposes(
        rooms,
        BUILDING_ROOM_PROGRAMS.tower[floor],
        entrance.tile,
        floor === "ground",
        new Mulberry32Rng(1),
      );
      expect(assigned.find((room) => room.layoutRole === "main")?.kind).toBe(
        "office",
      );
      expect(
        assigned.some(
          (room) => room.kind === "meeting" && room.layoutRole === "service",
        ),
      ).toBe(true);
    }
  });

  it("is deterministic, varies architectural proportions and preserves generic callers", () => {
    const variants = new Set<string>();
    for (let seed = 0; seed < 8; seed++) {
      const first = fixture("house", "s", 10, 10, seed);
      expect(first.plan).toEqual(fixture("house", "s", 10, 10, seed).plan);
      variants.add(JSON.stringify(first.plan));
    }
    expect(variants.size).toBeGreaterThan(4);
    const generic = planFloor(
      { x: 0, z: 0, w: 8, d: 8 },
      { roomSize: { min: 3, max: 5 }, corridorWidth: 1 },
      new Mulberry32Rng(1),
    );
    expect(generic.architecture).toBeUndefined();
    expect(generic.corridor).toBeDefined();
  });
});
