import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../../bugs/data/species";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { Mission } from "../../../overworld/model/mission";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "../../data/hive-assault-setup-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import {
  missionWith,
  openField,
  unitAt,
} from "../tactical-fixtures.test-helper";
import { MISSION_SETUP_RULES } from "./mission-setup-rules";
import { TUNNEL_SABOTAGE_SETUP } from "./tunnel-sabotage-setup";

// ===========================================
// Fixtures
// ===========================================

/** Ground tile (x, z). */
function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

/** A 2 × 2 with its corner at (x, z), in the placer's row order. */
function square(x: number, z: number): TileCoord[] {
  return [at(x, z), at(x + 1, z), at(x, z + 1), at(x + 1, z + 1)];
}

const OFFER: Mission = {
  id: "mission-1",
  typeId: "tunnel-sabotage",
  cityId: "city-1",
  difficulty: 5,
  mapParams: {
    biome: "temperate",
    settlement: "city",
    size: "small",
    seed: "tunnel-setup",
  },
  rewards: { credits: 0, techPoints: 0 },
  createdDay: 5,
  expiresDay: 7,
  ignorePenalty: 0,
  tunnelSabotage: { cityId: "city-1", spreadDueDay: 7 },
};

/** An 8 × 8 field with `mouths` tunnel-mouth hooks, three by default, and the deploy in a corner. */
function fixtureMap(mouths = 3) {
  const builder = openField().deploy([at(0, 0)]);
  const corners = [at(1, 5), at(5, 5), at(5, 1)].slice(0, mouths);
  for (const corner of corners) {
    builder.objective(
      HookKinds.TUNNEL_MOUTH,
      square(corner.x, corner.z),
      undefined,
      { footprint: 2 },
    );
  }
  return builder.build();
}

/** Setup deps with a fresh id counter. */
function setupDeps(): MissionSetupDeps {
  return {
    ids: new SequentialIdGenerator(),
    spawnTuning: SPAWN_TUNING,
    generator: GENERATOR_TUNING,
    civilian: CIVILIAN_TUNING,
    hiveGuard: BUG_SPECIES["hive-guard"],
    hiveAssault: HIVE_ASSAULT_SETUP_TUNING,
  };
}

// ===========================================
// The rule on a fixture map
// ===========================================

describe("TUNNEL_SABOTAGE_SETUP (arc §6.7)", () => {
  it("is the table's setup for the tunnel sabotage type", () => {
    expect(MISSION_SETUP_RULES["tunnel-sabotage"]).toBe(TUNNEL_SABOTAGE_SETUP);
  });

  it("opens a mouth on every tunnel-mouth hook and names all three in one seal-tunnels objective", () => {
    const map = fixtureMap();
    const base = missionWith(map, [unitAt("u", "infantry", at(0, 0))]);
    const setUp = TUNNEL_SABOTAGE_SETUP.setup(base, map, OFFER, setupDeps());
    expect(setUp.ok).toBe(true);
    if (!setUp.ok) return;
    const state = setUp.value;
    // Each mouth open and uncharged, its charge tile the footprint's
    // middle tile the placement picks (the corner, for a 2 × 2).
    expect(state.tunnelMouths).toEqual([
      { id: "tunnel-1", pos: at(1, 5), tiles: square(1, 5) },
      { id: "tunnel-2", pos: at(5, 5), tiles: square(5, 5) },
      { id: "tunnel-3", pos: at(5, 1), tiles: square(5, 1) },
    ]);
    expect(state.objectives).toEqual([
      {
        id: "objective-1",
        kind: "seal-tunnels",
        mouthIds: ["tunnel-1", "tunnel-2", "tunnel-3"],
        complete: false,
      },
    ]);
    // No nests: the pressure is the waves and the mouths themselves.
    expect(state.spawners).toEqual([]);
    // The start's own base is untouched.
    expect(base.tunnelMouths).toBeUndefined();
    expect(base.objectives).toEqual([]);
  });

  it("seals whatever the map laid: a cramped board's two mouths make a two-mouth objective", () => {
    const map = fixtureMap(2);
    const setUp = TUNNEL_SABOTAGE_SETUP.setup(
      missionWith(map, []),
      map,
      OFFER,
      setupDeps(),
    );
    expect(setUp.ok && setUp.value.objectives[0]).toMatchObject({
      kind: "seal-tunnels",
      mouthIds: ["tunnel-1", "tunnel-2"],
    });
  });

  it("leaves the mission as it was on a map with no mouth hook", () => {
    const map = openField()
      .deploy([at(0, 0)])
      .build();
    const base = missionWith(map, []);
    const setUp = TUNNEL_SABOTAGE_SETUP.setup(base, map, OFFER, setupDeps());
    expect(setUp.ok && setUp.value).toBe(base);
  });
});
