import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import type { SitrepId } from "../../content/model/sitrep-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
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
import { COMBAT_TUNING } from "../data/combat-tuning";
import { GARRISON_TUNING } from "../data/garrison-tuning";
import { GENERATOR_TUNING } from "../data/generator-tuning";
import { HAZARD_TUNING } from "../data/hazard-tuning";
import { SITREP_TUNING } from "../data/sitrep-tuning";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { UNIT_TUNING } from "../data/unit-tuning";
import { endTurn } from "../model/end-turn-command";
import type { TacticalState } from "../model/tactical-state";
import type { MissionStartDeps } from "./mission-start-service";
import { startTacticalMission } from "./mission-start-service";
import { nightSight } from "./sitreps/nightfall-sitrep";
import { sitrepPhaseSteps } from "./sitreps/sitrep-service";
import { createBurnStep } from "./tile-effect-service";
import { createEndTurnHandler, DEFAULT_PHASE_STEPS } from "./turn-service";
import { sightRangeOf } from "./vision-service";

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);

/** The shipped start content with fresh ids. */
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
    garrison: GARRISON_TUNING,
    generator: GENERATOR_TUNING,
    ids: new SequentialIdGenerator(),
    registries: createDefaultRegistries(),
  };
}

/** A new campaign offering one small clearance, difficulty 2, with the sitreps. */
function campaign(
  sitreps: readonly SitrepId[],
  seed = 11,
): {
  state: GameState;
  deployment: Deployment;
} {
  const base = createNewGame(
    { seed, createdAt: "2026-09-26T00:00:00.000Z" },
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
    difficulty: 2,
    mapParams: {
      biome: city.biome ?? region.biome,
      settlement: city.scale,
      size: "small",
      seed: `sitreps-${String(seed)}`,
    },
    rewards: { credits: 300, techPoints: 0 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
    ...(sitreps.length === 0 ? {} : { sitreps }),
  };
  return {
    state: { ...base, overworld: { ...base.overworld, missions: [mission] } },
    deployment: {
      missionId: mission.id,
      squadIds: base.roster.squads.map((s) => s.id),
      mechIds: base.roster.mechs.map((m) => m.id),
    },
  };
}

/** The started mission, with two garrison turrets standing. */
function started(sitreps: readonly SitrepId[] = [], seed = 11): TacticalState {
  const { state, deployment } = campaign(sitreps, seed);
  const result = startTacticalMission(state, "mission-1", deployment, deps(), {
    garrisonTurrets: 2,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  const mission = result.value.activeMission;
  if (mission === undefined) throw new Error("no active mission");
  return mission;
}

/** `x,y,z` for a coordinate. */
function keyOf(tile: { x: number; y: number; z: number }): string {
  return `${String(tile.x)},${String(tile.y)},${String(tile.z)}`;
}

/** The nearest ground distance from `tile` to the map's deploy zone. */
function fromDeploy(mission: TacticalState, tile: { x: number; z: number }) {
  return Math.min(
    ...mission.map.hooks.deployZones
      .flatMap((zone) => zone.tiles)
      .map((zone) => Math.abs(zone.x - tile.x) + Math.abs(zone.z - tile.z)),
  );
}

/** Ends phases until the player phase of `turn` opens, with no bug moves. */
function playerPhaseOf(mission: TacticalState, turn: number): TacticalState {
  const handler = createEndTurnHandler([
    ...DEFAULT_PHASE_STEPS,
    createBurnStep(HAZARD_TUNING, COMBAT_TUNING),
    ...sitrepPhaseSteps(),
  ]);
  const ctx = { rng: new Mulberry32Rng(1), ids: new SequentialIdGenerator() };
  let state = mission;
  while (state.turn < turn || state.phase !== "player") {
    const applied = handler(state, endTurn(), ctx);
    if (!applied.ok) throw new Error(JSON.stringify(applied.error));
    state = applied.value.state;
  }
  return state;
}

// ===========================================
// Tests
// ===========================================

describe("startTacticalMission with sitreps (campaign arc §11)", () => {
  const plain = started();

  it("copies the offer's sitreps, and leaves a mission without any unchanged", () => {
    expect(plain.sitreps).toBeUndefined();
    expect(plain.effects).toEqual([]);
    expect(started(["nightfall", "local-guides"]).sitreps).toEqual([
      "nightfall",
      "local-guides",
    ]);
  });

  it("Nightfall: every unit sees four less, and the squad sees less ground", () => {
    const night = started(["nightfall"]);
    expect(night.units.map((u) => u.id)).toEqual(plain.units.map((u) => u.id));
    for (const unit of night.units) {
      const day = night.templates[unit.templateId]!.sightRange;
      expect(sightRangeOf(night, unit)).toBe(
        nightSight(day, SITREP_TUNING.nightfall),
      );
      expect(sightRangeOf(night, unit)).toBeLessThan(day);
    }
    expect(night.vision.tdf.visible.length).toBeLessThan(
      plain.vision.tdf.visible.length,
    );
  });

  it("Spore Fog: long-lived smoke on open ground, the deploy zone clear, nothing else moved", () => {
    const fog = started(["spore-fog"]);
    const smoke = fog.effects;
    // Small map: 2304 tiles at 576 a cloud, four clouds of up to 13.
    expect(smoke.length).toBeGreaterThanOrEqual(4);
    expect(smoke.length).toBeLessThanOrEqual(4 * 13);
    for (const effect of smoke) {
      expect(effect.kind).toBe("smoke");
      expect(effect.phasesLeft).toBe(SITREP_TUNING.sporeFog.phases);
      expect(fromDeploy(fog, effect.tile)).toBeGreaterThanOrEqual(
        SITREP_TUNING.sporeFog.deployClearance,
      );
    }
    expect(fog.units).toEqual(plain.units);
    expect(fog.spawners).toEqual(plain.spawners);
    expect(fog.carcasses).toEqual(plain.carcasses);
  });

  it("City Ablaze: fire at the start, out by turn 3, and burning again on turn 4", () => {
    const ablaze = started(["city-ablaze"]);
    const sites = (ablaze.blazeSites ?? []).map(keyOf);
    // Small map: clamped to two blazes of up to five tiles.
    expect(sites.length).toBeGreaterThanOrEqual(2);
    expect(sites.length).toBeLessThanOrEqual(10);
    expect(ablaze.effects.map((e) => keyOf(e.tile))).toEqual(sites);
    expect(ablaze.effects.every((e) => e.kind === "fire")).toBe(true);
    const objectives = [
      ...ablaze.map.hooks.objectives.flatMap((hook) => hook.tiles),
      ...ablaze.spawners.map((spawner) => spawner.pos),
    ];
    for (const effect of ablaze.effects) {
      expect(fromDeploy(ablaze, effect.tile)).toBeGreaterThanOrEqual(
        SITREP_TUNING.cityAblaze.deployClearance,
      );
      for (const point of objectives) {
        expect(
          Math.abs(point.x - effect.tile.x) + Math.abs(point.z - effect.tile.z),
        ).toBeGreaterThanOrEqual(SITREP_TUNING.cityAblaze.objectiveClearance);
      }
    }
    const burning = (m: TacticalState) =>
      m.effects.filter((e) => e.kind === "fire").map((e) => keyOf(e.tile));
    expect(burning(playerPhaseOf(ablaze, 2))).toEqual(sites);
    expect(burning(playerPhaseOf(ablaze, 3))).toEqual([]);
    expect(burning(playerPhaseOf(ablaze, 4))).toEqual(sites);
    expect(burning(playerPhaseOf(ablaze, 6))).toEqual([]);
    expect(burning(playerPhaseOf(ablaze, 7))).toEqual(sites);
    // A mission without the sitrep never relights anything.
    expect(playerPhaseOf(plain, 4).effects).toEqual([]);
  });

  it("Salvage Rich: two more carcasses than the offer placed, priced by difficulty", () => {
    const salvage = started(["salvage-rich"]);
    expect(salvage.carcasses).toHaveLength(plain.carcasses.length + 2);
    for (const carcass of salvage.carcasses.slice(plain.carcasses.length)) {
      expect(carcass.techPoints).toBe(10 + 2 * 2);
      expect(fromDeploy(salvage, carcass.pos)).toBeGreaterThanOrEqual(
        SITREP_TUNING.salvageRich.minFromDeploy,
      );
    }
  });

  it("Local Guides: every tile explored, while sight and spotting stay as they were", () => {
    const guided = started(["local-guides"]);
    const index = new TileIndex(guided.map);
    expect(guided.vision.tdf.explored).toHaveLength(guided.map.tiles.length);
    expect(new Set(guided.vision.tdf.explored)).toEqual(
      new Set(guided.map.tiles.map((t) => index.keyOf(t))),
    );
    expect(plain.vision.tdf.explored.length).toBeLessThan(
      guided.map.tiles.length,
    );
    expect(guided.vision.tdf.visible).toEqual(plain.vision.tdf.visible);
    expect(guided.vision.tdf.spotted).toEqual(plain.vision.tdf.spotted);
    expect(guided.vision.bugs).toEqual(plain.vision.bugs);
  });

  it("is deterministic, and one sitrep never moves another's draws", () => {
    expect(started(["spore-fog", "salvage-rich"])).toEqual(
      started(["spore-fog", "salvage-rich"]),
    );
    const fogOnly = started(["spore-fog"]);
    const both = started(["spore-fog", "city-ablaze"]);
    expect(both.effects.filter((e) => e.kind === "smoke")).toEqual(
      fogOnly.effects,
    );
    const salvageOnly = started(["salvage-rich"]);
    const withNight = started(["nightfall", "salvage-rich"]);
    expect(withNight.carcasses).toEqual(salvageOnly.carcasses);
  });

  it("stands the garrison before the sitreps, so no sitrep moves a turret", () => {
    const turrets = (m: TacticalState) =>
      m.units.filter((u) => u.kind === "turret").map((u) => keyOf(u.pos));
    expect(turrets(plain)).toHaveLength(2);
    for (const id of ["spore-fog", "city-ablaze", "salvage-rich"] as const) {
      const mission = started([id]);
      expect(turrets(mission)).toEqual(turrets(plain));
      const onTurret = mission.effects.some((e) =>
        turrets(plain).includes(keyOf(e.tile)),
      );
      expect(onTurret).toBe(false);
    }
  });
});
