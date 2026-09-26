import { describe, expect, it } from "vitest";

import {
  MAP_ARCHETYPES,
  type MapArchetype,
} from "../../mapgen/model/map-recipe";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { MAP_BACKDROPS } from "../data/map-backdrops";
import { backdropFor } from "./map-backdrop";

/** Just enough of a map to say which archetype it is. */
function mapOf(archetype: MapArchetype): TacticalMap {
  return { recipe: { params: { archetype } } } as unknown as TacticalMap;
}

describe("map backdrop (#1179)", () => {
  it("puts only the spore platform in space", () => {
    expect(
      MAP_ARCHETYPES.filter(
        (archetype) => MAP_BACKDROPS[archetype] === "space",
      ),
    ).toEqual(["spore-platform-hull", "spore-platform-core"]);
  });

  it("gives a platform map the space texture and every other map none", () => {
    for (const archetype of MAP_ARCHETYPES) {
      const texture = backdropFor(mapOf(archetype));
      if (MAP_BACKDROPS[archetype] === "space") {
        expect(texture?.name, archetype).toBe("space-backdrop");
      } else {
        expect(texture, archetype).toBeUndefined();
      }
      texture?.dispose();
    }
  });
});
