/// <reference types="node" />
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type * as BugPhaseRunnerModule from "../../bugs/ai/bug-phase-runner";
import { INSTALLATION_SITES } from "../../content/data/installation-sites";
import { mapInfestationLevel } from "../../content/model/map-infestation";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import { manhattanDistance } from "../../core/service/grid-math";
import { MISSION_TUNING } from "../../overworld/data/mission-tuning";
import { advanceDay } from "../../overworld/model/overworld-command";
import type {
  InstallationDefence,
  Mission,
} from "../../overworld/model/mission";
import { mapSizeFor } from "../../overworld/service/missions/mission-offer-builder";
import type { GameState } from "../../save/model/game-state";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { endTurn } from "../../tactical/model/end-turn-command";
import { startMission } from "../../tactical/model/start-mission-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { isDormant } from "../../tactical/model/unit";
import { wakeBrood } from "../../tactical/service/brood-wake-service";
import type { DriverAction } from "../../tactical/service/mission-driver.test-helper";
import { nextActionAgainst } from "../../tactical/service/mission-driver.test-helper";
import type { MoveGraph } from "../../tactical/service/movement-service";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import type { PhaseStep } from "../../tactical/service/turn-service";
import type { GameComposition } from "./game-composition";
import {
  ACT_THREE_REINFORCEMENTS,
  composeGreatHiveGame,
  everyoneOn,
  greatHiveOffers,
  liveMission,
  startAfterUplink,
} from "./great-hive-campaign.test-helper";

// ===========================================
// The bug phase benchmark (#1179)
// ===========================================

/**
 * What the bug phase costs per `EndTurn`, through the shipped
 * composition: the real handlers, the real behaviour registry and
 * `createBugPhaseRunner` itself, on fixed seeds. It reports and never
 * pins a wall-clock time, since hardware varies; `SIM_BENCH_OUT` names
 * a directory the tables are written to, because vitest keeps a sim's
 * console to itself.
 *
 * ```
 *   case            missions                     squad        turns
 *   great-hive      s7-1..3, every brood woken   holds, shoots   4
 *   hive-assault    s7-1..3 as ordinary d8       advances        8
 *   clearance       d5, three map seeds          advances        8
 *   defence         d6, three map seeds          holds, shoots  10
 *
 *   per EndTurn:  store.dispatch(endTurn())
 *                   └── phase steps ──► bug phase (timed here) ──► phase steps
 * ```
 *
 * The runner is timed by wrapping the module's `createBugPhaseRunner`
 * (`vi.mock` below): the composition root builds its bug phase through
 * the wrapper, so what is timed is exactly the shipped phase, and the
 * whole `EndTurn` (steps, vision, log) is timed beside it.
 *
 * Every turn's mission is also hashed (`digest`): the state after the
 * `EndTurn`, log included, so a change meant to make the phase faster
 * can be shown to change nothing else. `bench-digest.tsv` holds only the
 * deterministic columns, for `cmp` against another tree's.
 */

/** Turns each case plays; `SIM_BENCH_TURNS` overrides every case. */
const TURNS_OVERRIDE = process.env.SIM_BENCH_TURNS;

/** Cases to run, comma-separated; unset runs every case. */
const CASE_FILTER = process.env.SIM_BENCH_CASES?.split(",");

/** Where the tables go; unset, nothing is written. */
const OUT = process.env.SIM_BENCH_OUT;

/** The campaign seed whose three Great Hives are the cavern missions. */
const CAMPAIGN_SEED = 7;

/** Tiles within which an awake bug is shot rather than walked past. */
const CLOSE_THREAT = 6;

/** Actions each TDF unit may take per turn. */
const ACTIONS_PER_UNIT = 4;

/** Wall-clock budget of the whole benchmark. */
const BENCH_TIMEOUT_MS = 3_600_000;

// ===========================================
// Timing probe
// ===========================================

/** One bug phase as the wrapped runner saw it. */
interface PhaseSample {
  readonly ms: number;
  readonly acting: number;
  readonly living: number;
}

const probe = vi.hoisted(() => ({ samples: [] as PhaseSample[] }));

vi.mock("../../bugs/ai/bug-phase-runner", async (importOriginal) => {
  const original = await importOriginal<typeof BugPhaseRunnerModule>();
  return {
    ...original,
    createBugPhaseRunner: (
      deps: BugPhaseRunnerModule.BugPhaseDeps,
    ): PhaseStep => {
      const runner = original.createBugPhaseRunner(deps);
      return (mission, ctx) => {
        const acting =
          mission.phase === "bugs" ? original.actingBugIds(mission).length : 0;
        const living = original.livingBugIds(mission).length;
        const started = performance.now();
        const played = runner(mission, ctx);
        probe.samples.push({
          ms: performance.now() - started,
          acting,
          living,
        });
        return played;
      };
    },
  };
});

// ===========================================
// Cases
// ===========================================

/** How the squad plays its turn. */
type Stance = "hold" | "advance";

/** One mission of a case, ready to launch from `before`. */
interface Launch {
  readonly label: string;
  readonly game: GameComposition;
  readonly before: GameState;
  readonly offer: Mission;
}

/** One benchmark case. */
interface BenchCase {
  readonly name: string;
  readonly turns: number;
  readonly stance: Stance;
  /** Builds the case's missions; lazily, so a filtered case costs nothing. */
  readonly launches: () => readonly Launch[];
  /** What the mission looks like before the first turn is played. */
  readonly prepare: (mission: TacticalState) => TacticalState;
}

/** The three Great Hive offers seed `CAMPAIGN_SEED` pins, as pinned or as ordinary assaults. */
function greatHiveLaunches(ordinary: boolean): readonly Launch[] {
  const game = composeGreatHiveGame(CAMPAIGN_SEED);
  startAfterUplink(game, CAMPAIGN_SEED, [], ACT_THREE_REINFORCEMENTS);
  if (!game.session.store?.dispatch(advanceDay()).ok) {
    throw new Error("the day did not advance");
  }
  const before = game.session.state;
  if (before === undefined) {
    throw new Error("no campaign");
  }
  const offers = greatHiveOffers(game).map((offer) =>
    ordinary ? asOrdinary(offer) : offer,
  );
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
    label: `s${String(CAMPAIGN_SEED)}-${String(n + 1)}`,
    game,
    before: tested,
    offer,
  }));
}

/** A Great Hive offer with its `great` marker dropped: the ordinary cavern and setup. */
function asOrdinary(offer: Mission): Mission {
  if (offer.hive === undefined) {
    return offer;
  }
  const { great: _great, ...hive } = offer.hive;
  return { ...offer, hive };
}

/**
 * Three offers of `typeId` at `difficulty` on a fresh `CAMPAIGN_SEED`
 * campaign, at its most infested city, one per map seed, sized the way
 * the offer builder sizes them.
 */
function craftedLaunches(
  typeId: MissionTypeId,
  difficulty: number,
  defence?: InstallationDefence,
): readonly Launch[] {
  const game = composeGreatHiveGame(CAMPAIGN_SEED);
  const fresh = game.createCampaign({
    seed: CAMPAIGN_SEED,
    createdAt: "2026-09-26T00:00:00.000Z",
  });
  const city = [...fresh.overworld.map.cities].sort(
    (a, b) => b.infestation - a.infestation,
  )[0];
  const region = fresh.overworld.map.regions.find(
    (r) => r.id === city?.regionId,
  );
  if (city === undefined || region === undefined) {
    throw new Error("the campaign needs a city and a region");
  }
  const day = fresh.overworld.day;
  return [1, 2, 3].map((n) => {
    const offer: Mission = {
      id: `bench-${typeId}-${String(n)}`,
      typeId,
      cityId: city.id,
      difficulty,
      mapParams: {
        infestation: mapInfestationLevel(city.infestation),
        biome: city.biome ?? region.biome,
        settlement: city.scale,
        size: mapSizeFor(difficulty, MISSION_TUNING.difficulty[typeId]),
        seed: `bench-${String(n)}`,
      },
      rewards: { credits: 300, techPoints: 0 },
      createdDay: day,
      expiresDay: day + 5,
      ignorePenalty: 10,
      ...(defence === undefined ? {} : { defence }),
    };
    const before: GameState = {
      ...fresh,
      overworld: { ...fresh.overworld, missions: [offer] },
    };
    game.session.start(before);
    return { label: `${typeId}-${String(n)}`, game, before, offer };
  });
}

/** Every brood of `mission` woken, as a squad's noise would. */
function wakeAll(mission: TacticalState): TacticalState {
  return (mission.broods ?? []).reduce(
    (state, brood) => wakeBrood(state, brood.id, "noise").state,
    mission,
  );
}

/** The benchmark's cases, in report order. */
const CASES: readonly BenchCase[] = [
  {
    name: "great-hive",
    turns: 4,
    stance: "hold",
    launches: () => greatHiveLaunches(false),
    prepare: wakeAll,
  },
  {
    name: "hive-assault",
    turns: 8,
    stance: "advance",
    launches: () => greatHiveLaunches(true),
    prepare: (mission) => mission,
  },
  {
    name: "clearance",
    turns: 8,
    stance: "advance",
    launches: () => craftedLaunches("infestation-clearance", 5),
    prepare: (mission) => mission,
  },
  {
    name: "defence",
    turns: 10,
    stance: "hold",
    launches: () =>
      craftedLaunches("defend-installation", 6, {
        installation: "sensor-array",
        generators: INSTALLATION_SITES["sensor-array"].generators,
        waves: 4,
      }),
    prepare: (mission) => mission,
  },
];

// ===========================================
// Driver
// ===========================================

/** The nearest awake bug `unitId` can shoot without moving, if any. */
function closeShot(
  mission: TacticalState,
  unitId: string,
  graph: MoveGraph,
): DriverAction | undefined {
  const unit = mission.units.find((u) => u.id === unitId);
  if (unit === undefined || unit.hp <= 0) {
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

/** What the squad goes for when it advances: the hive core, else the first standing spawner. */
function advanceTarget(mission: TacticalState): string | undefined {
  const standing = mission.spawners.filter((s) => !s.destroyed);
  return (standing.find((s) => s.variant === "hive-core") ?? standing[0])?.id;
}

/** The squad's next action for `unitId` under `stance`. */
function nextAction(
  mission: TacticalState,
  unitId: string,
  stance: Stance,
  graph: MoveGraph,
): DriverAction | undefined {
  const shot = closeShot(mission, unitId, graph);
  if (shot !== undefined || stance === "hold") {
    return shot;
  }
  const target = advanceTarget(mission);
  return target === undefined
    ? undefined
    : nextActionAgainst(mission, unitId, target, OBJECTIVE_TUNING, graph);
}

/** Plays every TDF unit's turn through the store. */
function playSquad(launch: Launch, stance: Stance, graph: MoveGraph): void {
  const store = launch.game.session.store;
  const ids = liveMission(launch.game)
    .units.filter((u) => u.team === "tdf")
    .map((u) => u.id);
  for (const unitId of ids) {
    for (let step = 0; step < ACTIONS_PER_UNIT; step += 1) {
      const mission = liveMission(launch.game);
      if (mission.outcome !== undefined) return;
      const next = nextAction(mission, unitId, stance, graph);
      if (next === undefined || next.kind === "blocked") break;
      if (!store?.dispatch(next.command).ok) break;
    }
  }
}

// ===========================================
// Measuring
// ===========================================

/** One timed `EndTurn`. */
interface TurnRow {
  readonly caseName: string;
  readonly mission: string;
  readonly turn: number;
  readonly living: number;
  readonly acting: number;
  readonly phaseMs: number;
  readonly endTurnMs: number;
  readonly digest: string;
  readonly load: string;
}

/** Content hashes of maps already hashed, by reference. */
const mapHashes = new WeakMap<object, string>();

/** A short content hash of `text`. */
function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/**
 * The mission's content hash: its map hashed on its own (and only once
 * per map object, since it rarely changes), everything else as JSON.
 */
function digestOf(mission: TacticalState): string {
  let mapHash = mapHashes.get(mission.map);
  if (mapHash === undefined) {
    mapHash = sha1(JSON.stringify(mission.map));
    mapHashes.set(mission.map, mapHash);
  }
  return sha1(JSON.stringify({ ...mission, map: mapHash })).slice(0, 16);
}

/** The one-minute load average, to one decimal. */
function load(): string {
  return (loadavg()[0] ?? 0).toFixed(1);
}

/** Starts `launch` with everyone, from its pre-launch state, and prepares it. */
function start(launch: Launch, bench: BenchCase): void {
  launch.game.session.replace(launch.before);
  const started = launch.game.session.store?.dispatch(
    startMission(launch.offer.id, everyoneOn(launch.game, launch.offer.id)),
  );
  if (!started?.ok) {
    throw new Error(`${launch.label}: the mission did not start`);
  }
  const state = launch.game.session.state;
  if (state === undefined) {
    throw new Error("no campaign");
  }
  launch.game.session.replace({
    ...state,
    activeMission: bench.prepare(liveMission(launch.game)),
  });
}

/** Plays `bench`'s turns on `launch`, timing each `EndTurn` and its bug phase. */
function playLaunch(launch: Launch, bench: BenchCase): TurnRow[] {
  start(launch, bench);
  const turns = Number(TURNS_OVERRIDE ?? bench.turns);
  const graph = buildMoveGraph(liveMission(launch.game).map);
  const rows: TurnRow[] = [];
  for (let turn = 1; turn <= turns; turn += 1) {
    if (liveMission(launch.game).outcome !== undefined) break;
    playSquad(launch, bench.stance, graph);
    if (liveMission(launch.game).outcome !== undefined) break;
    probe.samples.length = 0;
    const started = performance.now();
    const ended = launch.game.session.store?.dispatch(endTurn());
    const endTurnMs = performance.now() - started;
    if (!ended?.ok) {
      throw new Error(
        `${launch.label}: EndTurn refused on turn ${String(turn)}`,
      );
    }
    const phase = probe.samples[0];
    rows.push({
      caseName: bench.name,
      mission: launch.label,
      turn,
      living: phase?.living ?? 0,
      acting: phase?.acting ?? 0,
      phaseMs: phase?.ms ?? 0,
      endTurnMs,
      digest: digestOf(liveMission(launch.game)),
      load: load(),
    });
  }
  return rows;
}

/** The value at `fraction` of the sorted `values` (nearest rank). */
function quantile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[rank - 1] ?? 0;
}

/** One case's summary line. */
function summarise(name: string, rows: readonly TurnRow[]): string {
  const phase = rows.map((r) => r.phaseMs);
  const acting = rows.map((r) => r.acting);
  return [
    name,
    rows.length,
    quantile(acting, 0.5),
    Math.max(0, ...acting),
    quantile(phase, 0.5).toFixed(0),
    quantile(phase, 0.9).toFixed(0),
    Math.max(0, ...phase).toFixed(0),
    quantile(
      rows.map((r) => r.endTurnMs),
      0.5,
    ).toFixed(0),
  ].join("\t");
}

/** Writes `rows` under `header` to `OUT/name` when `OUT` is set. */
function report(name: string, header: string, rows: readonly string[]): void {
  if (OUT === undefined) {
    return;
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), [header, ...rows].join("\n") + "\n");
}

// ===========================================
// Benchmark
// ===========================================

describe("the bug phase per EndTurn (#1179)", () => {
  it(
    "times every case's bug phase and hashes every turn",
    () => {
      const selected = CASES.filter(
        (c) => CASE_FILTER === undefined || CASE_FILTER.includes(c.name),
      );
      const byCase = new Map<string, TurnRow[]>();
      for (const bench of selected) {
        const rows = bench.launches().flatMap((l) => playLaunch(l, bench));
        byCase.set(bench.name, rows);
        const all = [...byCase.values()].flat();
        report(
          "bench-turns.tsv",
          "case\tmission\tturn\tliving\tacting\tphase_ms\tend_turn_ms\tdigest\tload1",
          all.map((r) =>
            [
              r.caseName,
              r.mission,
              r.turn,
              r.living,
              r.acting,
              r.phaseMs.toFixed(1),
              r.endTurnMs.toFixed(1),
              r.digest,
              r.load,
            ].join("\t"),
          ),
        );
        report(
          "bench-digest.tsv",
          "case\tmission\tturn\tliving\tacting\tdigest",
          all.map((r) =>
            [r.caseName, r.mission, r.turn, r.living, r.acting, r.digest].join(
              "\t",
            ),
          ),
        );
        report(
          "bench-summary.tsv",
          "case\tturns\tacting_median\tacting_max\tmedian_ms\tp90_ms\tmax_ms\tend_turn_median_ms",
          [...byCase.entries()].map(([name, caseRows]) =>
            summarise(name, caseRows),
          ),
        );
      }

      for (const [name, rows] of byCase) {
        expect(rows.length, name).toBeGreaterThan(0);
        expect(Math.max(...rows.map((r) => r.acting)), name).toBeGreaterThan(0);
      }
      // Every brood woken: on the first turn every living bug acts.
      for (const row of byCase.get("great-hive") ?? []) {
        if (row.turn === 1) {
          expect(row.acting, row.mission).toBe(row.living);
        }
      }
    },
    BENCH_TIMEOUT_MS,
  );
});
