/// <reference types="node" />
import { writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import { MapBehaviourRegistry } from "../../bugs/ai/behaviour-registry";
import type { BugBehaviour } from "../../bugs/ai/bug-behaviour";
import { BruteBehaviour } from "../../bugs/ai/brute-behaviour";
import { createBugPhaseRunner } from "../../bugs/ai/bug-phase-runner";
import { LurkerBehaviour } from "../../bugs/ai/lurker-behaviour";
import { SpitterBehaviour } from "../../bugs/ai/spitter-behaviour";
import { SwarmerBehaviour } from "../../bugs/ai/swarmer-behaviour";
import { SPITTER_TUNING } from "../../bugs/data/spitter-tuning";
import {
  BRUTE,
  BUG_SPECIES,
  LURKER,
  SPITTER,
  SWARMER,
} from "../../bugs/data/species";
import { createSpeciesLookup } from "../../bugs/service/species-lookup";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { manhattanDistance } from "../../core/service/grid-math";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { CoverLevel } from "../../mapgen/model/cover";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { TileIndex } from "../../mapgen/service/tile-index";
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
import { HIVE_ASSAULT_SETUP_TUNING } from "../data/hive-assault-setup-tuning";
import { CIVILIAN_TUNING } from "../data/civilian-tuning";
import { HAZARD_TUNING } from "../data/hazard-tuning";
import { OBJECTIVE_TUNING } from "../data/objective-tuning";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { UNIT_TUNING } from "../data/unit-tuning";
import { ATTACK } from "../model/attack-command";
import { ATTACK_RESOLVED } from "../model/attack-resolved-event";
import { END_TURN, endTurn } from "../model/end-turn-command";
import { EXTRACT } from "../model/extract-command";
import { INTERACT } from "../model/interact-command";
import { MOVE } from "../model/move-command";
import { OVERWATCH } from "../model/overwatch-command";
import { RELOAD } from "../model/reload-command";
import type { SpawnSource } from "../model/spawn-source";
import type { TacticalContext } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import { MELEE_RANGE } from "../model/weapon-profile";
import { createAttackHandler } from "./combat-service";
import type { DriverAction } from "./mission-driver.test-helper";
import {
  homewardAction,
  missionViolations,
  nextActionAgainst,
} from "./mission-driver.test-helper";
import { objectivesComplete } from "./mission-end-service";
import { startTacticalMission } from "./mission-start-service";
import { createMoveHandler } from "./move-handler";
import type { MoveGraph } from "./movement-service";
import { buildMoveGraph } from "./movement-service";
import {
  createExtractHandler,
  createInteractHandler,
} from "./objective-service";
import { overwatchHandler } from "./overwatch-handler";
import { reloadHandler } from "./reload-handler";
import { coverAgainst } from "./sight-service";
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
import { templateIdFor } from "./unit-factory";
import { attackDistance } from "./weapon-reach-service";

// ===========================================
// What this measures (#1179)
// ===========================================

/*
 * The spitter ships at hatch weight 0 — nothing rolls it until the
 * bestiary gives it a mission mix — so the shipped sweeps cannot see it.
 * This one plays the same maps under three swarms:
 *
 *   shipped      Object.values(BUG_SPECIES), all four behaviours: what
 *                the game runs today, the spitter present at weight 0
 *   pre-spitter  swarmer, lurker, brute and their three behaviours: the
 *                game before #1179 (half the maps)
 *   spitters     swarmer 5 : lurker 3 : brute 1 : spitter 2
 *
 * `shipped` must equal `pre-spitter` run for run: a weight-0 species
 * costs the spawn roll nothing, so adding one moves no existing number.
 * `spitters` against `shipped` is the measurement — win rates, how often
 * a spitter fires from cover, and whether any mission stalls.
 *
 *   SIM_SPITTER_OUT=/tmp/spitter.tsv \
 *     node_modules/.bin/vitest run --config vitest.sim.config.ts \
 *     src/tactical/service/spitter-sweep.sim.test.ts
 */

// ===========================================
// Harness
// ===========================================

/** One swarm to play: who hatches, who drives them, and on which maps. */
interface Swarm {
  readonly name: string;
  readonly species: readonly SpawnSource[];
  readonly behaviours: readonly BugBehaviour[];
  readonly seeds: readonly string[];
}

/** Melee behaviours every swarm uses. */
function meleeBehaviours(): BugBehaviour[] {
  return [new LurkerBehaviour(), new SwarmerBehaviour(), new BruteBehaviour()];
}

/**
 * `mission-sweep`'s paired maps (#734), so a row here reads against the
 * paired baseline: the same terrain and force, only the swarm moved.
 */
const MAP_SEEDS = Array.from({ length: 6 }, (_, i) => `paired-${String(i)}`);

/**
 * The maps the pre-spitter game replays. Half of them: equality either
 * holds run for run or it does not, and the whole set would add a third
 * to the sweep's cost to say it again.
 */
const EQUALITY_SEEDS = MAP_SEEDS.slice(0, 3);

/** The mix the sweep hatches spitters in: swarmer 5 : lurker 3 : brute 1 : spitter 2. */
const SPITTER_MIX: readonly SpawnSource[] = [
  { ...SWARMER, hatchWeight: 5 },
  { ...LURKER, hatchWeight: 3 },
  { ...BRUTE, hatchWeight: 1 },
  { ...SPITTER, hatchWeight: 2 },
];

/**
 * Opt-in (`SIM_SPITTER_CONTROL=1`): the same mix with spitters that do
 * not price cover, so "fires from cover" has a chance rate to read
 * against. A measurement, not a gate.
 */
const CONTROL = process.env.SIM_SPITTER_CONTROL === "1";

/** The swarms, in the order the header describes them. */
const SWARMS: readonly Swarm[] = [
  {
    name: "shipped",
    species: Object.values(BUG_SPECIES),
    behaviours: [...meleeBehaviours(), new SpitterBehaviour()],
    seeds: MAP_SEEDS,
  },
  {
    name: "pre-spitter",
    species: [SWARMER, LURKER, BRUTE],
    behaviours: meleeBehaviours(),
    seeds: EQUALITY_SEEDS,
  },
  {
    name: "spitters",
    species: SPITTER_MIX,
    behaviours: [...meleeBehaviours(), new SpitterBehaviour()],
    seeds: MAP_SEEDS,
  },
  ...(CONTROL
    ? [
        {
          name: "spitters-no-cover",
          species: SPITTER_MIX,
          behaviours: [
            ...meleeBehaviours(),
            new SpitterBehaviour({ ...SPITTER_TUNING, coverWeight: 0 }),
          ],
          seeds: MAP_SEEDS,
        },
      ]
    : []),
];

/** The shipped rules with `swarm` hatching, assembled without `app/`. */
function rules(swarm: Swarm): TacticalHandlers {
  const spawn = { species: swarm.species, tuning: SPAWN_TUNING };
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
      ],
      createBugPhaseRunner({
        handlers: actions,
        registry: new MapBehaviourRegistry([...swarm.behaviours]),
        speciesOf: createSpeciesLookup(BUG_SPECIES),
        combat: COMBAT_TUNING,
      }),
    ),
  };
}

/** A campaign with one small clearance mission, started (as `mission-sweep`). */
function startedMission(
  mapSeed: string,
  difficulty: number,
): { mission: TacticalState; ids: SequentialIdGenerator } {
  const base: GameState = createNewGame(
    { seed: 7, createdAt: "2026-09-04T00:00:00.000Z" },
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
    difficulty,
    mapParams: {
      biome: region.biome,
      settlement: city.scale,
      size: "small",
      seed: mapSeed,
    },
    rewards: { credits: 300, techPoints: 0 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
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
      civilian: CIVILIAN_TUNING,
      hiveGuard: BUG_SPECIES["hive-guard"],
      hiveAssault: HIVE_ASSAULT_SETUP_TUNING,
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

/** What the spitters did over one mission. */
interface SpitterTally {
  /** Spits resolved. */
  readonly shots: number;
  readonly hits: number;
  readonly damage: number;
  /** Spits fired from a tile with low or high cover against the target. */
  readonly fromCover: number;
  /** Of those, from high cover. */
  readonly fromHigh: number;
  /** Bug phases a live spitter ended with a live TDF unit beside it. */
  readonly contactEnds: number;
  /** Bug phases a live spitter ended, the denominator for `contactEnds`. */
  readonly phaseEnds: number;
  /** The most spitters standing at the end of any turn. */
  readonly peakAlive: number;
  /** Hit points every bug attack took from the TDF, spits included. */
  readonly tdfDamage: number;
}

/** What one seeded mission came to under one swarm. */
interface SweepRun {
  readonly swarm: string;
  readonly seed: string;
  readonly difficulty: number;
  /** `won`/`extracted`/`lost`, else `cleared` or `unresolved` at the cap (as `mission-sweep`). */
  readonly outcome: string;
  readonly turns: number;
  readonly violations: readonly string[];
  readonly tdfAlive: number;
  /** TDF units killed; boarded units leave `units` and are not counted. */
  readonly tdfLost: number;
  readonly extracted: number;
  readonly bugsAlive: number;
  readonly spitters: SpitterTally;
  readonly driveMs: number;
}

/** The way home, or a shot at whatever is in the way (as `mission-sweep`). */
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
    const fight = nextActionAgainst(
      mission,
      unitId,
      bug.id,
      OBJECTIVE_TUNING,
      graph,
      "fire",
    );
    if (fight.kind !== "blocked") {
      return fight;
    }
  }
  return home;
}

const SPITTER_TEMPLATE = templateIdFor("bug", SPITTER.id);

/**
 * Counts one bug phase's spits from the state it left behind. An attack
 * ends a bug's turn, so a spitter stands after the phase where it fired
 * from, and the TDF does not move during the phase: cover is measured
 * between those two tiles by the rule `hitChance` uses (`coverAgainst`).
 */
function tallyPhase(
  before: SpitterTally,
  after: TacticalState,
  events: readonly { readonly type: string; readonly payload: unknown }[],
  index: TileIndex,
): SpitterTally {
  let {
    shots,
    hits,
    damage,
    fromCover,
    fromHigh,
    contactEnds,
    phaseEnds,
    tdfDamage,
  } = before;
  const byId = new Map(after.units.map((u) => [u.id, u]));
  for (const event of events) {
    if (event.type !== ATTACK_RESOLVED) continue;
    const p = event.payload as {
      attackerId: string;
      targetId: string;
      hit: boolean;
      damage: number;
    };
    const attacker = byId.get(p.attackerId);
    const target = byId.get(p.targetId);
    if (attacker?.team === "bugs" && target?.team === "tdf") {
      tdfDamage += p.damage;
    }
    if (attacker?.templateId !== SPITTER_TEMPLATE || target === undefined) {
      continue;
    }
    shots++;
    hits += p.hit ? 1 : 0;
    damage += p.damage;
    const cover = coverAgainst(after.map, attacker.pos, target.pos, index);
    fromCover += cover > CoverLevel.NONE ? 1 : 0;
    fromHigh += cover >= CoverLevel.HIGH ? 1 : 0;
  }
  const tdf = after.units.filter((u) => u.team === "tdf" && u.hp > 0);
  const spitters = after.units.filter(
    (u) => u.templateId === SPITTER_TEMPLATE && u.hp > 0,
  );
  for (const spitter of spitters) {
    phaseEnds++;
    if (tdf.some((u) => attackDistance(spitter.pos, u.pos) <= MELEE_RANGE)) {
      contactEnds++;
    }
  }
  return {
    shots,
    hits,
    damage,
    fromCover,
    fromHigh,
    contactEnds,
    phaseEnds,
    peakAlive: Math.max(before.peakAlive, spitters.length),
    tdfDamage,
  };
}

/**
 * Plays one seeded mission under `swarm` to its end or to `maxTurns`,
 * with `mission-sweep`'s driver: every TDF unit at the nearest standing
 * spawner, then home, each turn ended through the real `EndTurn`.
 */
function play(
  swarm: Swarm,
  mapSeed: string,
  difficulty: number,
  maxTurns: number,
): SweepRun {
  const start = startedMission(mapSeed, difficulty);
  const droveAt = performance.now();
  let mission = start.mission;
  const handlers = rules(swarm);
  const ids = start.ids;
  const graph = buildMoveGraph(mission.map);
  const index = new TileIndex(mission.map);
  const violations: string[] = [];
  const seen = new Set<string>();
  let tally: SpitterTally = {
    shots: 0,
    hits: 0,
    damage: 0,
    fromCover: 0,
    fromHigh: 0,
    contactEnds: 0,
    phaseEnds: 0,
    peakAlive: 0,
    tdfDamage: 0,
  };
  let turns = 0;

  const ctxFor = (label: string): TacticalContext => ({
    rng: new Mulberry32Rng(99).fork(label),
    ids,
  });

  while (turns < maxTurns && mission.outcome === undefined) {
    const target = mission.spawners.find((s) => !s.destroyed);
    for (const unit of mission.units.filter((u) => u.team === "tdf")) {
      for (let action = 0; action < 6; action++) {
        const live = mission.units.find((u) => u.id === unit.id);
        if (live === undefined || live.hp <= 0) break;
        if (live.ap <= 0 && target !== undefined) break;
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
        if (next.kind === "blocked") break;
        const applied = applyTacticalCommand(
          handlers,
          mission,
          next.command,
          ctxFor(`${String(turns)}:${unit.id}:${String(action)}`),
        );
        if (!applied.ok) break;
        mission = applied.value.state;
      }
    }
    const ended = applyTacticalCommand(
      handlers,
      mission,
      endTurn(),
      ctxFor(`${String(turns)}:end`),
    );
    if (!ended.ok) break;
    mission = ended.value.state;
    tally = tallyPhase(tally, mission, ended.value.events, index);
    turns++;
    for (const problem of missionViolations(mission)) {
      if (!seen.has(problem)) {
        seen.add(problem);
        violations.push(`turn ${String(turns)}: ${problem}`);
      }
    }
  }

  return {
    swarm: swarm.name,
    seed: mapSeed,
    difficulty,
    outcome:
      mission.outcome ??
      (objectivesComplete(mission) ? "cleared" : "unresolved"),
    turns,
    violations,
    tdfAlive: mission.units.filter((u) => u.team === "tdf" && u.hp > 0).length,
    tdfLost: mission.units.filter((u) => u.team === "tdf" && u.hp <= 0).length,
    extracted: mission.extracted.length,
    bugsAlive: mission.units.filter((u) => u.team === "bugs" && u.hp > 0)
      .length,
    spitters: tally,
    driveMs: performance.now() - droveAt,
  };
}

// ===========================================
// The sweep
// ===========================================

/** Easy, the cliff, and hard (campaign arc §14's d2 / d5 / d8 checkpoints). */
const DIFFICULTIES = [2, 5, 8] as const;

/**
 * `mission-sweep`'s cap, for the same reason: past it the bug count and
 * the cost per turn climb together. A seed still playing at the cap is
 * `unresolved`, not stuck. Overridable for a deeper measurement.
 */
const TURN_CAP = Number(process.env.SIM_SPITTER_TURN_CAP ?? "15");

/** The whole sweep's budget: the brief's five minutes, scaled with the cap. */
const BUDGET_MS = 300_000 * Math.max(1, TURN_CAP / 15);

/** A run whose objectives were finished, home or not (as `mission-sweep`). */
function cleared(run: SweepRun): boolean {
  return run.outcome === "won" || run.outcome === "cleared";
}

/** Everything but the clock, for comparing two swarms run for run. */
function comparable(run: SweepRun): string {
  const { swarm: _swarm, driveMs: _ms, ...rest } = run;
  return JSON.stringify(rest);
}

/** `d2 6/6 (6 home), d5 …` for one swarm: cleared, and of those extracted. */
function winTable(runs: readonly SweepRun[]): string {
  return DIFFICULTIES.map((d) => {
    const at = runs.filter((run) => run.difficulty === d);
    const home = at.filter((run) => run.outcome === "won").length;
    return `d${String(d)} ${String(at.filter(cleared).length)}/${String(at.length)} (${String(home)} home)`;
  }).join(", ");
}

describe("spitter sweep (#1179)", () => {
  const runs = new Map<string, SweepRun[]>();
  let elapsedMs = 0;

  beforeAll(() => {
    const started = performance.now();
    for (const swarm of SWARMS) {
      runs.set(
        swarm.name,
        swarm.seeds.flatMap((seed) =>
          DIFFICULTIES.map((d) => play(swarm, seed, d, TURN_CAP)),
        ),
      );
    }
    elapsedMs = performance.now() - started;
    const out = process.env.SIM_SPITTER_OUT;
    if (out !== undefined) {
      const header = [
        "swarm",
        "seed",
        "difficulty",
        "outcome",
        "turns",
        "tdfAlive",
        "tdfLost",
        "extracted",
        "bugsAlive",
        "tdfDamage",
        "shots",
        "hits",
        "damage",
        "fromCover",
        "fromHigh",
        "contactEnds",
        "phaseEnds",
        "peakAlive",
        "driveMs",
      ].join("\t");
      const rows = [...runs.values()]
        .flat()
        .map((run) =>
          [
            run.swarm,
            run.seed,
            run.difficulty,
            run.outcome,
            run.turns,
            run.tdfAlive,
            run.tdfLost,
            run.extracted,
            run.bugsAlive,
            run.spitters.tdfDamage,
            run.spitters.shots,
            run.spitters.hits,
            run.spitters.damage,
            run.spitters.fromCover,
            run.spitters.fromHigh,
            run.spitters.contactEnds,
            run.spitters.phaseEnds,
            run.spitters.peakAlive,
            Math.round(run.driveMs),
          ].join("\t"),
        );
      writeFileSync(out, `${header}\n${rows.join("\n")}\n`);
    }
  });

  /** The runs of one swarm. */
  const of = (name: string): SweepRun[] => runs.get(name) ?? [];

  it("breaks no invariant under any swarm", () => {
    expect(
      [...runs.values()]
        .flat()
        .filter((run) => run.violations.length > 0)
        .map(
          (run) =>
            `${run.swarm} ${run.seed} d${String(run.difficulty)}: ${run.violations.join("; ")}`,
        ),
    ).toEqual([]);
  });

  it("moves no shipped number: a spitter at weight 0 plays exactly as the game before it", () => {
    const shipped = of("shipped")
      .filter((run) => EQUALITY_SEEDS.includes(run.seed))
      .map(comparable);
    expect(shipped).toHaveLength(EQUALITY_SEEDS.length * DIFFICULTIES.length);
    expect(shipped).toEqual(of("pre-spitter").map(comparable));
    expect(of("shipped").every((run) => run.spitters.shots === 0)).toBe(true);
  });

  it("hatches spitters that fire, mostly from cover and rarely in contact", () => {
    const tally = of("spitters").reduce(
      (sum, run) => ({
        shots: sum.shots + run.spitters.shots,
        hits: sum.hits + run.spitters.hits,
        fromCover: sum.fromCover + run.spitters.fromCover,
        fromHigh: sum.fromHigh + run.spitters.fromHigh,
        contactEnds: sum.contactEnds + run.spitters.contactEnds,
        phaseEnds: sum.phaseEnds + run.spitters.phaseEnds,
      }),
      {
        shots: 0,
        hits: 0,
        fromCover: 0,
        fromHigh: 0,
        contactEnds: 0,
        phaseEnds: 0,
      },
    );
    const summary =
      `${String(tally.shots)} spits, ${String(tally.hits)} hits, ` +
      `${String(tally.fromCover)} from cover (${String(tally.fromHigh)} high); ` +
      `${String(tally.contactEnds)} of ${String(tally.phaseEnds)} spitter turns ended in contact`;
    // Reported through the assertion so a passing run still says what
    // the spitters did. Measured at the 15-turn cap: 79 spits, 45 from
    // cover (8 high), and 0 of 158 turns ended in contact. The control
    // (`SIM_SPITTER_CONTROL=1`, cover unpriced) fires the same 79 spits
    // with 3 from cover, so cover is the behaviour's doing, not the
    // maps'. The floors sit between the two — a third from cover — so
    // they catch a snipe that stopped firing or stopped seeking cover,
    // not ordinary drift.
    expect([summary, tally.shots > 0]).toEqual([summary, true]);
    expect([summary, tally.fromCover * 3 >= tally.shots]).toEqual([
      summary,
      true,
    ]);
    expect([summary, tally.contactEnds * 10 <= tally.phaseEnds]).toEqual([
      summary,
      true,
    ]);
  });

  it("reports win rates with and without spitters", () => {
    const table = `without ${winTable(of("shipped"))}; with ${winTable(of("spitters"))}`;
    expect([table, of("spitters").length]).toEqual([
      table,
      MAP_SEEDS.length * DIFFICULTIES.length,
    ]);
  });

  it("stalls no mission: an unresolved run always has both sides still standing", () => {
    expect(
      [...runs.values()]
        .flat()
        .filter(
          (run) =>
            run.outcome === "unresolved" &&
            (run.tdfAlive === 0 || run.bugsAlive === 0),
        )
        .map(
          (run) =>
            `${run.swarm} ${run.seed} d${String(run.difficulty)}: tdf ${String(run.tdfAlive)}, bugs ${String(run.bugsAlive)}`,
        ),
    ).toEqual([]);
  });

  it("plays every swarm inside the sweep's time budget", () => {
    const cost = SWARMS.map((swarm) => {
      const ms = of(swarm.name).reduce((sum, run) => sum + run.driveMs, 0);
      return `${swarm.name} ${(ms / 1000).toFixed(1)}s`;
    }).join(", ");
    const summary = `${(elapsedMs / 1000).toFixed(1)}s in all (${cost} driving)`;
    expect([summary, elapsedMs < BUDGET_MS]).toEqual([summary, true]);
  });
});
