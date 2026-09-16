import { describe, expect, it } from "vitest";
import { rectContains } from "../../../core/service/grid-math";
import { DEFAULT_MISSION_HOOKS } from "../../data/hook-requirements";
import { createDefaultRegistries } from "../../service/default-registries";
import { generateTacticalMap } from "../../service/generate-tactical-map";

describe("compact grocery furnishing", () => {
  it("keeps produce, chillers and a checkout when protected access blocks the aisle", () => {
    const map = generateTacticalMap(
      {
        seed: "store-essentials-7",
        params: {
          archetype: "settlement",
          biome: "temperate",
          settlement: "city",
          size: "large",
          hooks: DEFAULT_MISSION_HOOKS,
        },
      },
      { registries: createDefaultRegistries() },
    );
    const groceries = map.buildings.flatMap((building) =>
      building.floors.flatMap((floor) =>
        floor.rooms
          .filter((room) => room.kind === "grocery")
          .map((room) => ({ room, y: floor.y })),
      ),
    );
    expect(
      groceries.some(({ room }) => Math.min(room.rect.w, room.rect.d) <= 5),
    ).toBe(true);
    for (const { room, y } of groceries) {
      const kinds = map.props
        .filter(
          (prop) =>
            prop.tile.y === y &&
            rectContains(room.rect, prop.tile.x, prop.tile.z),
        )
        .map((prop) => prop.kind);
      expect(kinds, `${room.id}: ${room.rect.w}x${room.rect.d}`).toEqual(
        expect.arrayContaining(["produce-bin", "chilled-display", "checkout"]),
      );
    }
  });
});
