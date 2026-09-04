import { beforeAll, describe, expect, it } from "vitest";

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
import { startTacticalMission } from "./mission-start-service";
import {
  missionViolations,
  nextActionAgainst,
} from "./mission-driver.test-helper";
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
function startedMission(
  seed: number,
  mapSeed: string,
  difficulty: number,
): { mission: TacticalState; ids: SequentialIdGenerator } {
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
    difficulty,
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
  // The one generator for the whole run. A fresh one for the driving
  // context would hand hatched bugs ids the deployed units already hold,
  // and `units.find(byId)` would then answer with whichever came first.
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

/** What one seeded mission came to. */
interface SweepRun {
  readonly seed: string;
  /** The difficulty this seed was played at, 1-10. */
  readonly difficulty: number;
  /** Milliseconds spent generating the map and placing the force. */
  readonly startMs: number;
  /** Milliseconds spent driving the mission through the rules. */
  readonly driveMs: number;
  readonly outcome: string;
  readonly turns: number;
  readonly violations: readonly string[];
}

/**
 * Plays one seeded mission to its end or to `maxTurns`, driving every TDF
 * unit at the nearest standing spawner and ending each turn through the
 * real `EndTurn` so the bugs hatch, walk and shoot back.
 *
 * Invariants are checked after **every** turn, not at the end: a unit
 * standing inside a wall on turn six should fail on turn six rather than
 * be masked by a tidy final state.
 */
function play(mapSeed: string, difficulty: number, maxTurns: number): SweepRun {
  const startedAt = performance.now();
  const start = startedMission(7, mapSeed, difficulty);
  const startMs = performance.now() - startedAt;
  const droveAt = performance.now();
  let mission = start.mission;
  const handlers = rules();
  const ids = start.ids;
  const graph = buildMoveGraph(mission.map);
  const violations: string[] = [];
  const seen = new Set<string>();
  let turns = 0;

  const ctxFor = (label: string): TacticalContext => ({
    rng: new Mulberry32Rng(99).fork(label),
    ids,
  });

  while (turns < maxTurns && mission.outcome === undefined) {
    const target = mission.spawners.find((s) => !s.destroyed);
    for (const unit of mission.units.filter((u) => u.team === "tdf")) {
      for (let action = 0; action < 6 && target !== undefined; action++) {
        const live = mission.units.find((u) => u.id === unit.id);
        if (live === undefined || live.hp <= 0 || live.ap <= 0) {
          break;
        }
        const next = nextActionAgainst(
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
    // Each distinct problem once, tagged with the turn it first appeared:
    // a unit stuck in a wall on turn six otherwise reports on every turn
    // after it, burying the turn that actually matters.
    for (const problem of missionViolations(mission)) {
      if (!seen.has(problem)) {
        seen.add(problem);
        violations.push(`turn ${String(turns)}: ${problem}`);
      }
    }
  }

  return {
    seed: mapSeed,
    startMs,
    driveMs: performance.now() - droveAt,
    difficulty,
    outcome: mission.outcome ?? "unresolved",
    turns,
    violations,
  };
}

// ===========================================
// The sweep
// ===========================================

/**
 * Seeds to play, sixty of them per #343 — and across the whole difficulty
 * band, not all at 1. A sweep of sixty walkovers says nothing about
 * whether missions are winnable; it says the sample was easy.
 */
const SEEDS = Array.from({ length: 60 }, (_, i) => ({
  seed: `sweep-${String(i)}`,
  difficulty: (i % 10) + 1,
}));

/**
 * Turns a mission gets before the sweep calls it unresolved.
 *
 * Thirty, not sixty. A mission the driver has not resolved in thirty
 * turns is a finding either way, and the back half of a stalled run is
 * the most expensive part of the sweep: bug counts grow every turn, and
 * every command in a hundred-bug phase recomputes both sides' vision.
 */
const TURN_CAP = 15;

/**
 * How long the whole sweep may take. A sweep nobody will wait for is a
 * sweep nobody runs, so this is a real assertion rather than a comment:
 * if a rules change makes the simulation slower, this fails and says by
 * how much instead of quietly turning `pnpm test:sim` into a coffee
 * break. It sits outside `pnpm test` for exactly this reason.
 *
 * Set well above the 49s an idle machine takes, because the same sweep
 * took 114s on this machine while a build ran alongside it. The budget
 * is here to catch a rules change that makes the simulation
 * fundamentally slower, not to fail whenever CI is busy; a 6x margin
 * still catches that and does not flake under load.
 */
const BUDGET_MS = 300_000;

/**
 * How many of the 60 seeds must reach a win or a loss. 42 do today; the
 * rest stall on #666. Set below the measured figure so ordinary drift in
 * the rules does not flake the sweep, and high enough that a real
 * regression in how often a mission concludes fails it.
 */
const RESOLVED_FLOOR = 35;

/**
 * The highest difficulty every seed currently wins at. Difficulties 1
 * through 4 are walkovers — 24 of 24 — and 5 upwards is a coin flip
 * between a win and a mission that never ends (#666, #497).
 */
const WALKOVER_CEILING = 4;

describe("seeded tactical sweep", () => {
  // Played in `beforeAll`, not in the describe body: work there runs at
  // collection time, so every seed would play even when a single test is
  // filtered, and nothing would be reported until all of them had.
  let runs: SweepRun[] = [];
  let elapsedMs = 0;
  beforeAll(() => {
    const started = performance.now();
    runs = SEEDS.map((entry) => play(entry.seed, entry.difficulty, TURN_CAP));
    elapsedMs = performance.now() - started;
  });

  it("breaks no invariant on any turn of any seed", () => {
    const broken = runs.filter((run) => run.violations.length > 0);
    // The seed and the violation, so a failure is reproducible rather
    // than only alarming.
    expect(
      broken.map((run) => `${run.seed}: ${run.violations.join("; ")}`),
    ).toEqual([]);
  });

  it("drives every seed to the turn cap and no further", () => {
    // The loop terminates on its own rather than being cut off by the
    // suite timeout: every run comes back at or under the cap.
    expect(
      runs
        .filter((run) => run.turns > TURN_CAP)
        .map((run) => `${run.seed} ran ${String(run.turns)} turns`),
    ).toEqual([]);
  });

  it("resolves at least the seeds it resolves today", () => {
    // Not every seed reaches a win or a loss: at difficulty 5 and above
    // the bug population outruns a three-unit force and the rules have
    // no defeat short of a total wipe, so the mission sits unwinnable
    // and unlost forever (#666). Raising the cap to 40 turns converted
    // only 6 of the 19 stalls at three times the runtime, which is what
    // says the stall is structural rather than slow.
    //
    // Rather than fail on a known gap or ignore it, the count is pinned:
    // #666 getting worse turns this red, and fixing it makes the floor
    // easy to raise.
    const resolved = runs.filter((run) => run.outcome !== "unresolved");
    const count = `${String(resolved.length)} of ${String(runs.length)} resolved`;
    expect([count, resolved.length >= RESOLVED_FLOOR]).toEqual([count, true]);
  });

  it("plays every seed inside the sweep's time budget", () => {
    // A sweep nobody will wait for is a sweep nobody runs. Reported in
    // the message so a passing run still says what it cost.
    const generating = runs.reduce((sum, run) => sum + run.startMs, 0);
    const driving = runs.reduce((sum, run) => sum + run.driveMs, 0);
    const turns = runs.reduce((sum, run) => sum + run.turns, 0);
    const cost =
      `${(elapsedMs / 1000).toFixed(1)}s for ${String(runs.length)} seeds ` +
      `(${(generating / 1000).toFixed(1)}s generating maps, ` +
      `${(driving / 1000).toFixed(1)}s driving ${String(turns)} turns)`;
    expect([cost, elapsedMs < BUDGET_MS]).toEqual([cost, true]);
  });

  it("produces a spread of outcomes rather than one every time", () => {
    const tally = new Map<string, number>();
    for (const run of runs) {
      tally.set(run.outcome, (tally.get(run.outcome) ?? 0) + 1);
    }
    const summary = [...tally.entries()]
      .map(([outcome, count]) => `${outcome} ${String(count)}`)
      .join(", ");
    // Reported through the assertion message so a passing run still says
    // what the distribution was.
    expect([summary, runs.length]).toEqual([summary, SEEDS.length]);
    // Not every seed a walkover, not every seed a wipe: a sweep where
    // one outcome takes every seed is telling us the mission is not a
    // game, whichever outcome it is.
    for (const [outcome, count] of tally) {
      expect([outcome, count < runs.length]).toEqual([outcome, true]);
    }
    // Worth stating plainly, because the spread above passes without it:
    // today the tally is `won 42, unresolved 18` and no seed is ever
    // lost. A mission is won or it hangs; there is no losing it. That is
    // the other half of #666 — the defeat condition does not fire
    // rarely, it does not fire at all across 60 seeds and every
    // difficulty. Pinned so that when #666 gives a hopeless mission an
    // ending, this fails and gets tightened rather than staying a
    // comment nobody rereads.
    expect([`lost ${String(tally.get("lost") ?? 0)}`, "see #666"]).toEqual([
      "lost 0",
      "see #666",
    ]);
  });

  it("has no difficulty gradient below 5, which is what #497 has to fix", () => {
    // The aggregate `won 42, unresolved 18` says the curve is broken.
    // Only the breakdown says how, and it is worse than "hard missions
    // stall" — measured on `67f2fcd`:
    //
    //   d1  6/6 won    d6  2/6 won, 4 stalled
    //   d2  6/6 won    d7  3/6 won, 3 stalled
    //   d3  6/6 won    d8  4/6 won, 2 stalled
    //   d4  6/6 won    d9  3/6 won, 3 stalled
    //   d5  3/6 won    d10 3/6 won, 3 stalled
    //
    // Difficulty has **two states, not ten**. Below 5 every seed is a
    // walkover; at 5 and above it is a coin flip between a win and a
    // mission that never ends, and the stall rate does not climb with
    // difficulty — d10 is no harder than d5. Nothing between 1 and 4
    // differs from anything else between 1 and 4.
    //
    // Pinned rather than left in a document nobody rereads: a tuning
    // pass that gives the bottom of the range any teeth turns this red,
    // which is the point at which someone should update it deliberately.
    // See `docs/design/tactical-tuning.md`.
    const table = [...new Set(runs.map((run) => run.difficulty))]
      .sort((a, b) => a - b)
      .map((difficulty) => {
        const at = runs.filter((run) => run.difficulty === difficulty);
        const won = at.filter((run) => run.outcome === "won").length;
        return `d${String(difficulty)} ${String(won)}/${String(at.length)}`;
      })
      .join(", ");
    const easy = runs.filter((run) => run.difficulty <= WALKOVER_CEILING);
    const lostOrStalled = easy.filter((run) => run.outcome !== "won");
    expect([table, lostOrStalled.length]).toEqual([table, 0]);
  });
});
