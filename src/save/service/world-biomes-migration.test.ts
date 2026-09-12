import { describe, expect, it } from "vitest";
import type { EarthMap } from "../../overworld/model/earth-map";
import { WORLD_BIOMES_SNAPSHOT } from "../data/world-biomes-snapshot";
import { EXPAND_WORLD_BIOMES } from "./world-biomes-migration";

/** Original geography with campaign progress and an already offered/active mission. */
function oldCampaign() {
  const regions = WORLD_BIOMES_SNAPSHOT.regions.slice(0, 12);
  const regionIds = new Set(regions.map((r) => r.id));
  const original = WORLD_BIOMES_SNAPSHOT.cities.filter(
    (c) => regionIds.has(c.regionId) && c.id !== "alice-springs",
  );
  const cityIds = new Set(original.map((c) => c.id));
  const map: EarthMap = {
    cities: original.map(({ biome: _biome, ...city }) => ({
      ...city,
      infestation: 47,
      neighbourIds: city.neighbourIds.filter((id) => cityIds.has(id)),
    })),
    regions: regions.map((region) => ({
      ...region,
      biome: "temperate",
      cityIds: region.cityIds.filter((id) => cityIds.has(id)),
      neighbourRegionIds: region.neighbourRegionIds.filter((id) =>
        regionIds.has(id),
      ),
    })),
  };
  return {
    meta: { seed: 17 },
    economy: { credits: 901 },
    roster: { squads: ["veterans"] },
    overworld: {
      map,
      day: 28,
      threat: 43,
      deployables: ["battery"],
      spreadCooldowns: { lagos: 3 },
      missions: [
        { cityId: "bogota", mapParams: { biome: "coastal", seed: "offered" } },
      ],
    },
    activeMission: {
      map: {
        recipe: { params: { biome: "coastal" } },
        tiles: ["frozen battle"],
      },
    },
  };
}

describe("world biome save expansion", () => {
  it("adds connected geography while retaining all campaign and active battle progress", () => {
    const before = oldCampaign();
    const serialized = JSON.stringify(before);
    const next = EXPAND_WORLD_BIOMES.apply(before) as ReturnType<
      typeof oldCampaign
    >;
    const map = next.overworld.map;
    expect(map.cities).toHaveLength(51);
    expect(map.regions).toHaveLength(17);
    for (const old of before.overworld.map.cities) {
      expect(map.cities.find((c) => c.id === old.id)?.infestation).toBe(47);
    }
    expect(map.cities.find((c) => c.id === "manaus")?.infestation).toBe(0);
    expect(map.cities.find((c) => c.id === "bogota")?.biome).toBe("alpine");
    expect(next.activeMission).toBe(before.activeMission);
    expect(next.overworld.missions).toBe(before.overworld.missions);
    expect(next.overworld.spreadCooldowns).toBe(
      before.overworld.spreadCooldowns,
    );
    expect(next.overworld.day).toBe(28);
    expect(next.overworld.threat).toBe(43);
    expect(next.overworld.deployables).toBe(before.overworld.deployables);
    expect(next.economy).toBe(before.economy);
    expect(next.roster).toBe(before.roster);
    expect(JSON.stringify(before)).toBe(serialized);
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);
    expect(EXPAND_WORLD_BIOMES.apply(next)).toEqual(next);
    const seen = new Set([map.cities[0]!.id]);
    for (const id of seen) {
      const city = map.cities.find((c) => c.id === id)!;
      for (const neighbour of city.neighbourIds) {
        expect(
          map.cities.find((c) => c.id === neighbour)?.neighbourIds,
        ).toContain(id);
        seen.add(neighbour);
      }
    }
    expect(seen.size).toBe(51);
    for (const region of map.regions) {
      for (const neighbour of region.neighbourRegionIds)
        expect(
          map.regions.find((r) => r.id === neighbour)?.neighbourRegionIds,
        ).toContain(region.id);
    }
  });

  it("leaves custom maps and absent overworlds alone", () => {
    const custom = oldCampaign();
    custom.overworld.map = {
      cities: custom.overworld.map.cities.slice(0, 2),
      regions: custom.overworld.map.regions.slice(0, 1),
    };
    expect(EXPAND_WORLD_BIOMES.apply(custom)).toBe(custom);
    expect(EXPAND_WORLD_BIOMES.apply({})).toEqual({});
  });
});
