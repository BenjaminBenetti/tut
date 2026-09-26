/// <reference types="node" />
import { writeFileSync } from "node:fs";

import { manhattanDistance } from "../../core/service/grid-math";
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
import { MISSION_MAP_RULES } from "../../mapgen/service/missions/mission-map-rules";
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
import { INTERACT } from "../model/interact-command";
import { MOVE } from "../model/move-command";
import { OVERWATCH } from "../model/overwatch-command";
import { RELOAD } from "../model/reload-command";
import { SPORE_POD_MATURED } from "../model/spore-pod-matured-event";
import type { TacticalContext } from "../model/tactical-handler";
import type { TacticalEvent } from "../model/tactical-event";
import type {
  DestroyPodObjective,
  TacticalState,
} from "../model/tactical-state";
import { createAttackHandler } from "./combat-service";
import { objectivesComplete } from "./mission-end-service";
import { startTacticalMission } from "./mission-start-service";
import type { DriverAction } from "./mission-driver.test-helper";
import {
  homewardAction,
  missionViolations,
  nextActionAgainst,
} from "./mission-driver.test-helper";
import { MISSION_SETUP_RULES } from "./missions/mission-setup-rules";
import { createMoveHandler } from "./move-handler";
import type { MoveGraph } from "./movement-service";
import { buildMoveGraph } from "./movement-service";
import { createObjectiveDeadlineStep } from "./objectives/objective-deadline-step";
import {
  createExtractHandler,
  createInteractHandler,
} from "./objective-service";
import { overwatchHandler } from "./overwatch-handler";
import { reloadHandler } from "./reload-handler";
import {
  createEdgeWaveStep,
  createHatchStep,
  createPodBurstStep,
  podHp,
} from "./spawn-service";
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

/**
 * The shipped rules, assembled without `app/`, with the deadline and
 * the pod burst first as the composition root orders them.
 */
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
        createObjectiveDeadlineStep(),
        createPodBurstStep(spawn),
        createBurnStep(HAZARD_TUNING, COMBAT_TUNING),
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

/** A campaign with one crash site, started through the shipped rules. */
function startedCrashSite(
  mapSeed: string,
  difficulty: number,
): { mission: TacticalState; ids: SequentialIdGenerator } {
  const base: GameState = createNewGame(
    { seed: 7, createdAt: "2026-09-26T00:00:00.000Z" },
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
    typeId: "crash-site",
    cityId: city.id,
    difficulty,
    mapParams: {
      biome: region.biome,
      settlement: city.scale,
      size: MAP_SIZE,
      seed: mapSeed,
    },
    rewards: { credits: 300, techPoints: 0 },
    createdDay: 1,
    expiresDay: 4,
    ignorePenalty: 15,
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
      setupRules: MISSION_SETUP_RULES,
      mapRules: MISSION_MAP_RULES,
    },
  );
  if (!started.ok)
    throw new Error(`mission did not start: ${started.error.kind}`);
  const active = started.value.activeMission;
  if (!active) throw new Error("no active mission");
  return { mission: active, ids };
}

/** What one seeded crash site came to. */
interface PodRun {
  readonly seed: string;
  readonly difficulty: number;
  readonly pods: number;
  readonly podHp: number;
  /** Walking distance, as the crow flies, from the nearest unit to the pod at the start. */
  readonly podDistance: number;
  /** The mission turn the pod fell on, or undefined when it did not. */
  readonly killTurn: number | undefined;
  readonly matured: boolean;
  /** Bugs the burst released; zero when the pod never matured. */
  readonly burst: number;
  readonly bursts: number;
  /** Waves that walked in from the edges. */
  readonly edgeWaves: number;
  readonly podDestroyed: boolean | undefined;
  readonly outcome: string;
  readonly turns: number;
  readonly tdfLost: number;
  readonly violations: readonly string[];
}

/** Home once the pod is settled, shooting whatever blocks the way. */
function homewardOrFight(
  mission: TacticalState,
  unitId: string,
  graph: MoveGraph,
): DriverAction {
  const home = homewardAction(mission, unitId, graph);
  if (home.kind !== "blocked" || home.reason !== "no-route") {
    return home;
  }
  const unit = mission.units.find((u) => u.id === unitId);
  if (!unit) {
    return home;
  }
  const bugs = mission.units
    .filter((u) => u.team === "bugs" && u.hp > 0)
    .sort(
      (a, b) =>
        manhattanDistance(unit.pos, a.pos) - manhattanDistance(unit.pos, b.pos),
    );
  for (const bug of bugs.slice(0, 4)) {
    const shot = nextActionAgainst(
      mission,
      unitId,
      bug.id,
      OBJECTIVE_TUNING,
      graph,
      "fire",
    );
    if (shot.kind !== "blocked") {
      return shot;
    }
  }
  return home;
}

/**
 * Plays one crash site: every TDF unit goes for the pod —
 * squads to plant charges, mechs to shoot it — until it falls or
 * matures, then walks home. Invariants are checked after every turn.
 * With `idleTurns`, the force stands still that many turns first: a
 * squad that does, lets the pod mature and burst on a real crater.
 */
function play(
  mapSeed: string,
  difficulty: number,
  maxTurns: number,
  idleTurns = 0,
): PodRun {
  const start = startedCrashSite(mapSeed, difficulty);
  let mission = start.mission;
  const handlers = rules();
  const ids = start.ids;
  const graph = buildMoveGraph(mission.map);
  const violations: string[] = [];
  const seen = new Set<string>();
  const events: TacticalEvent[] = [];
  const objective = mission.objectives.find(
    (o): o is DestroyPodObjective => o.kind === "destroy-pod",
  );
  const pod = mission.spawners.find((s) => s.id === objective?.targetId);
  const podDistance =
    pod === undefined
      ? -1
      : Math.min(
          ...mission.units
            .filter((u) => u.team === "tdf")
            .map((u) => manhattanDistance(u.pos, pod.pos)),
        );
  let killTurn: number | undefined;
  let turns = 0;

  const ctxFor = (label: string): TacticalContext => ({
    rng: new Mulberry32Rng(99).fork(label),
    ids,
  });
  const podObjective = (): DestroyPodObjective | undefined =>
    mission.objectives.find(
      (o): o is DestroyPodObjective => o.id === objective?.id,
    );

  while (turns < maxTurns && mission.outcome === undefined) {
    const standing = mission.spawners.find(
      (s) => s.id === pod?.id && !s.destroyed,
    );
    const idle = mission.turn <= idleTurns;
    for (const unit of mission.units.filter((u) => u.team === "tdf")) {
      for (let action = 0; action < 6 && !idle; action++) {
        const live = mission.units.find((u) => u.id === unit.id);
        if (live === undefined || live.hp <= 0) {
          break;
        }
        if (live.ap <= 0 && standing !== undefined) {
          break;
        }
        const target = mission.spawners.find(
          (s) => s.id === pod?.id && !s.destroyed,
        );
        const next =
          target === undefined
            ? homewardOrFight(mission, unit.id, graph)
            : nextActionAgainst(
                mission,
                unit.id,
                target.id,
                OBJECTIVE_TUNING,
                graph,
              );
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
        if (killTurn === undefined && podObjective()?.complete === true) {
          killTurn = mission.turn;
        }
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
    for (const problem of missionViolations(mission)) {
      if (!seen.has(problem)) {
        seen.add(problem);
        violations.push(`turn ${String(turns)}: ${problem}`);
      }
    }
  }

  const bursts = events.filter(
    (event) => event.type === BUGS_SPAWNED && event.payload.source === "pod",
  );
  const final = podObjective();
  return {
    seed: mapSeed,
    difficulty,
    pods: mission.spawners.filter((s) => s.variant === "spore-pod").length,
    podHp: pod?.hp ?? 0,
    podDistance,
    killTurn,
    matured: events.some((event) => event.type === SPORE_POD_MATURED),
    burst: bursts.reduce(
      (sum, event) =>
        event.type === BUGS_SPAWNED ? sum + event.payload.unitIds.length : sum,
      0,
    ),
    bursts: bursts.length,
    edgeWaves: events.filter(
      (event) => event.type === BUGS_SPAWNED && event.payload.source === "edge",
    ).length,
    podDestroyed: final?.complete,
    outcome:
      mission.outcome ??
      (objectivesComplete(mission) ? "cleared" : "unresolved"),
    turns,
    tdfLost: mission.units.filter((u) => u.team === "tdf" && u.hp <= 0).length,
    violations,
  };
}

// ===========================================
// The sweep
// ===========================================

/** The board a crash site is played on; the crater wants room round its bowl. */
const MAP_SIZE = "medium";

/** Twelve crash sites across the difficulty band. */
const SEEDS = Array.from({ length: 12 }, (_, i) => ({
  seed: `crash-${String(i)}`,
  difficulty: ((i * 3) % 10) + 1,
}));

/**
 * Turns a crash site gets: the pod matures at the end of turn 8 and
 * bursts at the start of turn 9, so 12 sees the burst land and the
 * force turn for home.
 */
const TURN_CAP = Number(process.env.SIM_TURN_CAP ?? "12");

const BUDGET_MS = 300_000 * Math.max(1, TURN_CAP / 12);

describe("seeded spore pod sweep (#1179)", () => {
  const startedAt = performance.now();
  const runs = SEEDS.map(({ seed, difficulty }) =>
    play(seed, difficulty, TURN_CAP),
  );
  // A force that sits out the clock, so the burst lands on real craters.
  const late = SEEDS.slice(0, LATE_SEEDS).map(({ seed, difficulty }) =>
    play(seed, difficulty, TURN_CAP, SPAWN_TUNING.podMaturityTurn),
  );
  const elapsed = performance.now() - startedAt;
  const summary = runs
    .map(
      (r) =>
        `${r.seed} d${String(r.difficulty)}: pod hp=${String(r.podHp)} dist=${String(r.podDistance)} ` +
        `${r.killTurn === undefined ? (r.matured ? "matured" : "standing") : `killed t${String(r.killTurn)}`} ` +
        `burst=${String(r.burst)} edge=${String(r.edgeWaves)} ${r.outcome} t${String(r.turns)} tdfLost=${String(r.tdfLost)}`,
    )
    .join("\n");
  const lateSummary = late
    .map(
      (r) =>
        `${r.seed} d${String(r.difficulty)} idle: ${r.matured ? "matured" : "standing"} ` +
        `burst=${String(r.burst)} ${r.outcome} t${String(r.turns)} tdfLost=${String(r.tdfLost)}`,
    )
    .join("\n");
  const killTurns = runs
    .map((r) => r.killTurn)
    .filter((turn): turn is number => turn !== undefined);
  const distribution = Array.from(
    { length: SPAWN_TUNING.podMaturityTurn },
    (_, i) =>
      `t${String(i + 1)}:${String(killTurns.filter((t) => t === i + 1).length)}`,
  ).join(" ");
  // Vitest keeps a sweep's console to itself; a path in SIM_POD_OUT
  // gets the table and the distribution instead.
  if (process.env.SIM_POD_OUT !== undefined) {
    writeFileSync(
      process.env.SIM_POD_OUT,
      `${summary}\nkill turns: ${distribution} matured=${String(runs.filter((r) => r.matured).length)}\n${lateSummary}\n`,
    );
  }

  it("breaks no invariant on any turn of any seed", () => {
    expect(
      [...runs, ...late].flatMap((r) =>
        r.violations.map((v) => `${r.seed}: ${v}`),
      ),
    ).toEqual([]);
  });

  it("matures the pod of a force that sits out the clock, and bursts it once on the crater", () => {
    for (const run of late) {
      expect(run.killTurn, lateSummary).toBeUndefined();
      expect(run.matured, lateSummary).toBe(true);
      expect(run.bursts, lateSummary).toBe(1);
      expect(run.burst, lateSummary).toBeGreaterThanOrEqual(
        SPAWN_TUNING.podBurstBonus,
      );
      expect(run.burst, lateSummary).toBeLessThanOrEqual(
        SPAWN_TUNING.maxWaveSize,
      );
      expect(run.podDestroyed, lateSummary).toBe(false);
    }
  });

  it("sends no more than the crash site's edge waves, however long it runs", () => {
    for (const run of [...runs, ...late]) {
      expect(run.edgeWaves, summary).toBeLessThanOrEqual(
        SPAWN_TUNING.podEdgeWaves,
      );
    }
  });

  it("stands exactly one pod, with its hit points scaled by difficulty", () => {
    for (const run of runs) {
      expect(run.pods, summary).toBe(1);
      expect(run.podHp, summary).toBe(podHp(run.difficulty, SPAWN_TUNING));
      expect(run.podHp, summary).toBeGreaterThanOrEqual(SPAWN_TUNING.podHp);
    }
  });

  it("either kills the pod by its maturity turn or sees it mature and burst once", () => {
    for (const run of runs) {
      if (run.killTurn !== undefined) {
        expect(run.killTurn, summary).toBeLessThanOrEqual(
          SPAWN_TUNING.podMaturityTurn,
        );
        expect(run.matured, summary).toBe(false);
        expect(run.bursts, summary).toBe(0);
        expect(run.podDestroyed, summary).toBe(true);
      } else {
        expect(run.matured, summary).toBe(true);
        expect(run.bursts, summary).toBe(1);
        expect(run.burst, summary).toBeGreaterThan(0);
        expect(run.podDestroyed, summary).toBe(false);
      }
    }
  });

  it("is a race a force that goes straight for the pod usually wins", () => {
    expect(
      killTurns.length,
      `${summary}\n${distribution}`,
    ).toBeGreaterThanOrEqual(KILLED_FLOOR);
  });

  it("plays every seed inside the sweep's time budget", () => {
    expect(elapsed, summary).toBeLessThan(BUDGET_MS);
  });
});

// ===========================================
// Pins
// ===========================================

/**
 * Seeds, of twelve, in which the pod falls before it matures. 12
 * measured on the first run (kill turns t5:6 t6:2 t7:2 t8:2), two on
 * the very last turn; two seeds of slack for rules drift. A clock no
 * straight-line force ever loses is one to shorten, not lengthen.
 */
const KILLED_FLOOR = Number(process.env.SIM_KILLED_FLOOR ?? "10");

/** Seeds the idle force plays, to land a burst on real maps. */
const LATE_SEEDS = 3;
