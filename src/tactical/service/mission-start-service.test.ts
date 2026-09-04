import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { HookKinds } from "../../mapgen/model/hook";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { TileIndex } from "../../mapgen/service/tile-index";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { Deployment } from "../../overworld/model/deployment";
import type { Mission } from "../../overworld/model/mission";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { UNIT_TUNING } from "../data/unit-tuning";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { FIRST_TURN } from "../model/tactical-state";
import type { MissionStartDeps } from "./mission-start-service";
import { startTacticalMission, tileAdmits } from "./mission-start-service";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);

function deps(): MissionStartDeps {
  return {
    missionTypes: MISSION_TYPES,
    squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
    sheetFor: (mech) => {
      const result = validateLoadout(
        mech.loadout,
        PARTS,
        MECH_RATING_TUNING,
        UPGRADE_TUNING,
      );
      return result.ok ? result.value : undefined;
    },
    unitTuning: UNIT_TUNING,
    spawnTuning: SPAWN_TUNING,
    ids: new SequentialIdGenerator(),
    registries: createDefaultRegistries(),
  };
}

/** A campaign with one small clearance mission on its first infested city. */
function campaign(seed = 7): {
  state: GameState;
  mission: Mission;
  deployment: Deployment;
} {
  const base = createNewGame(
    { seed, createdAt: "2026-09-03T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  const city =
    base.overworld.map.cities.find((c) => c.infestation > 0) ??
    base.overworld.map.cities[0];
  if (!city) throw new Error("fixture needs a city");
  const region = base.overworld.map.regions.find((r) => r.id === city.regionId);
  if (!region) throw new Error("fixture needs a region");
  const mission: Mission = {
    id: "mission-1",
    typeId: "infestation-clearance",
    cityId: city.id,
    difficulty: 1,
    mapParams: {
      biome: region.biome,
      settlement: city.scale,
      size: "small",
      seed: "start-1",
    },
    rewards: { credits: 300 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
  };
  const state: GameState = {
    ...base,
    overworld: { ...base.overworld, missions: [mission] },
  };
  const deployment: Deployment = {
    missionId: mission.id,
    squadIds: base.roster.squads.map((s) => s.id),
    mechIds: base.roster.mechs.map((m) => m.id),
  };
  return { state, mission, deployment };
}

function unwrap<T, E>(
  result: { ok: true; value: T } | { ok: false; error: E },
): T {
  if (!result.ok)
    throw new Error(`unexpected error ${JSON.stringify(result.error)}`);
  return result.value;
}

// ===========================================
// Tests
// ===========================================

describe("startTacticalMission", () => {
  it("stores a tactical state on the campaign with the mission's map and clock at the first player turn", () => {
    const { state, mission, deployment } = campaign();
    const next = unwrap(
      startTacticalMission(state, mission.id, deployment, deps()),
    );
    const tactical = next.activeMission;
    expect(tactical).toBeDefined();
    if (!tactical) return;
    expect(tactical.missionId).toBe(mission.id);
    expect(tactical.difficulty).toBe(mission.difficulty);
    expect(tactical.threat).toBeGreaterThanOrEqual(0);
    expect(tactical.map.recipe.seed).toBe("start-1");
    expect(tactical.map.tiles.length).toBeGreaterThan(0);
    expect(tactical.turn).toBe(FIRST_TURN);
    expect(tactical.phase).toBe("player");
    expect(tactical.edgeSpawn).toEqual({
      nextTurn: SPAWN_TUNING.firstWaveTurn,
      wave: 0,
    });
    expect(tactical.log).toEqual([]);
    expect(Number.isInteger(tactical.seed)).toBe(true);
    expect(next.overworld).toBe(state.overworld);
    expect(next.roster).toBe(state.roster);
  });

  it("places every deployed unit on a distinct deploy-zone tile its class may stand on, facing the field", () => {
    const { state, mission, deployment } = campaign();
    const tactical = unwrap(
      startTacticalMission(state, mission.id, deployment, deps()),
    ).activeMission;
    if (!tactical) throw new Error("no mission");
    expect(tactical.units).toHaveLength(
      deployment.squadIds.length + deployment.mechIds.length,
    );
    const index = new TileIndex(tactical.map);
    const zoneKeys = new Set(
      tactical.map.hooks.deployZones
        .flatMap((z) => z.tiles)
        .map((t) => `${t.x},${t.y},${t.z}`),
    );
    const seen = new Set<string>();
    for (const unit of tactical.units) {
      const key = `${unit.pos.x},${unit.pos.y},${unit.pos.z}`;
      expect(zoneKeys.has(key)).toBe(true);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      const tile = index.getAt(unit.pos);
      expect(tile).toBeDefined();
      expect(tileAdmits(tile!.pass, unit.passClass)).toBe(true);
      expect(unit.team).toBe("tdf");
      expect(unit.hp).toBeGreaterThan(0);
      expect(tactical.templates[unit.templateId]).toBeDefined();
    }
    expect(
      tactical.units
        .filter((u) => u.kind === "mech")
        .every((u) => u.passClass === "mech"),
    ).toBe(true);
    const facings = new Set(tactical.units.map((u) => u.facing));
    expect(facings.size).toBe(1);
  });

  it("records one spawner and one destroy objective per egg-spawner hook, and the extraction tiles", () => {
    const { state, mission, deployment } = campaign();
    const tactical = unwrap(
      startTacticalMission(state, mission.id, deployment, deps()),
    ).activeMission;
    if (!tactical) throw new Error("no mission");
    const spawnerHooks = tactical.map.hooks.objectives.filter(
      (h) => h.kind === HookKinds.EGG_SPAWNER,
    );
    expect(spawnerHooks.length).toBeGreaterThan(0);
    expect(tactical.spawners).toHaveLength(spawnerHooks.length);
    tactical.spawners.forEach((spawner, i) => {
      const hook = spawnerHooks[i]!;
      expect(spawner.pos).toEqual({
        x: hook.tiles[0]!.x,
        y: hook.tiles[0]!.y,
        z: hook.tiles[0]!.z,
      });
      expect(spawner.hatchRadius).toBe(hook.meta?.hatchRadius ?? 3);
      expect(spawner.hp).toBe(SPAWN_TUNING.spawnerHp);
      expect(spawner.timer).toBe(SPAWN_TUNING.hatchInterval);
      expect(spawner.destroyed).toBe(false);
    });
    expect(tactical.objectives.map((o) => o.targetId)).toEqual(
      tactical.spawners.map((s) => s.id),
    );
    expect(
      tactical.objectives.every(
        (o) => o.kind === "destroy-spawner" && !o.complete,
      ),
    ).toBe(true);
    expect(tactical.extraction).toEqual(
      tactical.map.hooks.extraction.tiles.map((t) => ({
        x: t.x,
        y: t.y,
        z: t.z,
      })),
    );
    expect(
      new Set([
        ...tactical.spawners.map((s) => s.id),
        ...tactical.objectives.map((o) => o.id),
      ]).size,
    ).toBe(tactical.spawners.length + tactical.objectives.length);
  });

  it("is deterministic and survives a JSON round trip", () => {
    const { state, mission, deployment } = campaign();
    const a = unwrap(
      startTacticalMission(state, mission.id, deployment, deps()),
    );
    const b = unwrap(
      startTacticalMission(state, mission.id, deployment, deps()),
    );
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    const other = campaign(8);
    const c = unwrap(
      startTacticalMission(
        other.state,
        other.mission.id,
        other.deployment,
        deps(),
      ),
    );
    expect(c.activeMission?.units).not.toEqual(a.activeMission?.units);
  });

  it("rejects a second mission, an unknown mission, an empty deployment and unknown units", () => {
    const { state, mission, deployment } = campaign();
    const running = unwrap(
      startTacticalMission(state, mission.id, deployment, deps()),
    );
    const again = startTacticalMission(running, mission.id, deployment, deps());
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.kind).toBe("mission-active");

    const missing = startTacticalMission(
      state,
      "mission-9",
      deployment,
      deps(),
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.kind).toBe("mission-not-found");

    const empty = startTacticalMission(
      state,
      mission.id,
      { ...deployment, squadIds: [], mechIds: [] },
      deps(),
    );
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.kind).toBe("empty-deployment");

    const ghost = startTacticalMission(
      state,
      mission.id,
      { ...deployment, squadIds: ["squad-99"] },
      deps(),
    );
    expect(ghost.ok).toBe(false);
    if (!ghost.ok)
      expect(ghost.error).toEqual({
        kind: "unit-not-found",
        unitId: "squad-99",
      });
    expect(state.activeMission).toBeUndefined();
  });

  it("reports a mech whose loadout no longer validates", () => {
    const { state, mission, deployment } = campaign();
    const broken = { ...deps(), sheetFor: () => undefined };
    const result = startTacticalMission(state, mission.id, deployment, broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid-loadout");
  });

  it("refuses a deployment larger than a deploy zone can hold (#487)", () => {
    const { state, mission } = campaign();
    const squad = state.roster.squads[0];
    if (!squad) throw new Error("fixture needs a squad");
    const over = Array.from(
      { length: MAX_DEPLOYED_UNITS + 1 },
      (_, i) => `squad-${String(i)}`,
    );
    const result = startTacticalMission(
      {
        ...state,
        roster: {
          ...state.roster,
          squads: over.map((id) => ({ ...squad, id })),
        },
      },
      mission.id,
      { missionId: mission.id, squadIds: over, mechIds: [] },
      deps(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Not `no-deploy-room`: that means the map let the side down, and it
    // used to be what a seventeenth squad got after the launch committed.
    expect(result.error).toEqual({
      kind: "oversized-deployment",
      size: MAX_DEPLOYED_UNITS + 1,
      max: MAX_DEPLOYED_UNITS,
    });
  });
});
