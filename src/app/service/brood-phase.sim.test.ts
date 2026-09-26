/// <reference types="node" />
import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { actingBugIds } from "../../bugs/ai/bug-phase-runner";
import { BUG_SPECIES } from "../../bugs/data/species";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import {
  HIVE_CAVERN_HOOKS,
  HIVE_CAVERN_SIZE,
} from "../../mapgen/data/hive-cavern-recipe";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { BROOD_TUNING } from "../../tactical/data/brood-tuning";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import { BLAST_RESOLVED } from "../../tactical/model/blast-resolved-event";
import { endTurn } from "../../tactical/model/end-turn-command";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { UnitId } from "../../tactical/model/unit";
import { UNIT_MOVED } from "../../tactical/model/unit-moved-event";
import { placeCavernBroods } from "../../tactical/service/brood-placement-service";
import { wakeBrood } from "../../tactical/service/brood-wake-service";
import { applyTacticalCommand } from "../../tactical/service/tactical-command-handlers";
import { initialVision } from "../../tactical/service/vision-service";
import { previewMission } from "./preview-units";
import { shippedTacticalHandlers } from "./tactical-composition";

// ===========================================
// The dormant-brood bug phase (#1179, campaign arc §7.5)
// ===========================================

/**
 * What a sleeping cavern costs a turn. On real hive caverns carrying
 * `placeCavernBroods` at difficulty 5 (50+ bugs), one shipped EndTurn
 * — burn, spawns, sitreps, the whole bug phase — is timed three ways:
 *
 * ```
 *   all dormant     nobody acts; the phase should cost next to nothing
 *   one woken       each brood in turn: its members act, nobody else
 *   all woken       every bug acts: the cost dormancy saves
 * ```
 *
 * The arc's target is 10–15 bugs acting per turn. `SIM_BROOD_OUT`
 * names a TSV the numbers are written to, since vitest keeps a sim's
 * console to itself. The pins are on who acts, never on milliseconds:
 * wall time is reported, and a loaded machine would fail a budget.
 */

/** Real cavern seeds; each is generated once. */
const SEEDS = ["brood-1", "brood-2", "brood-3"] as const;

/** Enough bugs to be a hive (the arc's "50+"). */
const DIFFICULTY = 5;

/** Timed EndTurns per case; the median is reported. */
const REPEATS = Number(process.env.SIM_BROOD_REPEATS ?? "3");

/** One row of the report. */
interface PhaseRow {
  readonly seed: string;
  readonly scenario: string;
  readonly living: number;
  readonly acting: number;
  readonly acted: number;
  readonly medianMs: number;
}

// ===========================================
// Fixtures
// ===========================================

/** A generated hive cavern. */
function cavern(seed: string): TacticalMap {
  return generateTacticalMap(
    {
      seed,
      params: {
        archetype: "hive-cavern",
        biome: "temperate",
        settlement: "rural",
        size: HIVE_CAVERN_SIZE,
        hooks: HIVE_CAVERN_HOOKS,
      },
    },
    { registries: createDefaultRegistries() },
  );
}

/** The preview squad on the deploy zone and the cavern's broods, all asleep. */
function hive(map: TacticalMap): TacticalState {
  const preview = previewMission(map);
  const squadOnly: TacticalState = {
    ...preview,
    difficulty: DIFFICULTY,
    seed: 1179,
    units: preview.units.filter((unit) => unit.team === "tdf"),
  };
  const placed = placeCavernBroods(squadOnly, map, {
    ids: new SequentialIdGenerator({ counters: { unit: 500 } }),
    broods: { species: Object.values(BUG_SPECIES), tuning: BROOD_TUNING },
  });
  return { ...placed, vision: initialVision(placed) };
}

/** Every brood woken in the player phase, as a squad step would. */
function wakeAll(mission: TacticalState): TacticalState {
  return (mission.broods ?? []).reduce(
    (state, brood) => wakeBrood(state, brood.id, "noise").state,
    mission,
  );
}

/** The bugs whose own action shows in the phase's events. */
function actedIn(events: readonly TacticalEvent[]): ReadonlySet<UnitId> {
  const acted = new Set<UnitId>();
  for (const event of events) {
    if (event.type === UNIT_MOVED) {
      acted.add(event.payload.unitId);
    } else if (
      event.type === ATTACK_RESOLVED ||
      event.type === BLAST_RESOLVED
    ) {
      acted.add(event.payload.attackerId);
    }
  }
  return acted;
}

/** Plays one shipped EndTurn `REPEATS` times from the same state and measures it. */
function timePhase(
  seed: string,
  scenario: string,
  mission: TacticalState,
): PhaseRow {
  const handlers = shippedTacticalHandlers();
  const bugIds = new Set(
    mission.units
      .filter((unit) => unit.team === "bugs" && unit.hp > 0)
      .map((unit) => unit.id),
  );
  const times: number[] = [];
  let acted = 0;
  for (let run = 0; run < REPEATS; run += 1) {
    const ctx = {
      rng: new Mulberry32Rng(1179).fork("brood-phase"),
      ids: new SequentialIdGenerator({ counters: { unit: 5000 } }),
    };
    const started = performance.now();
    const outcome = applyTacticalCommand(handlers, mission, endTurn(), ctx);
    times.push(performance.now() - started);
    if (!outcome.ok) {
      throw new Error(`EndTurn refused on ${seed}/${scenario}`);
    }
    acted = [...actedIn(outcome.value.events)].filter((id) =>
      bugIds.has(id),
    ).length;
  }
  times.sort((a, b) => a - b);
  return {
    seed,
    scenario,
    living: bugIds.size,
    acting: actingBugIds({ ...mission, phase: "bugs" }).length,
    acted,
    medianMs: times[Math.floor(times.length / 2)] ?? 0,
  };
}

// ===========================================
// Sweep
// ===========================================

describe("dormant broods on a real hive cavern (#1179)", () => {
  it("only woken broods act, and a sleeping hive's bug phase costs next to nothing", () => {
    const rows: PhaseRow[] = [];
    for (const seed of SEEDS) {
      const mission = hive(cavern(seed));
      rows.push(timePhase(seed, "all dormant", mission));
      for (const brood of mission.broods ?? []) {
        rows.push(
          timePhase(
            seed,
            `woken ${brood.label ?? brood.id}`,
            wakeBrood(mission, brood.id, "noise").state,
          ),
        );
      }
      rows.push(timePhase(seed, "all woken", wakeAll(mission)));
    }

    if (process.env.SIM_BROOD_OUT !== undefined) {
      writeFileSync(
        process.env.SIM_BROOD_OUT,
        [
          "seed\tscenario\tliving\tacting\tacted\tmedian_ms",
          ...rows.map((row) =>
            [
              row.seed,
              row.scenario,
              row.living,
              row.acting,
              row.acted,
              row.medianMs.toFixed(1),
            ].join("\t"),
          ),
        ].join("\n") + "\n",
      );
    }

    for (const row of rows) {
      expect(row.living, `${row.seed}: a hive`).toBeGreaterThanOrEqual(50);
      // Nobody outside the woken broods acts; a woken bug may still
      // have nothing to do (no path to the squad this turn).
      expect(row.acted, `${row.seed} ${row.scenario}`).toBeLessThanOrEqual(
        row.acting,
      );
      if (row.scenario === "all dormant") {
        expect(row.acting).toBe(0);
        expect(row.acted).toBe(0);
      }
      if (row.scenario === "all woken") {
        expect(row.acting).toBe(row.living);
        expect(row.acted).toBeGreaterThan(0);
      }
    }
  });
});
