import { BUG_SPECIES } from "../../bugs/data/species";
import { MISSION_TYPES } from "../../content/data/mission-types";
import type { MapSizeId } from "../../content/model/map-size-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { SitrepId } from "../../content/model/sitrep-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { Deployment } from "../../overworld/model/deployment";
import type {
  InstallationDefence,
  Mission,
} from "../../overworld/model/mission";
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
import { CIVILIAN_TUNING } from "../data/civilian-tuning";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { GARRISON_TUNING } from "../data/garrison-tuning";
import { GENERATOR_TUNING } from "../data/generator-tuning";
import { HAZARD_TUNING } from "../data/hazard-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "../data/hive-assault-setup-tuning";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { UNIT_TUNING } from "../data/unit-tuning";
import { endTurn } from "../model/end-turn-command";
import type { TacticalEvent } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import type { MissionStartDeps } from "./mission-start-service";
import { startTacticalMission } from "./mission-start-service";
import { sitrepPhaseSteps } from "./sitreps/sitrep-service";
import { createEdgeWaveStep, createHatchStep } from "./spawn-service";
import { createBurnStep } from "./tile-effect-service";
import { createEndTurnHandler, DEFAULT_PHASE_STEPS } from "./turn-service";

// ===========================================
// Start
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);

/** The shipped start content with fresh ids. */
export function startDeps(): MissionStartDeps {
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
    civilian: CIVILIAN_TUNING,
    hiveGuard: BUG_SPECIES["hive-guard"],
    hiveAssault: HIVE_ASSAULT_SETUP_TUNING,
    ids: new SequentialIdGenerator(),
    registries: createDefaultRegistries(),
  };
}

/** What the offer is, beyond its sitreps: a small difficulty-2 clearance unless said otherwise. */
export interface SitrepOfferShape {
  readonly typeId?: MissionTypeId;
  readonly difficulty?: number;
  readonly size?: MapSizeId;
  readonly defence?: InstallationDefence;
}

/** A new campaign offering the one mission, with the sitreps, and a deployment of the whole roster. */
export function sitrepCampaign(
  sitreps: readonly SitrepId[],
  seed = 11,
  shape: SitrepOfferShape = {},
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
    typeId: shape.typeId ?? "infestation-clearance",
    cityId: city.id,
    difficulty: shape.difficulty ?? 2,
    mapParams: {
      biome: city.biome ?? region.biome,
      settlement: city.scale,
      size: shape.size ?? "small",
      seed: `sitreps-${String(seed)}`,
    },
    rewards: { credits: 300, techPoints: 0 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
    ...(sitreps.length === 0 ? {} : { sitreps }),
    ...(shape.defence === undefined ? {} : { defence: shape.defence }),
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
export function started(
  sitreps: readonly SitrepId[] = [],
  seed = 11,
  shape: SitrepOfferShape = {},
): TacticalState {
  const { state, deployment } = sitrepCampaign(sitreps, seed, shape);
  const result = startTacticalMission(
    state,
    "mission-1",
    deployment,
    startDeps(),
    { garrisonTurrets: 2 },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  const mission = result.value.activeMission;
  if (mission === undefined) throw new Error("no active mission");
  return mission;
}

// ===========================================
// Queries
// ===========================================

/** `x,y,z` for a coordinate. */
export function keyOf(tile: { x: number; y: number; z: number }): string {
  return `${String(tile.x)},${String(tile.y)},${String(tile.z)}`;
}

/** The nearest ground distance from `tile` to the map's deploy zone. */
export function fromDeploy(
  mission: TacticalState,
  tile: { x: number; z: number },
): number {
  return Math.min(
    ...mission.map.hooks.deployZones
      .flatMap((zone) => zone.tiles)
      .map((zone) => Math.abs(zone.x - tile.x) + Math.abs(zone.z - tile.z)),
  );
}

// ===========================================
// Turns
// ===========================================

/** Ends phases until the player phase of `turn` opens, with no bug moves. */
export function playerPhaseOf(
  mission: TacticalState,
  turn: number,
): TacticalState {
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

/**
 * Ends phases with the shipped spawns (every shipped species) and the
 * sitreps' steps running, and no bug moves, until the mission ends or `turn`'s player phase
 * opens; every event on the way, in order.
 *
 * ```
 *   steps: refresh, hatch, edge wave, sitreps (the composition's order, less the rest)
 * ```
 */
export function runUntil(
  mission: TacticalState,
  turn: number,
): { state: TacticalState; events: TacticalEvent[] } {
  const spawns = { species: Object.values(BUG_SPECIES), tuning: SPAWN_TUNING };
  const handler = createEndTurnHandler([
    ...DEFAULT_PHASE_STEPS,
    createHatchStep(spawns),
    createEdgeWaveStep(spawns),
    ...sitrepPhaseSteps(),
  ]);
  const ctx = { rng: new Mulberry32Rng(1), ids: new SequentialIdGenerator() };
  let state = mission;
  const events: TacticalEvent[] = [];
  while (
    state.outcome === undefined &&
    (state.turn < turn || state.phase !== "player")
  ) {
    const applied = handler(state, endTurn(), ctx);
    if (!applied.ok) throw new Error(JSON.stringify(applied.error));
    state = applied.value.state;
    events.push(...applied.value.events);
  }
  return { state, events };
}
