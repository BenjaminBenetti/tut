import { describe, expect, it } from "vitest";
import { GAME_STATE_MIGRATIONS } from "../data/migrations";
import type { WorldBiomesSnapshot } from "../data/world-biomes-snapshot";
import { WORLD_BIOMES_SNAPSHOT } from "../data/world-biomes-snapshot";
import { GAME_STATE_SCHEMA_VERSION } from "../model/game-state";
import { MigrationRunner } from "./migration-runner";
import { EXPAND_WORLD_BIOMES } from "./world-biomes-migration";

/** Original geography with campaign progress and an already offered/active mission. */
function oldCampaign() {
  const regions = WORLD_BIOMES_SNAPSHOT.regions.slice(0, 12);
  const regionIds = new Set(regions.map((r) => r.id));
  const original = WORLD_BIOMES_SNAPSHOT.cities.filter(
    (c) => regionIds.has(c.regionId) && c.id !== "alice-springs",
  );
  const cityIds = new Set(original.map((c) => c.id));
  const map: WorldBiomesSnapshot = {
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
      deployables: [
        {
          id: "battery",
          typeId: "defensive-battery",
          regionId: "r",
          online: true,
        },
      ],
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
  it.each([17, 18])(
    "upgrades a v%i campaign through the registered chain and preserves deployed radar",
    (schemaVersion) => {
      const campaign = oldCampaign();
      const radars = [
        {
          id: "scanner-1",
          team: "tdf",
          pos: { x: 3, y: 0, z: 4 },
          range: 30,
        },
      ];
      const before = {
        ...campaign,
        activeMission: {
          ...campaign.activeMission,
          ...(schemaVersion === 18 ? { radars } : {}),
        },
      };
      const serialized = JSON.stringify(before);
      const result = new MigrationRunner(
        GAME_STATE_MIGRATIONS,
        GAME_STATE_SCHEMA_VERSION,
      ).migrate({ schemaVersion, savedAt: "saved", state: before });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      // The chain's end, not a literal: every later step runs too.
      expect(result.value.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
      expect(result.value.savedAt).toBe("saved");
      const next = result.value.state as typeof before;
      expect(next.overworld.map.cities).toHaveLength(51);
      expect(next.overworld.map.regions).toHaveLength(17);
      expect(next.activeMission).toEqual({
        ...campaign.activeMission,
        // v20 → v21 (#1130): a scanner from before batteries starts with a full one.
        radars:
          schemaVersion === 18
            ? radars.map((r) => ({ ...r, turnsLeft: 3 }))
            : [],
        // v19 → v20 (#1121): nothing was burning in an older mission.
        effects: [],
        // v21 → v22 (#1132): no charge was set in an older mission.
        charges: [],
        // v25 → v26 (#1171): nothing was harvested in an older mission.
        carcasses: [],
      });
      expect(next.overworld.missions).toBe(before.overworld.missions);
      // v25 → v26 (#1171): an older campaign has earned no tech points.
      expect(next.economy).toEqual({ ...before.economy, techPoints: 0 });
      expect(JSON.stringify(before)).toBe(serialized);
    },
  );

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
