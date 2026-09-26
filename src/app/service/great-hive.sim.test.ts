/// <reference types="node" />
import { writeFileSync } from "node:fs";
import { loadavg } from "node:os";

import { describe, expect, it } from "vitest";

import { actingBugIds } from "../../bugs/ai/bug-phase-runner";
import { manhattanDistance } from "../../core/service/grid-math";
import type { Mission } from "../../overworld/model/mission";
import { advanceDay } from "../../overworld/model/overworld-command";
import type { GameState } from "../../save/model/game-state";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { endTurn } from "../../tactical/model/end-turn-command";
import { startMission } from "../../tactical/model/start-mission-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { isDormant } from "../../tactical/model/unit";
import { wakeBrood } from "../../tactical/service/brood-wake-service";
import type { DriverAction } from "../../tactical/service/mission-driver.test-helper";
import { spawnerAttackTarget } from "../../tactical/service/attack-target-service";
import {
  homewardAction,
  nextActionAgainst,
  positionsWithin,
} from "../../tactical/service/mission-driver.test-helper";
import type { MoveGraph } from "../../tactical/service/movement-service";
import {
  buildMoveGraph,
  occupiedKeys,
} from "../../tactical/service/movement-service";
import type { GameComposition } from "./game-composition";
import {
  ACT_THREE_REINFORCEMENTS,
  composeGreatHiveGame,
  everyoneOn,
  greatHiveOffers,
  hiveCoreOf,
  liveMission,
  startAfterUplink,
} from "./great-hive-campaign.test-helper";

// ===========================================
// The Great Hive sim (#1179, campaign arc §6.9)
// ===========================================

/**
 * What a Great Hive costs and how often a basic Act III force takes it,
 * through the shipped composition: a campaign just past Uplink, the
 * next day's reveal, and the Great Hive assaults it pins, launched with
 * every squad and mech of a basic Act III force: a full deployment of
 * eight on the starting gear, no research (`ACT_THREE_REINFORCEMENTS`
 * on top of the starting roster). `SIM_GREAT_HIVE_FORCE=starter` sends
 * the starting roster alone (four squads, one Vanguard).
 *
 * ```
 *   phase    3 missions   one EndTurn from the opening (guards awake,
 *                          broods asleep) and one after every brood is
 *                          woken: the store's whole turn cycle, timed,
 *                          with the one-minute load average beside it
 *   win      12 missions  the driver below, played to an outcome or
 *                          the turn cap
 * ```
 *
 * The driver is a basic player: while the core stands each unit shoots
 * the nearest awake bug it can hit without moving when one is within
 * `CLOSE_THREAT` tiles, and otherwise closes on the core (mechs fire,
 * infantry plants charges); once the core falls, home to the drop ship,
 * shooting its way out when boxed in. It neither kites nor regroups.
 *
 * Pins are on outcomes being reached and on dormancy, never on
 * milliseconds or the win rate: wall time and balance are reported
 * (`SIM_GREAT_HIVE_OUT`, a directory), since vitest keeps a sim's
 * console to itself.
 */

/** Campaign seeds; each reveals three Great Hives, so 4 seeds are 12 missions. */
const CAMPAIGN_SEEDS = (process.env.SIM_GREAT_HIVE_SEEDS ?? "7,8,9,10")
  .split(",")
  .map(Number);

/** Missions timed for the bug phase. */
const PHASE_MISSIONS = 3;

/** Timed EndTurns per case; the median is reported. */
const REPEATS = Number(process.env.SIM_GREAT_HIVE_REPEATS ?? "3");

/** Turns a mission gets before it counts as unresolved. */
const TURN_CAP = Number(process.env.SIM_GREAT_HIVE_CAP ?? "60");

/** Tiles within which an awake bug is shot before the march goes on. */
const CLOSE_THREAT = Number(process.env.SIM_GREAT_HIVE_THREAT ?? "6");

/** Where the TSVs go; unset, nothing is written. */
const OUT = process.env.SIM_GREAT_HIVE_OUT;

/** The force sent: `act3` (the default, a full basic deployment) or `starter`. */
const FORCE = process.env.SIM_GREAT_HIVE_FORCE ?? "act3";

/**
 * Calibration: `1` plays the same offers as ordinary Hive Assaults (the
 * `great` marker dropped, so the ordinary cavern and setup), to read the
 * Great Hive's win rate against its base type's under the same driver.
 */
const CONTROL = process.env.SIM_GREAT_HIVE_CONTROL === "1";

/**
 * Where the force starts: `ramp` (the default, the drop ship) or `core`,
 * every unit on a free tile within three of the core with a sight line
 * to it, to time the fight at the core without the march.
 */
const START = process.env.SIM_GREAT_HIVE_START ?? "ramp";

/** Wall-clock budget of the win test: twelve assaults of up to `TURN_CAP` turns. */
const WIN_TIMEOUT_MS = 3_600_000;

// ===========================================
// Fixtures
// ===========================================

/** One Great Hive assault, ready to launch from `before`. */
interface Launch {
  readonly label: string;
  readonly game: GameComposition;
  readonly before: GameState;
  readonly offer: Mission;
}

/** The three Great Hive assaults `seed` pins on the day after Uplink. */
function launchesFor(seed: number): Launch[] {
  const game = composeGreatHiveGame(seed);
  startAfterUplink(
    game,
    seed,
    [],
    FORCE === "starter" ? undefined : ACT_THREE_REINFORCEMENTS,
  );
  if (!game.session.store?.dispatch(advanceDay()).ok) {
    throw new Error(`seed ${String(seed)}: the day did not advance`);
  }
  const before = game.session.state;
  if (before === undefined) {
    throw new Error("no campaign");
  }
  const offers = greatHiveOffers(game).map(asTested);
  const tested: GameState = {
    ...before,
    overworld: {
      ...before.overworld,
      missions: before.overworld.missions.map(
        (m) => offers.find((o) => o.id === m.id) ?? m,
      ),
    },
  };
  return offers.map((offer, n) => ({
    label: `s${String(seed)}-${String(n + 1)}`,
    game,
    before: tested,
    offer,
  }));
}

/** `offer` as the run plays it: as pinned, or as an ordinary assault under `CONTROL`. */
function asTested(offer: Mission): Mission {
  if (!CONTROL || offer.hive === undefined) {
    return offer;
  }
  const { great: _great, ...ordinary } = offer.hive;
  return { ...offer, hive: ordinary };
}

/** Starts `launch` with everyone, from its pre-launch state. */
function start(launch: Launch): TacticalState {
  launch.game.session.replace(launch.before);
  const started = launch.game.session.store?.dispatch(
    startMission(launch.offer.id, everyoneOn(launch.game, launch.offer.id)),
  );
  if (!started?.ok) {
    throw new Error(`${launch.label}: the mission did not start`);
  }
  return liveMission(launch.game);
}

/** Replaces the live mission of `game` with `mission`. */
function stage(game: GameComposition, mission: TacticalState): void {
  const state = game.session.state;
  if (state === undefined) {
    throw new Error("no campaign");
  }
  game.session.replace({ ...state, activeMission: mission });
}

/** Living bugs of `mission`. */
function livingBugs(mission: TacticalState): number {
  return mission.units.filter((u) => u.team === "bugs" && u.hp > 0).length;
}

/** The one-minute load average, to one decimal. */
function load(): string {
  return (loadavg()[0] ?? 0).toFixed(1);
}

/** Writes `rows` under `header` to `OUT/name` when `OUT` is set. */
function report(name: string, header: string, rows: readonly string[]): void {
  if (OUT !== undefined) {
    writeFileSync(`${OUT}/${name}`, [header, ...rows].join("\n") + "\n");
  }
}

// ===========================================
// Bug phase
// ===========================================

/** One timed EndTurn case. */
interface PhaseRow {
  readonly label: string;
  readonly scenario: string;
  readonly living: number;
  readonly acting: number;
  readonly medianMs: number;
  readonly load: string;
}

/** Times the store's EndTurn from `mission`, `REPEATS` times, median reported. */
function timeEndTurn(
  launch: Launch,
  scenario: string,
  mission: TacticalState,
): PhaseRow {
  const times: number[] = [];
  for (let run = 0; run < REPEATS; run += 1) {
    stage(launch.game, mission);
    const started = performance.now();
    const ended = launch.game.session.store?.dispatch(endTurn());
    times.push(performance.now() - started);
    if (!ended?.ok) {
      throw new Error(`${launch.label}: EndTurn refused`);
    }
  }
  times.sort((a, b) => a - b);
  return {
    label: launch.label,
    scenario,
    living: livingBugs(mission),
    acting: actingBugIds({ ...mission, phase: "bugs" }).length,
    medianMs: times[Math.floor(times.length / 2)] ?? 0,
    load: load(),
  };
}

/** Every brood of `mission` woken, as a squad's noise would. */
function wakeAll(mission: TacticalState): TacticalState {
  return (mission.broods ?? []).reduce(
    (state, brood) => wakeBrood(state, brood.id, "noise").state,
    mission,
  );
}

// ===========================================
// Driver
// ===========================================

/** The nearest awake bug `unitId` can shoot this action without moving, if any. */
function closeShot(
  mission: TacticalState,
  unitId: string,
  graph: MoveGraph,
): DriverAction | undefined {
  const unit = mission.units.find((u) => u.id === unitId);
  if (unit === undefined) {
    return undefined;
  }
  const near = mission.units
    .filter(
      (u) =>
        u.team === "bugs" &&
        u.hp > 0 &&
        !isDormant(u) &&
        manhattanDistance(u.pos, unit.pos) <= CLOSE_THREAT,
    )
    .sort(
      (a, b) =>
        manhattanDistance(a.pos, unit.pos) - manhattanDistance(b.pos, unit.pos),
    );
  for (const bug of near.slice(0, 3)) {
    const shot = nextActionAgainst(
      mission,
      unitId,
      bug.id,
      OBJECTIVE_TUNING,
      graph,
      "fire",
    );
    if (shot.kind === "attack") {
      return shot;
    }
  }
  return undefined;
}

/** Home, or a shot at the nearest bug when there is no route home. */
function homewardOrFight(
  mission: TacticalState,
  unitId: string,
  graph: MoveGraph,
): DriverAction {
  const home = homewardAction(mission, unitId, graph);
  if (home.kind !== "blocked" || home.reason !== "no-route") {
    return home;
  }
  return closeShot(mission, unitId, graph) ?? home;
}

/** The driver's next action for `unitId`. */
function nextAction(
  mission: TacticalState,
  unitId: string,
  graph: MoveGraph,
): DriverAction {
  const core = hiveCoreOf(mission);
  if (core.destroyed) {
    return homewardOrFight(mission, unitId, graph);
  }
  return (
    closeShot(mission, unitId, graph) ??
    nextActionAgainst(mission, unitId, core.id, OBJECTIVE_TUNING, graph)
  );
}

/**
 * `mission` with every TDF unit moved to its own free tile within three
 * of the core, in sight of it, nearest first.
 */
function besideTheCore(
  mission: TacticalState,
  graph: MoveGraph,
): TacticalState {
  const core = spawnerAttackTarget(hiveCoreOf(mission));
  const taken = new Set(occupiedKeys(mission, graph.index));
  const units = mission.units.map((unit) => {
    if (unit.team !== "tdf") return unit;
    const spot = positionsWithin(mission, unit, core, 3, true, graph)
      .filter((p) => !taken.has(graph.index.keyOf(p.tile)))
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          a.tile.z - b.tile.z ||
          a.tile.x - b.tile.x ||
          a.tile.y - b.tile.y,
      )[0];
    if (spot === undefined) return unit;
    taken.add(graph.index.keyOf(spot.tile));
    return { ...unit, pos: spot.tile };
  });
  return { ...mission, units };
}

/** What one Great Hive assault came to. */
interface WinRow {
  readonly label: string;
  readonly outcome: string;
  readonly coreTurn: number | undefined;
  readonly turns: number;
  readonly tdfAlive: number;
  readonly bugsAlive: number;
  readonly awake: number;
  readonly startBugs: number;
  /** The core's hit points at the end. */
  readonly coreHp: number;
  /** The nearest any TDF unit came to the core, in tiles. */
  readonly closest: number;
  readonly deployed: number;
  readonly driveS: number;
  readonly load: string;
}

/** The nearest living TDF unit's distance to the core of `mission`. */
function nearestToCore(mission: TacticalState): number {
  const core = hiveCoreOf(mission).pos;
  return Math.min(
    ...mission.units
      .filter((u) => u.team === "tdf" && u.hp > 0)
      .map((u) => manhattanDistance(u.pos, core)),
    Number.POSITIVE_INFINITY,
  );
}

/** Plays `launch` with the driver to an outcome or `TURN_CAP`. */
function play(launch: Launch): WinRow {
  const launched = start(launch);
  const graph = buildMoveGraph(launched.map);
  const opening = START === "core" ? besideTheCore(launched, graph) : launched;
  stage(launch.game, opening);
  const store = launch.game.session.store;
  const began = performance.now();
  let turns = 0;
  let coreTurn: number | undefined;
  let closest = nearestToCore(opening);
  while (turns < TURN_CAP && liveMission(launch.game).outcome === undefined) {
    const ids = liveMission(launch.game)
      .units.filter((u) => u.team === "tdf")
      .map((u) => u.id);
    for (const unitId of ids) {
      for (let step = 0; step < 6; step += 1) {
        const mission = liveMission(launch.game);
        if (mission.outcome !== undefined) break;
        const next = nextAction(mission, unitId, graph);
        if (next.kind === "blocked") break;
        if (!store?.dispatch(next.command).ok) break;
      }
    }
    closest = Math.min(closest, nearestToCore(liveMission(launch.game)));
    if (liveMission(launch.game).outcome !== undefined) break;
    if (!store?.dispatch(endTurn()).ok) break;
    turns += 1;
    if (
      coreTurn === undefined &&
      hiveCoreOf(liveMission(launch.game)).destroyed
    ) {
      coreTurn = turns;
    }
  }
  const end = liveMission(launch.game);
  if (coreTurn === undefined && hiveCoreOf(end).destroyed) {
    coreTurn = turns + 1;
  }
  return {
    label: launch.label,
    outcome: end.outcome ?? "unresolved",
    coreTurn,
    turns,
    tdfAlive: end.units.filter((u) => u.team === "tdf" && u.hp > 0).length,
    bugsAlive: livingBugs(end),
    awake: end.units.filter(
      (u) => u.team === "bugs" && u.hp > 0 && !isDormant(u),
    ).length,
    startBugs: livingBugs(opening),
    coreHp: hiveCoreOf(end).hp,
    closest,
    deployed: opening.units.filter((u) => u.team === "tdf").length,
    driveS: (performance.now() - began) / 1000,
    load: load(),
  };
}

// ===========================================
// Sweep
// ===========================================

describe("Great Hives through the shipped composition (#1179)", () => {
  const launches = CAMPAIGN_SEEDS.flatMap(launchesFor);

  it("times the turn cycle at the opening and after a mass wake", () => {
    const rows: PhaseRow[] = [];
    for (const launch of launches.slice(0, PHASE_MISSIONS)) {
      const opening = start(launch);
      rows.push(timeEndTurn(launch, "opening", opening));
      rows.push(timeEndTurn(launch, "all woken", wakeAll(opening)));
    }
    report(
      "phase.tsv",
      "mission\tscenario\tliving\tacting\tmedian_ms\tload1",
      rows.map((r) =>
        [
          r.label,
          r.scenario,
          r.living,
          r.acting,
          r.medianMs.toFixed(0),
          r.load,
        ].join("\t"),
      ),
    );
    for (const row of rows) {
      if (row.scenario === "all woken") {
        expect(row.acting, row.label).toBe(row.living);
      } else {
        expect(row.acting, row.label).toBeLessThan(row.living);
      }
    }
  });

  it(
    "plays every Great Hive assault to an outcome or the cap",
    () => {
      const rows: WinRow[] = [];
      for (const launch of launches) {
        rows.push(play(launch));
        report(
          "win.tsv",
          "mission\tforce\tdeployed\toutcome\tcore_turn\tturns\ttdf_alive\tbugs_alive\tawake\tstart_bugs\tcore_hp\tclosest\tdrive_s\tload1",
          rows.map((r) =>
            [
              r.label,
              `${FORCE}${CONTROL ? "/ordinary" : ""}@${START}`,
              r.deployed,
              r.outcome,
              r.coreTurn ?? "",
              r.turns,
              r.tdfAlive,
              r.bugsAlive,
              r.awake,
              r.startBugs,
              r.coreHp,
              r.closest,
              r.driveS.toFixed(1),
              r.load,
            ].join("\t"),
          ),
        );
      }
      expect(rows).toHaveLength(launches.length);
      for (const row of rows) {
        expect(row.startBugs, row.label).toBeGreaterThan(0);
      }
    },
    WIN_TIMEOUT_MS,
  );
});
