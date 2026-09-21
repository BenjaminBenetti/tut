import { manhattanDistance } from "../../core/service/grid-math";
import { describe, expect, it } from "vitest";

import { INSTALLATION_SITES } from "../../content/data/installation-sites";
import { MISSION_TYPES } from "../../content/data/mission-types";
import type { DeployableTypeId } from "../../content/model/deployable-type-id";
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
import { GARRISON_TUNING } from "../data/garrison-tuning";
import { GENERATOR_TUNING } from "../data/generator-tuning";
import { HAZARD_TUNING } from "../data/hazard-tuning";
import { OBJECTIVE_TUNING } from "../data/objective-tuning";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { UNIT_TUNING } from "../data/unit-tuning";
import { ATTACK } from "../model/attack-command";
import { BUGS_SPAWNED } from "../model/bugs-spawned-event";
import { END_TURN, endTurn } from "../model/end-turn-command";
import { EXTRACT } from "../model/extract-command";
import { GENERATOR_DESTROYED } from "../model/generator-destroyed-event";
import { INTERACT } from "../model/interact-command";
import { MOVE } from "../model/move-command";
import { OVERWATCH } from "../model/overwatch-command";
import { RELOAD } from "../model/reload-command";
import type { TacticalContext } from "../model/tactical-handler";
import type { TacticalEvent } from "../model/tactical-event";
import type {
  DefendGeneratorsObjective,
  TacticalState,
} from "../model/tactical-state";
import { createAttackHandler } from "./combat-service";
import { createDefenceStep, defendStatus } from "./defence-service";
import { objectivesComplete } from "./mission-end-service";
import { startTacticalMission } from "./mission-start-service";
import type { DriverAction } from "./mission-driver.test-helper";
import {
  homewardAction,
  missionViolations,
  nextActionAgainst,
} from "./mission-driver.test-helper";
import { createMoveHandler } from "./move-handler";
import type { MoveGraph } from "./movement-service";
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
import { fixtureAttackDeps } from "./tactical-fixtures.test-helper";
import { createBurnStep, createHazardReaction } from "./tile-effect-service";
import {
  createEndTurnHandler,
  createOverwatchReaction,
  DEFAULT_PHASE_STEPS,
} from "./turn-service";

// ===========================================
// Harness
// ===========================================

/** The shipped rules with the defence step, assembled without `app/`. */
function rules(): TacticalHandlers {
  const spawn = { species: Object.values(BUG_SPECIES), tuning: SPAWN_TUNING };
  const attackDeps = fixtureAttackDeps();
  const actions: TacticalHandlers = {
    [ATTACK]: createAttackHandler(COMBAT_TUNING, attackDeps),
    [MOVE]: createMoveHandler(
      createHazardReaction(
        HAZARD_TUNING,
        COMBAT_TUNING,
        createOverwatchReaction(COMBAT_TUNING, attackDeps),
      ),
    ),
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
        createBurnStep(HAZARD_TUNING, COMBAT_TUNING),
        createHatchStep(spawn),
        createEdgeWaveStep(spawn),
        createDefenceStep(),
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

/** A campaign with one small defence of `installation`, started. */
function startedDefence(
  seed: number,
  mapSeed: string,
  difficulty: number,
  installation: DeployableTypeId,
  waves: number,
): { mission: TacticalState; ids: SequentialIdGenerator } {
  const base: GameState = createNewGame(
    { seed, createdAt: "2026-09-19T00:00:00.000Z" },
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
    typeId: "defend-installation",
    cityId: city.id,
    difficulty,
    mapParams: {
      biome: region.biome,
      settlement: city.scale,
      size: "small",
      seed: mapSeed,
    },
    rewards: { credits: 300, techPoints: 0 },
    createdDay: 1,
    expiresDay: 4,
    ignorePenalty: 15,
    defence: {
      installation,
      deployableId: "deployable-1",
      generators: INSTALLATION_SITES[installation].generators,
      waves,
    },
  };
  const parts = new StaticPartCatalogue(STARTER_PARTS);
  const ids = new SequentialIdGenerator();
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
      garrison: GARRISON_TUNING,
      generator: GENERATOR_TUNING,
      ids,
      registries: createDefaultRegistries(),
    },
  );
  if (!started.ok)
    throw new Error(`mission did not start: ${started.error.kind}`);
  const active = started.value.activeMission;
  if (!active) throw new Error("no active mission");
  return { mission: active, ids };
}

/** What one seeded defence came to. */
interface DefenceRun {
  readonly seed: string;
  readonly difficulty: number;
  readonly installation: DeployableTypeId;
  readonly waves: number;
  /** `won`, `extracted` or `lost` from the rules; `held` when the defence was complete but the force still on the map at the cap; else `unresolved`. */
  readonly outcome: string;
  /** Where the defence stood when the run stopped. */
  readonly status: string;
  readonly turns: number;
  /** Edge waves that landed, from the log. */
  readonly wavesLanded: number;
  /** Generators wrecked, from the log. */
  readonly generatorsLost: number;
  /** True when any generator took damage. */
  readonly generatorsHit: boolean;
  /** Bugs the mission sent in, waves and hatches together. */
  readonly bugsSent: number;
  /** TDF units dead on the map when the run stopped. */
  readonly tdfLost: number;
  readonly tdfAlive: number;
  readonly bugsAlive: number;
  readonly violations: readonly string[];
}

/**
 * A shot at the nearest bug the unit can reach a firing position on;
 * blocked when none is in reach. The defence driver holds its ground
 * and shoots, which is what the mission asks of a player.
 */
function fight(
  mission: TacticalState,
  unitId: string,
  graph: MoveGraph,
): DriverAction {
  const unit = mission.units.find((u) => u.id === unitId);
  if (!unit) {
    return { kind: "blocked", reason: "unit-unavailable" };
  }
  const bugs = mission.units
    .filter((u) => u.team === "bugs" && u.hp > 0)
    .sort(
      (a, b) =>
        manhattanDistance(unit.pos, a.pos) - manhattanDistance(unit.pos, b.pos),
    );
  for (const bug of bugs.slice(0, 4)) {
    const action = nextActionAgainst(
      mission,
      unitId,
      bug.id,
      OBJECTIVE_TUNING,
      graph,
      "fire",
    );
    if (action.kind !== "blocked") {
      return action;
    }
  }
  return { kind: "blocked", reason: "target-gone" };
}

/** Home once the defence is done, shooting whatever blocks the way. */
function homewardOrFight(
  mission: TacticalState,
  unitId: string,
  graph: MoveGraph,
): DriverAction {
  const home = homewardAction(mission, unitId, graph);
  if (home.kind !== "blocked" || home.reason !== "no-route") {
    return home;
  }
  const shot = fight(mission, unitId, graph);
  return shot.kind === "blocked" ? home : shot;
}

/**
 * Plays one seeded defence to its end or to `maxTurns`: every TDF unit
 * shoots the nearest bug it can, and once the defence is complete walks
 * home. Invariants are checked after every turn.
 */
function play(
  mapSeed: string,
  difficulty: number,
  installation: DeployableTypeId,
  waves: number,
  maxTurns: number,
): DefenceRun {
  const start = startedDefence(7, mapSeed, difficulty, installation, waves);
  let mission = start.mission;
  const handlers = rules();
  const ids = start.ids;
  const graph = buildMoveGraph(mission.map);
  const violations: string[] = [];
  const seen = new Set<string>();
  let turns = 0;
  const generatorIds = new Set(
    mission.units.filter((u) => u.kind === "generator").map((u) => u.id),
  );
  let generatorsHit = false;
  // The in-domain applier hands events back rather than logging them;
  // the sweep keeps its own log.
  const events: TacticalEvent[] = [];

  const ctxFor = (label: string): TacticalContext => ({
    rng: new Mulberry32Rng(99).fork(label),
    ids,
  });

  while (turns < maxTurns && mission.outcome === undefined) {
    const done = objectivesComplete(mission);
    for (const unit of mission.units.filter(
      (u) => u.team === "tdf" && u.kind !== "generator" && u.kind !== "turret",
    )) {
      for (let action = 0; action < 6; action++) {
        const live = mission.units.find((u) => u.id === unit.id);
        if (live === undefined || live.hp <= 0) {
          break;
        }
        if (live.ap <= 0 && !done) {
          break;
        }
        const next = done
          ? homewardOrFight(mission, unit.id, graph)
          : fight(mission, unit.id, graph);
        if (next.kind === "blocked") {
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
        events.push(...applied.value.events);
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
    events.push(...ended.value.events);
    turns++;
    if (
      mission.units.some(
        (u) => generatorIds.has(u.id) && u.hp < GENERATOR_TUNING.maxHp,
      )
    ) {
      generatorsHit = true;
    }
    for (const problem of missionViolations(mission)) {
      if (!seen.has(problem)) {
        seen.add(problem);
        violations.push(`turn ${String(turns)}: ${problem}`);
      }
    }
  }

  const objective = mission.objectives.find(
    (o): o is DefendGeneratorsObjective => o.kind === "defend-generators",
  );
  const status = objective ? defendStatus(mission, objective) : "none";
  const edgeWaves = events.filter(
    (event) => event.type === BUGS_SPAWNED && event.payload.source === "edge",
  );
  const bugsSent = events.reduce(
    (sum, event) =>
      event.type === BUGS_SPAWNED ? sum + event.payload.unitIds.length : sum,
    0,
  );
  for (const event of edgeWaves) {
    if (event.type !== BUGS_SPAWNED) continue;
    if (event.payload.totalWaves !== waves) {
      violations.push(`wave event without the mission's total`);
    }
    if ((event.payload.wave ?? 0) > waves) {
      violations.push(
        `wave ${String(event.payload.wave)} landed past the total ${String(waves)}`,
      );
    }
  }
  return {
    seed: mapSeed,
    difficulty,
    installation,
    waves,
    outcome:
      mission.outcome ?? (objectivesComplete(mission) ? "held" : "unresolved"),
    status,
    turns,
    wavesLanded: edgeWaves.length,
    generatorsLost: events.filter((event) => event.type === GENERATOR_DESTROYED)
      .length,
    bugsSent,
    tdfLost: mission.units.filter(
      (u) => u.team === "tdf" && u.kind !== "generator" && u.hp <= 0,
    ).length,
    generatorsHit,
    tdfAlive: mission.units.filter(
      (u) => u.team === "tdf" && u.kind !== "generator" && u.hp > 0,
    ).length,
    bugsAlive: mission.units.filter((u) => u.team === "bugs" && u.hp > 0)
      .length,
    violations,
  };
}

// ===========================================
// The sweep
// ===========================================

const INSTALLATIONS: readonly DeployableTypeId[] = [
  "sensor-array",
  "repellent-dispersal",
  "defensive-battery",
  "bank",
];

/** Twelve defences across the difficulty band and all four installations. */
const SEEDS = Array.from({ length: 12 }, (_, i) => ({
  seed: `defence-${String(i)}`,
  difficulty: ((i * 3) % 10) + 1,
  installation: INSTALLATIONS[i % INSTALLATIONS.length]!,
  waves: 3 + (i % 3),
}));

/**
 * Turns a defence gets. Waves land from turn 3 every 2-4 turns, so
 * five waves are in by turn 20 at the slowest; the rest is the clean-up
 * and the walk home.
 */
const TURN_CAP = Number(process.env.SIM_TURN_CAP ?? "30");

const BUDGET_MS = 300_000 * Math.max(1, TURN_CAP / 30);

describe("seeded defence sweep (#1175)", () => {
  const startedAt = performance.now();
  const runs = SEEDS.map(({ seed, difficulty, installation, waves }) =>
    play(seed, difficulty, installation, waves, TURN_CAP),
  );
  const elapsed = performance.now() - startedAt;
  const summary = runs
    .map(
      (r) =>
        `${r.seed} d${String(r.difficulty)} ${r.installation} ${String(r.waves)}w: ${r.outcome}/${r.status} t${String(r.turns)} waves=${String(r.wavesLanded)} hit=${String(r.generatorsHit)} lost=${String(r.generatorsLost)} sent=${String(r.bugsSent)} tdfLost=${String(r.tdfLost)} tdf=${String(r.tdfAlive)} bugs=${String(r.bugsAlive)}`,
    )
    .join("\n");

  it("breaks no invariant on any turn of any seed", () => {
    expect(
      runs.flatMap((r) => r.violations.map((v) => `${r.seed}: ${v}`)),
    ).toEqual([]);
  });

  it("lands every counted wave and not one more", () => {
    // Every seed sees its waves land by the cap: the schedule is the
    // timer, not the bugs' health, so nothing can hold a wave back.
    for (const run of runs) {
      expect(run.wavesLanded, summary).toBe(run.waves);
    }
  });

  it("brings the bugs to the generators", () => {
    // The point of the objective: the swarm goes for the installation.
    // Measured on the first run: 10 of 12 seeds saw a generator take
    // damage before the cap, and 3 lost one outright.
    const pressed = runs.filter((r) => r.generatorsHit).length;
    expect(pressed, summary).toBeGreaterThanOrEqual(RUNS_PRESSED_FLOOR);
  });

  it("is held by a force that stands its ground and shoots", () => {
    // Measured on the first run: 12 of 12 held, at every difficulty,
    // with at most three TDF units lost. The driver never moves toward
    // the generators, so this is the floor of what a player can do, and
    // the number to watch when the waves are retuned (#1175): a defence
    // no static force can lose is one to make harder, not easier.
    const held = runs.filter(
      (r) => r.outcome === "won" || r.outcome === "held",
    ).length;
    expect(held, summary).toBeGreaterThanOrEqual(HELD_FLOOR);
  });

  it("plays every seed inside the sweep's time budget", () => {
    expect(elapsed, summary).toBeLessThan(BUDGET_MS);
  });
});

// ===========================================
// Pins
// ===========================================

/** Seeds, of twelve, in which the bugs reach and damage a generator. 10 measured; a ratchet with one seed of slack. */
const RUNS_PRESSED_FLOOR = Number(process.env.SIM_PRESSED_FLOOR ?? "9");
/** Seeds, of twelve, held to the end. 12 measured; two seeds of slack for rules drift. */
const HELD_FLOOR = Number(process.env.SIM_HELD_FLOOR ?? "10");
