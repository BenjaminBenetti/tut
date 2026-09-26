/// <reference types="node" />
import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isSovereign } from "../../bugs/service/sovereign-service";
import { manhattanDistance } from "../../core/service/grid-math";
import { advanceDay } from "../../overworld/model/advance-day-command";
import { MECH_BLUEPRINTS } from "../../roster/data/mech-blueprints";
import type { Mech } from "../../roster/model/mech";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import { loadoutPartIds } from "../../roster/model/mech-loadout";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { advanceStage } from "../../tactical/model/advance-stage-command";
import { endTurn } from "../../tactical/model/end-turn-command";
import { GUARDS_SUMMONED } from "../../tactical/model/guards-summoned-event";
import { SOVEREIGN_RETREATING } from "../../tactical/model/sovereign-retreating-event";
import { startMission } from "../../tactical/model/start-mission-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { DriverAction } from "../../tactical/service/mission-driver.test-helper";
import {
  homewardAction,
  nextActionAgainst,
} from "../../tactical/service/mission-driver.test-helper";
import type { MoveGraph } from "../../tactical/service/movement-service";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

// ===========================================
// The Spore Platform with a finale force (#1179, campaign arc §6.9, D5)
// ===========================================

/**
 * Plays the finale over 12 campaign seeds with a basic finale force and
 * reports what calibration needs: each stage's win rate and turns, what
 * the force carries from the hull into the core, whether the Sovereign
 * retreats, and what one EndTurn costs on the core.
 *
 * ```
 *   finale campaign, 4 × Finale Line ──► AdvanceDay: the platform pinned
 *   StartMission ──► hull: fight to the hatch, extract ──► won?
 *        └─► AdvanceStage ──► core: shoot the core, fight what closes ──► won?
 * ```
 *
 * The force is four of one mech, so every seed tests the same thing:
 * the Siege Battery blueprint (the heaviest shipped frame: Atlas chassis,
 * ablative armour, a heavy autocannon whose armour-pen 3 beats the
 * core's armour 2 and the Hive Guard's plate) with every part at
 * upgrade level 2 of 3, what a campaign that reached the finale can
 * plausibly have bought. The driver fires only the arm weapon, so the
 * howitzer (brace, minimum range 6) is dead weight here: the numbers
 * are a floor on this force, not its ceiling.
 *
 * The core stage stands the Sovereign on her dais (`PLATFORM_CORE_BOSS`),
 * playing her deterministic fallback (no Jev relay in a sim): her aura,
 * her guard summons every third turn and her retreat to the core at 40 %
 * are END_TURN steps, so each EndTurn's time includes them. The report
 * says whether she turned back and on which turn, whether she lived,
 * and how many guards she summoned.
 *
 * The driver is the mission sweep's (`mission-driver.test-helper`):
 * on the hull every mech walks for the hatch and boards, on the core it
 * walks to a firing position on the core and shoots it, and on either it
 * shoots the nearest bug only when it is boxed in. A first version that
 * shot every bug within four tiles before moving stood its mechs still
 * to the cap on 10 of 12 hulls, with 46 to 82 bugs alive: on this map
 * a force that stops to fight never stops fighting.
 *
 * Opt-in: it runs only with `SIM_PLATFORM_OUT` naming the TSV it
 * writes (vitest keeps a sim's console to itself), so it adds nothing
 * to `pnpm test:sim`'s wall clock. The numbers are placeholders for
 * calibration, not pins.
 */

/**
 * Campaign seeds; each draws its own platform maps. `SIM_PLATFORM_SEEDS`
 * (comma-separated) plays a subset, for a quick look at one seed.
 */
const SEEDS: readonly number[] = process.env.SIM_PLATFORM_SEEDS?.split(",").map(
  Number,
) ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** A stage still open after this many turns is reported unresolved. */
const TURN_CAP = 40;

/** How many of the nearest bugs a boxed-in unit tries to shoot. */
const NEAREST_BUGS = 4;

/** Upgrade level on every fitted part. */
const UPGRADE_LEVEL = 2;

const NOW = "2026-09-26T00:00:00.000Z";

/** The finale force's one loadout: see the header. */
function finaleLoadout(): MechLoadout {
  const blueprint = MECH_BLUEPRINTS.find(
    (loadout) => loadout.name === "Siege Battery",
  );
  if (blueprint === undefined) throw new Error("no Siege Battery blueprint");
  return {
    ...blueprint,
    name: "Finale Line",
    upgrades: Object.fromEntries(
      loadoutPartIds(blueprint).map((id) => [id, UPGRADE_LEVEL]),
    ),
  };
}

// ===========================================
// Report rows
// ===========================================

/** One stage of one seed. */
interface StageRun {
  readonly outcome: "won" | "lost" | "unresolved";
  readonly turns: number;
  /** Milliseconds per EndTurn, in order. */
  readonly endTurnMs: readonly number[];
  /** Most bugs alive at the start of any bug phase. */
  readonly peakBugs: number;
  /** Our units still standing on the map when the stage stopped. */
  readonly standing: number;
  /** Our units dead on the map when the stage stopped. */
  readonly lost: number;
  /** Hit points our standing units had left when the stage stopped. */
  readonly endHp: number;
  /** Guards the Sovereign summoned during the stage (`GuardsSummoned`). */
  readonly summoned: number;
  /** The turn the Sovereign turned back for the core (`SovereignRetreating`), if she did. */
  readonly retreatTurn: number | undefined;
}

/** One seed, both stages. */
interface PlatformRun {
  readonly seed: number;
  readonly hull: StageRun;
  readonly core: StageRun | undefined;
  /** Mechs that boarded the core, and their HP against their whole. */
  readonly carried: {
    readonly mechs: number;
    readonly hp: number;
    readonly maxHp: number;
    /** Shots left in every pooled weapon, and the pools' whole. */
    readonly charges: number;
    readonly maxCharges: number;
  };
  /** Heat carried into the core, summed over the mechs. */
  readonly carriedHeat: number;
  /** What became of the Sovereign on the core. */
  readonly sovereign: SovereignFate;
}

/** The Sovereign at the end of the core stage. */
interface SovereignFate {
  /** absent: never placed; alive or killed when the stage stopped. */
  readonly end: "absent" | "alive" | "killed";
  readonly hp: number;
  readonly maxHp: number;
}

// ===========================================
// Driving
// ===========================================

/** The campaign's live mission; throws when there is none. */
function active(game: GameComposition): TacticalState {
  const mission = game.session.state?.activeMission;
  if (mission === undefined) throw new Error("no active mission");
  return mission;
}

/**
 * The next action for `unitId`: `onward` (the hatch on the hull, the
 * core on the core stage), or a shot at the nearest bug it can reach
 * when `onward` has no way through.
 */
function nextAction(
  mission: TacticalState,
  unitId: string,
  graph: MoveGraph,
  onward: DriverAction,
): DriverAction {
  if (onward.kind !== "blocked" || onward.reason === "unit-unavailable") {
    return onward;
  }
  const unit = mission.units.find((u) => u.id === unitId);
  if (unit === undefined) return onward;
  const nearest = mission.units
    .filter((u) => u.team === "bugs" && u.hp > 0)
    .sort(
      (a, b) =>
        manhattanDistance(unit.pos, a.pos) - manhattanDistance(unit.pos, b.pos),
    )
    .slice(0, NEAREST_BUGS);
  for (const bug of nearest) {
    const shot = nextActionAgainst(
      mission,
      unitId,
      bug.id,
      OBJECTIVE_TUNING,
      graph,
      "fire",
    );
    if (shot.kind !== "blocked") return shot;
  }
  return onward;
}

/** Plays the stage on the board to an outcome or the cap. */
function playStage(game: GameComposition, stage: "hull" | "core"): StageRun {
  const store = game.session.store;
  if (store === undefined) throw new Error("no store");
  const graph = buildMoveGraph(active(game).map);
  const endTurnMs: number[] = [];
  let peakBugs = 0;
  let turns = 0;
  let summoned = 0;
  let retreatTurn: number | undefined;
  while (turns < TURN_CAP && active(game).outcome === undefined) {
    const force = active(game).units.filter(
      (u) => u.team === "tdf" && u.hp > 0,
    );
    for (const unit of force) {
      for (let step = 0; step < 6; step++) {
        const mission = active(game);
        if (mission.outcome !== undefined) break;
        const live = mission.units.find((u) => u.id === unit.id);
        if (live === undefined || live.hp <= 0) break;
        const core = mission.spawners.find(
          (s) => s.variant === "platform-core" && !s.destroyed,
        );
        const next = nextAction(
          mission,
          unit.id,
          graph,
          stage === "hull" || core === undefined
            ? homewardAction(mission, unit.id, graph)
            : nextActionAgainst(
                mission,
                unit.id,
                core.id,
                OBJECTIVE_TUNING,
                graph,
                "fire",
              ),
        );
        if (next.kind === "blocked") break;
        if (!store.dispatch(next.command).ok) break;
      }
      if (active(game).outcome !== undefined) break;
    }
    if (active(game).outcome !== undefined) break;
    peakBugs = Math.max(
      peakBugs,
      active(game).units.filter((u) => u.team === "bugs" && u.hp > 0).length,
    );
    const started = performance.now();
    const ended = store.dispatch(endTurn());
    endTurnMs.push(performance.now() - started);
    if (!ended.ok) break;
    turns++;
    for (const event of ended.value.events) {
      if (event.type === GUARDS_SUMMONED) {
        summoned += event.payload.guardIds.length;
      }
      if (event.type === SOVEREIGN_RETREATING && retreatTurn === undefined) {
        retreatTurn = turns;
      }
    }
  }
  const outcome = active(game).outcome;
  const ours = active(game).units.filter((u) => u.team === "tdf");
  return {
    standing: ours.filter((u) => u.hp > 0).length,
    lost: ours.filter((u) => u.hp <= 0).length,
    endHp: ours.reduce((sum, u) => sum + Math.max(0, u.hp), 0),
    summoned,
    retreatTurn,
    outcome:
      outcome === "won" ? "won" : outcome === undefined ? "unresolved" : "lost",
    turns,
    endTurnMs,
    peakBugs,
  };
}

/** What became of the Sovereign on `mission`, if she stood there. */
function sovereignOn(mission: TacticalState | undefined): SovereignFate {
  const her = mission?.units.find(isSovereign);
  if (her === undefined) return { end: "absent", hp: 0, maxHp: 0 };
  return {
    end: her.hp > 0 ? "alive" : "killed",
    hp: Math.max(0, her.hp),
    maxHp: her.maxHp,
  };
}

/** One seed: a finale campaign, the platform pinned, both stages played. */
function playSeed(seed: number): PlatformRun {
  const game = composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => seed,
    onAutosaveFailure: (error) => {
      throw new Error(`autosave failed: ${error.kind}`);
    },
  });
  const fresh = game.createCampaign({ seed, createdAt: NOW });
  const [first] = fresh.roster.mechs;
  if (first === undefined) throw new Error("the starter roster has a mech");
  const loadout = finaleLoadout();
  const mechs: Mech[] = [1, 2, 3, 4].map((n) => ({
    ...first,
    id: `mech-finale-${String(n)}`,
    name: `Line ${String(n)}`,
    loadout,
  }));
  game.session.start({
    ...fresh,
    roster: { ...fresh.roster, mechs },
    overworld: {
      ...fresh.overworld,
      missions: [],
      progress: { ...fresh.overworld.progress, act: "finale" },
    },
  });
  const store = game.session.store;
  if (store === undefined) throw new Error("no store");
  if (!store.dispatch(advanceDay()).ok) throw new Error("the day must advance");
  const offer = game.session.state?.overworld.missions.find(
    (m) => m.storyId === "spore-platform",
  );
  if (offer === undefined) throw new Error("the platform must pin");
  const started = store.dispatch(
    startMission(offer.id, {
      missionId: offer.id,
      squadIds: [],
      mechIds: mechs.map((m) => m.id),
    }),
  );
  if (!started.ok)
    throw new Error(`no start: ${JSON.stringify(started.error)}`);
  const deployed = active(game).units.filter((u) => u.kind === "mech").length;
  if (deployed !== mechs.length) {
    throw new Error(
      `${String(deployed)} of 4 mechs deployed on seed ${String(seed)}`,
    );
  }

  const hull = playStage(game, "hull");
  const boarding = active(game).extracted.filter(
    (u) => u.team === "tdf" && u.kind === "mech" && u.hp > 0,
  );
  const onHull = active(game);
  const pools = boarding.flatMap((u) =>
    (onHull.templates[u.templateId]?.weapons ?? []).flatMap((weapon) =>
      weapon.charges === undefined
        ? []
        : [
            {
              left: u.charges?.[weapon.id] ?? weapon.charges,
              max: weapon.charges,
            },
          ],
    ),
  );
  const carried = {
    mechs: boarding.length,
    hp: boarding.reduce((sum, u) => sum + u.hp, 0),
    maxHp: boarding.reduce((sum, u) => sum + u.maxHp, 0),
    charges: pools.reduce((sum, pool) => sum + pool.left, 0),
    maxCharges: pools.reduce((sum, pool) => sum + pool.max, 0),
  };
  const carriedHeat = boarding.reduce((sum, u) => sum + (u.heat ?? 0), 0);
  if (hull.outcome !== "won") {
    return {
      seed,
      hull,
      core: undefined,
      carried,
      carriedHeat,
      sovereign: sovereignOn(undefined),
    };
  }
  if (!store.dispatch(advanceStage(offer.id)).ok) {
    throw new Error(`the core must open on seed ${String(seed)}`);
  }
  const core = playStage(game, "core");
  return {
    seed,
    hull,
    core,
    carried,
    carriedHeat,
    sovereign: sovereignOn(active(game)),
  };
}

// ===========================================
// Report
// ===========================================

/** The median of `values`, 0 when empty. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

describe.skipIf(process.env.SIM_PLATFORM_OUT === undefined)(
  "the Spore Platform with a finale force (#1179)",
  () => {
    it("plays both stages on every seed and reports the calibration numbers", () => {
      const runs = SEEDS.map(playSeed);
      const out = process.env.SIM_PLATFORM_OUT ?? "";
      writeFileSync(
        out,
        [
          [
            "seed",
            "hull",
            "hull_turns",
            "hull_peak_bugs",
            "hull_endturn_median_ms",
            "hull_standing",
            "hull_lost",
            "carried_mechs",
            "carried_hp",
            "carried_max_hp",
            "carried_charges",
            "carried_max_charges",
            "carried_heat",
            "core",
            "core_turns",
            "core_peak_bugs",
            "core_endturn_median_ms",
            "core_endturn_max_ms",
            "core_standing",
            "core_lost",
            "core_end_hp",
            "core_guards_summoned",
            "sovereign",
            "sovereign_retreat_turn",
            "sovereign_hp",
            "sovereign_max_hp",
          ].join("\t"),
          ...runs.map((run) =>
            [
              run.seed,
              run.hull.outcome,
              run.hull.turns,
              run.hull.peakBugs,
              median(run.hull.endTurnMs).toFixed(0),
              run.hull.standing,
              run.hull.lost,
              run.carried.mechs,
              run.carried.hp,
              run.carried.maxHp,
              run.carried.charges,
              run.carried.maxCharges,
              run.carriedHeat,
              run.core?.outcome ?? "-",
              run.core?.turns ?? "-",
              run.core?.peakBugs ?? "-",
              run.core === undefined
                ? "-"
                : median(run.core.endTurnMs).toFixed(0),
              run.core === undefined
                ? "-"
                : Math.max(0, ...run.core.endTurnMs).toFixed(0),
              run.core?.standing ?? "-",
              run.core?.lost ?? "-",
              run.core?.endHp ?? "-",
              run.core?.summoned ?? "-",
              run.sovereign.end,
              run.core?.retreatTurn ?? "-",
              run.sovereign.hp,
              run.sovereign.maxHp,
            ].join("\t"),
          ),
        ].join("\n") + "\n",
      );
      // Every seed played: a stage that neither ends nor moves is a
      // driver problem to report, not a result.
      for (const run of runs) {
        expect(run.hull.turns, `seed ${String(run.seed)}`).toBeGreaterThan(0);
      }
    });
  },
);
