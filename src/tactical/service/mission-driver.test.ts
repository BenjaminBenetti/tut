import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { BUG_SPECIES } from "../../bugs/data/species";
import { MapBehaviourRegistry } from "../../bugs/ai/behaviour-registry";
import { BruteBehaviour } from "../../bugs/ai/brute-behaviour";
import { createBugPhaseRunner } from "../../bugs/ai/bug-phase-runner";
import { LurkerBehaviour } from "../../bugs/ai/lurker-behaviour";
import { SwarmerBehaviour } from "../../bugs/ai/swarmer-behaviour";
import { createSpeciesLookup } from "../../bugs/service/species-lookup";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
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
import { OBJECTIVE_TUNING } from "../data/objective-tuning";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { UNIT_TUNING } from "../data/unit-tuning";
import { ATTACK } from "../model/attack-command";
import { END_TURN, endTurn } from "../model/end-turn-command";
import { EXTRACT } from "../model/extract-command";
import { INTERACT } from "../model/interact-command";
import { MOVE } from "../model/move-command";
import { OVERWATCH } from "../model/overwatch-command";
import { RELOAD } from "../model/reload-command";
import type { TacticalContext } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import { createAttackHandler } from "./combat-service";
import { objectiveApproach } from "./map-assessment-service";
import { startTacticalMission } from "./mission-start-service";
import type { EngagementBlock } from "./mission-driver.test-helper";
import { nextActionAgainst } from "./mission-driver.test-helper";
import { createMoveHandler } from "./move-handler";
import { buildMoveGraph } from "./movement-service";
import {
  createExtractHandler,
  createInteractHandler,
} from "./objective-service";
import { overwatchHandler } from "./overwatch-handler";
import { reloadHandler } from "./reload-handler";
import { createEdgeWaveStep, createHatchStep } from "./spawn-service";
import type { TacticalHandlers } from "./tactical-command-handlers";
import { applyTacticalCommand } from "./tactical-command-handlers";
import {
  createEndTurnHandler,
  createOverwatchReaction,
  DEFAULT_PHASE_STEPS,
} from "./turn-service";

// ===========================================
// Harness
// ===========================================

/** The shipped rules, assembled without `app/` so this stays in-domain. */
function rules(): TacticalHandlers {
  const spawn = { species: Object.values(BUG_SPECIES), tuning: SPAWN_TUNING };
  const actions: TacticalHandlers = {
    [ATTACK]: createAttackHandler(COMBAT_TUNING),
    [MOVE]: createMoveHandler(createOverwatchReaction(COMBAT_TUNING)),
    [OVERWATCH]: overwatchHandler,
    [RELOAD]: reloadHandler,
    [INTERACT]: createInteractHandler(OBJECTIVE_TUNING),
    [EXTRACT]: createExtractHandler(OBJECTIVE_TUNING),
  };
  return {
    ...actions,
    [END_TURN]: createEndTurnHandler(
      [
        ...DEFAULT_PHASE_STEPS,
        createHatchStep(spawn),
        createEdgeWaveStep(spawn),
      ],
      createBugPhaseRunner({
        handlers: actions,
        registry: new MapBehaviourRegistry([
          new LurkerBehaviour(),
          new SwarmerBehaviour(),
          new BruteBehaviour(),
        ]),
        speciesOf: createSpeciesLookup(BUG_SPECIES),
        combat: COMBAT_TUNING,
      }),
    ),
  };
}

/** A campaign with one small clearance mission, started. */
function startedMission(seed: number, mapSeed: string): TacticalState {
  const base: GameState = createNewGame(
    { seed, createdAt: "2026-09-04T00:00:00.000Z" },
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
  const region = base.overworld.map.regions.find(
    (r) => r.id === city?.regionId,
  );
  if (!city || !region) throw new Error("fixture needs a city and a region");
  const mission: Mission = {
    id: "mission-1",
    typeId: "infestation-clearance",
    cityId: city.id,
    difficulty: 1,
    mapParams: {
      biome: region.biome,
      settlement: city.scale,
      size: "small",
      seed: mapSeed,
    },
    rewards: { credits: 300 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
  };
  const parts = new StaticPartCatalogue(STARTER_PARTS);
  const started = startTacticalMission(
    { ...base, overworld: { ...base.overworld, missions: [mission] } },
    mission.id,
    {
      missionId: mission.id,
      squadIds: base.roster.squads.map((s) => s.id),
      mechIds: base.roster.mechs.map((m) => m.id),
    },
    {
      missionTypes: MISSION_TYPES,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      sheetFor: (mech) => {
        const sheet = validateLoadout(
          mech.loadout,
          parts,
          MECH_RATING_TUNING,
          UPGRADE_TUNING,
        );
        return sheet.ok ? sheet.value : undefined;
      },
      unitTuning: UNIT_TUNING,
      spawnTuning: SPAWN_TUNING,
      ids: new SequentialIdGenerator(),
      registries: createDefaultRegistries(),
    },
  );
  if (!started.ok)
    throw new Error(`mission did not start: ${started.error.kind}`);
  const active = started.value.activeMission;
  if (!active) throw new Error("no active mission");
  return active;
}

/** What one driven run came to. */
interface RunReport {
  readonly destroyed: boolean;
  readonly turns: number;
  readonly attacks: number;
  readonly charges: number;
  readonly reloads: number;
  readonly moves: number;
  readonly blocks: readonly EngagementBlock[];
}

/**
 * Drives every TDF unit at one spawner until it falls, the squad dies or
 * `maxTurns` passes, ending each turn through the real `EndTurn` (so the
 * bugs hatch, walk and shoot back).
 */
function driveAt(
  start: TacticalState,
  spawnerId: string,
  maxTurns: number,
  drives: (unit: { readonly kind: string }) => boolean = () => true,
): RunReport {
  const handlers = rules();
  const ids = new SequentialIdGenerator();
  const graph = buildMoveGraph(start.map);
  let mission = start;
  let attacks = 0;
  let charges = 0;
  let reloads = 0;
  let moves = 0;
  const blocks = new Set<EngagementBlock>();
  let turns = 0;

  const ctxFor = (label: string): TacticalContext => ({
    rng: new Mulberry32Rng(99).fork(label),
    ids,
  });

  while (turns < maxTurns && mission.outcome === undefined) {
    const spawner = mission.spawners.find((s) => s.id === spawnerId);
    if (spawner === undefined || spawner.destroyed) {
      break;
    }
    for (const unit of mission.units.filter(
      (u) => u.team === "tdf" && drives(u),
    )) {
      // Each unit acts until it runs out of actions or cannot help.
      for (let action = 0; action < 6; action++) {
        const live = mission.units.find((u) => u.id === unit.id);
        if (live === undefined || live.hp <= 0 || live.ap <= 0) {
          break;
        }
        const next = nextActionAgainst(
          mission,
          unit.id,
          spawnerId,
          OBJECTIVE_TUNING,
          graph,
        );
        if (next.kind === "blocked") {
          blocks.add(next.reason);
          break;
        }
        const applied = applyTacticalCommand(
          handlers,
          mission,
          next.command,
          ctxFor(`${String(turns)}:${unit.id}:${String(action)}`),
        );
        if (!applied.ok) {
          break;
        }
        mission = applied.value.state;
        if (next.kind === "attack") attacks++;
        if (next.kind === "interact") charges++;
        if (next.kind === "reload") reloads++;
        if (next.kind === "move") moves++;
      }
    }
    const ended = applyTacticalCommand(
      handlers,
      mission,
      endTurn(),
      ctxFor(`${String(turns)}:end`),
    );
    if (!ended.ok) {
      break;
    }
    mission = ended.value.state;
    turns++;
  }

  const spawner = mission.spawners.find((s) => s.id === spawnerId);
  return {
    destroyed: spawner?.destroyed ?? false,
    turns,
    attacks,
    charges,
    reloads,
    moves,
    blocks: [...blocks],
  };
}

// ===========================================
// Tests
// ===========================================

describe("nextActionAgainst", () => {
  it("drives the force onto an indoor spawner and destroys it (#494)", () => {
    const mission = startedMission(7, "driver-indoor");
    const approach = objectiveApproach(mission.map);
    // The case that stalled the old driver: a spawner no mech can stand
    // on, but every one of them can be shot at.
    const indoor = approach.find(
      (a) => a.mechSteps === -1 && a.mechFiringSteps >= 0,
    );
    expect(indoor, "the seed should offer an indoor spawner").toBeDefined();
    if (!indoor) return;
    const spawner = mission.spawners[indoor.objective];
    expect(spawner).toBeDefined();
    if (!spawner) return;

    const report = driveAt(mission, spawner.id, 30);
    expect(report.destroyed).toBe(true);
    // Never for a reason that would mean the map or the driver is wrong;
    // `target-gone` is the other units reporting after it fell.
    expect(
      report.blocks.filter(
        (reason) => reason === "no-route" || reason === "no-firing-position",
      ),
    ).toEqual([]);
    // It got there by shooting or by charges, not by standing still.
    expect(report.attacks + report.charges).toBeGreaterThan(0);
    expect(report.moves).toBeGreaterThan(0);
  });

  it("walks a squad inside to plant charges when no mech is helping (#494)", () => {
    const mission = startedMission(7, "driver-indoor");
    const approach = objectiveApproach(mission.map);
    const indoor = approach.find(
      (a) => a.mechSteps === -1 && a.infantrySteps >= 0,
    );
    expect(indoor, "the seed should offer an indoor spawner").toBeDefined();
    if (!indoor) return;
    const spawner = mission.spawners[indoor.objective];
    if (!spawner) throw new Error("no spawner for that objective");

    const report = driveAt(
      mission,
      spawner.id,
      40,
      (unit) => unit.kind === "squad",
    );
    expect(report.destroyed).toBe(true);
    expect(
      report.blocks.filter(
        (reason) => reason === "no-route" || reason === "no-firing-position",
      ),
    ).toEqual([]);
  });

  it("clears an indoor spawner on every sampled seed, by fire or by charges (#494)", () => {
    const seeds = ["sweep-a", "sweep-b", "sweep-c", "sweep-d", "sweep-e"];
    const rows: string[] = [];
    for (const mapSeed of seeds) {
      const mission = startedMission(7, mapSeed);
      const approach = objectiveApproach(mission.map);
      const indoor = approach.find((a) => a.mechSteps === -1);
      if (indoor === undefined) {
        rows.push(`${mapSeed}: no indoor spawner`);
        continue;
      }
      const spawner = mission.spawners[indoor.objective];
      if (!spawner) throw new Error("no spawner for that objective");
      const both = driveAt(mission, spawner.id, 40);
      const squad = driveAt(
        mission,
        spawner.id,
        40,
        (unit) => unit.kind === "squad",
      );
      rows.push(
        `${mapSeed}: force ${both.destroyed ? "cleared" : "FAILED"} in ${String(both.turns)} turns ` +
          `(${String(both.attacks)} shots, ${String(both.charges)} charges); ` +
          `squad alone ${squad.destroyed ? "cleared" : "FAILED"} in ${String(squad.turns)} turns ` +
          `(${String(squad.attacks)} shots, ${String(squad.charges)} charges)`,
      );
      expect([mapSeed, both.destroyed]).toEqual([mapSeed, true]);
      expect([mapSeed, squad.destroyed]).toEqual([mapSeed, true]);
    }
    // The rows are the evidence when this fails; assertions above make
    // each seed's verdict its own failure line.
    expect(rows).toHaveLength(seeds.length);
  });

  it("closes on a spawner it starts far from, rather than stalling", () => {
    const mission = startedMission(7, "driver-indoor");
    const spawner = mission.spawners[0];
    const mech = mission.units.find((u) => u.kind === "mech");
    expect(spawner && mech).toBeTruthy();
    if (!spawner || !mech) return;

    const graph = buildMoveGraph(mission.map);
    const first = nextActionAgainst(
      mission,
      mech.id,
      spawner.id,
      OBJECTIVE_TUNING,
      graph,
    );
    // The old driver asked for a path onto the spawner's own tile, got
    // none, and issued nothing. This one walks toward a firing position.
    expect(first.kind).toBe("move");
    if (first.kind !== "move") return;
    expect(first.command.payload.path.length).toBeGreaterThan(1);
    expect(first.remaining).toBeGreaterThanOrEqual(0);
  });

  it("names why it cannot engage rather than going quiet", () => {
    const mission = startedMission(7, "driver-indoor");
    const spawner = mission.spawners[0];
    const unit = mission.units.find((u) => u.team === "tdf");
    if (!spawner || !unit)
      throw new Error("fixture needs a unit and a spawner");
    const graph = buildMoveGraph(mission.map);

    // A destroyed target.
    expect(
      nextActionAgainst(
        {
          ...mission,
          spawners: mission.spawners.map((s) => ({
            ...s,
            destroyed: true,
            hp: 0,
          })),
        },
        unit.id,
        spawner.id,
        OBJECTIVE_TUNING,
        graph,
      ),
    ).toEqual({ kind: "blocked", reason: "target-gone" });

    // A unit with no actions left.
    expect(
      nextActionAgainst(
        {
          ...mission,
          units: mission.units.map((u) =>
            u.id === unit.id ? { ...u, ap: 0 } : u,
          ),
        },
        unit.id,
        spawner.id,
        OBJECTIVE_TUNING,
        graph,
      ),
    ).toEqual({ kind: "blocked", reason: "unit-unavailable" });

    // The bugs' phase is not the player's.
    expect(
      nextActionAgainst(
        { ...mission, phase: "bugs" },
        unit.id,
        spawner.id,
        OBJECTIVE_TUNING,
        graph,
      ),
    ).toEqual({ kind: "blocked", reason: "unit-unavailable" });
  });
});
