import { describe, expect, it } from "vitest";
import { DIRECTIONS, type Direction } from "../../../core/model/direction";
import { createRegistry } from "../../../core/service/definition-registry";
import { stepGridPos } from "../../../core/service/grid-math";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { ROOM_FURNISHING } from "../../data/room-furnishing";
import { SurfaceIds } from "../../data/surfaces";
import type { Room } from "../../model/building";
import { MapDraft } from "../../model/map-draft";
import type { MapGenRegistries } from "../../model/registries";
import type { RoomFurnishing } from "../../model/room-furnishing";
import { createDefaultRegistries } from "../../service/default-registries";
import { unreachableInteriorTiles } from "./building-reachability";
import { furnishBuildingInteriors } from "./room-furnisher";

const REGISTRIES = createDefaultRegistries();
const FRONTS: readonly Direction[] = ["s", "w", "n", "e"];

/** A fully enclosed room, optionally stacked with a second floor and stair. */
function fixture(kind: string, w = 8, d = 7, storeys = 1): MapDraft {
  const draft = new MapDraft(
    w + 4,
    d + 4,
    new SequentialIdGenerator(),
    SurfaceIds.GRASS,
  );
  const floors = [];
  const rect = { x: 2, z: 2, w, d };
  for (let index = 0; index < storeys; index++) {
    const y = index * 2;
    const room: Room = { id: `room-${index}`, floorIndex: index, rect, kind };
    floors.push({ index, y, rooms: [room] });
    for (let z = 2; z < d + 2; z++) {
      for (let x = 2; x < w + 2; x++) {
        const tile = { x, y, z };
        draft.addTile({
          ...tile,
          buildingId: "building",
          roomId: room.id,
          floorIndex: index,
          surface: SurfaceIds.FLOOR,
        });
        if (x === 2) draft.setWall(tile, "w", "solid");
        if (x === w + 1) draft.setWall(tile, "e", "solid");
        if (z === 2) draft.setWall(tile, "n", "solid");
        if (z === d + 1) draft.setWall(tile, "s", "solid");
      }
    }
  }
  const entrance = { x: 2 + Math.floor(w / 2), y: 0, z: 2 };
  draft.setWall(entrance, "n", "door");
  const connectorIds: string[] = [];
  if (storeys === 2) {
    const from = { x: 3, y: 0, z: d };
    const to = { x: 3, y: 2, z: d - 1 };
    const connector = draft.addConnector("stairs", from, to, "building");
    connectorIds.push(connector.id);
    const stairs = draft.getTile(from);
    if (stairs !== undefined) stairs.surface = SurfaceIds.STAIRS;
  }
  draft.buildings.push({
    id: "building",
    kind: "house",
    groundLevel: 0,
    footprint: [rect],
    floors,
    roof: { kind: "pitched", walkable: false },
    entrances: [{ tile: entrance, side: "n" }],
    connectorIds,
  });
  return draft;
}

/** Runs only furnishing, using an optional injected arrangement catalogue. */
function furnish(
  draft: MapDraft,
  seed: number,
  furnishing?: RoomFurnishing,
): void {
  const registries: MapGenRegistries =
    furnishing === undefined
      ? REGISTRIES
      : {
          ...REGISTRIES,
          roomFurnishing: createRegistry("room furnishing", [furnishing]),
        };
  furnishBuildingInteriors(
    draft,
    "temperate",
    registries,
    new Set(),
    new Mulberry32Rng(seed),
  );
}

describe("purposeful room furnishing", () => {
  it.each([
    ["retail", ["checkout", "retail-shelf"]],
    ["office", ["desk-computer", "filing-cabinet"]],
    ["meeting", ["meeting-table"]],
    ["bedroom", ["bed", "wardrobe"]],
    ["kitchen", ["kitchen-counter", "refrigerator", "dining-table"]],
    ["bathroom", ["bathroom-vanity", "toilet"]],
    ["living-room", ["sofa"]],
    ["workshop", ["workbench", "shelving"]],
  ])("gives a %s its recognisable functional furniture", (kind, essentials) => {
    for (let seed = 0; seed < 8; seed++) {
      const draft = fixture(kind);
      furnish(draft, seed);
      expect(
        draft.props.map((prop) => prop.kind),
        `${kind}/${seed}`,
      ).toEqual(expect.arrayContaining(essentials));
    }
  });

  it("keeps door approaches, stairs, furniture fronts and the whole building reachable", () => {
    for (const kind of ["retail", "office", "storage", "bedroom"]) {
      for (let seed = 0; seed < 6; seed++) {
        const draft = fixture(kind, 8, 7, 2);
        furnish(draft, seed);
        const entrance = draft.buildings[0]!.entrances[0]!.tile;
        expect(draft.propAt(entrance)).toBeUndefined();
        expect(draft.propAt(stepGridPos(entrance, "s"))).toBeUndefined();
        for (const connector of draft.connectors) {
          for (const landing of [connector.from, connector.to]) {
            expect(draft.propAt(landing)).toBeUndefined();
            for (const direction of DIRECTIONS)
              expect(
                draft.propAt(stepGridPos(landing, direction)),
              ).toBeUndefined();
          }
        }
        for (const prop of draft.props) {
          const front = FRONTS[prop.rotation]!;
          const approach = stepGridPos(prop.tile, front);
          expect(draft.wallAt(prop.tile, front), prop.id).toBeUndefined();
          expect(draft.propAt(approach), prop.id).toBeUndefined();
          expect(draft.getTile(approach)?.roomId, prop.id).toBe(
            draft.getTile(prop.tile)?.roomId,
          );
        }
        expect(
          unreachableInteriorTiles(
            draft,
            "building",
            draft.connectors,
            entrance,
            4,
          ),
        ).toEqual([]);
      }
    }
  });

  it("places matching shelves in parallel runs with clear aisles and end caps", () => {
    const draft = fixture("retail", 10, 8);
    furnish(draft, 4, {
      id: "retail",
      tilesPerProp: 3,
      maxProps: 16,
      props: ["retail-shelf"],
      arrangements: [
        { groups: [{ props: ["retail-shelf"], zone: "aisle", count: 16 }] },
      ],
    });
    expect(draft.props.length).toBeGreaterThanOrEqual(10);
    expect(new Set(draft.props.map((prop) => prop.rotation)).size).toBe(1);
    expect(
      new Set(draft.props.map((prop) => prop.tile.z)).size,
    ).toBeGreaterThan(1);
    for (const prop of draft.props) {
      expect(prop.tile.x).toBeGreaterThan(2);
      expect(prop.tile.x).toBeLessThan(11);
      expect(prop.tile.z).toBeGreaterThan(2);
      expect(prop.tile.z).toBeLessThan(9);
    }
    const rows = [...new Set(draft.props.map((prop) => prop.tile.z))].sort(
      (a, b) => a - b,
    );
    expect(rows[1]! - rows[0]!).toBe(3);
  });

  it("faces wall furniture into the room and spaces workstations", () => {
    const draft = fixture("office", 7, 6);
    furnish(draft, 3, {
      id: "office",
      tilesPerProp: 4,
      maxProps: 5,
      props: ["desk-computer"],
      arrangements: [
        {
          groups: [
            { props: ["desk-computer"], zone: "wall", count: 5, spacing: 2 },
          ],
        },
      ],
    });
    expect(draft.props.length).toBeGreaterThanOrEqual(3);
    for (const prop of draft.props) {
      const back = FRONTS[(prop.rotation + 2) % 4]!;
      expect(draft.wallAt(prop.tile, back)).toBe("solid");
      for (const other of draft.props.filter(
        (candidate) => candidate.id !== prop.id,
      )) {
        expect(
          Math.abs(prop.tile.x - other.tile.x) +
            Math.abs(prop.tile.z - other.tile.z),
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("preserves narrow corridors and fits bathroom essentials in a small room", () => {
    const corridor = fixture("corridor", 1, 14);
    furnish(corridor, 5);
    expect(corridor.props).toEqual([]);
    const bathroom = fixture("bathroom", 3, 3);
    furnish(bathroom, 5);
    expect(bathroom.props.map((prop) => prop.kind)).toEqual(
      expect.arrayContaining(["bathroom-vanity", "toilet"]),
    );
  });

  it("keeps a small meeting room functional when its centre is a door approach", () => {
    for (let seed = 0; seed < 8; seed++) {
      const draft = fixture("meeting", 3, 3);
      furnish(draft, seed);
      expect(draft.props.map((prop) => prop.kind)).toContain("meeting-table");
      expect(draft.propAt({ x: 3, y: 0, z: 3 })).toBeUndefined();
      expect(
        unreachableInteriorTiles(
          draft,
          "building",
          [],
          { x: 3, y: 0, z: 2 },
          0,
        ),
      ).toEqual([]);
    }
  });

  it("leaves staff and customer space on opposite sides of each checkout", () => {
    for (let seed = 0; seed < 12; seed++) {
      const draft = fixture("retail", 4, 4);
      furnish(draft, seed);
      const checkout = draft.props.find((prop) => prop.kind === "checkout");
      expect(checkout).toBeDefined();
      if (checkout === undefined) continue;
      for (const rotation of [checkout.rotation, (checkout.rotation + 2) % 4]) {
        const side = FRONTS[rotation]!;
        const access = stepGridPos(checkout.tile, side);
        expect(draft.getTile(access)?.roomId).toBe("room-0");
        expect(draft.propAt(access)).toBeUndefined();
        expect(draft.wallAt(checkout.tile, side)).toBeUndefined();
      }
    }
  });

  it("reproduces layouts per seed and varies furnishing across seeds", () => {
    const variants = new Set<string>();
    for (let seed = 0; seed < 10; seed++) {
      const first = fixture("office");
      const second = fixture("office");
      furnish(first, seed);
      furnish(second, seed);
      expect(first.props).toEqual(second.props);
      variants.add(
        JSON.stringify(
          first.props.map(({ kind, tile, rotation }) => ({
            kind,
            tile,
            rotation,
          })),
        ),
      );
    }
    expect(variants.size).toBeGreaterThan(5);
  });

  it("respects the room budget across all shipped furnishing profiles", () => {
    for (const profile of Object.values(ROOM_FURNISHING)) {
      const draft = fixture(profile.id, 4, 4);
      furnish(draft, 7);
      expect(draft.props.length, profile.id).toBeLessThanOrEqual(
        Math.min(profile.maxProps, Math.floor(16 / profile.tilesPerProp)),
      );
      expect(
        draft.props.every((prop) => profile.props.includes(prop.kind)),
        profile.id,
      ).toBe(true);
    }
  });
});
