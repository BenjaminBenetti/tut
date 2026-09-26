import { describe, expect, it } from "vitest";

import type { SitrepId } from "../../../content/model/sitrep-id";
import { SITREP_IDS } from "../../../content/model/sitrep-id";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import type { SitrepRule, SitrepRules } from "../../model/sitrep-rule";
import type { TacticalState } from "../../model/tactical-state";
import { fieldMission } from "./sitrep-fixtures.test-helper";
import { SITREP_RULES } from "./sitrep-rules";
import {
  activeSitreps,
  applySitrepSetups,
  sitrepPhaseSteps,
  sitrepRngLabel,
  sitrepSightRange,
} from "./sitrep-service";

// ===========================================
// Fixtures
// ===========================================

/** What a recording rule saw: its id and the first draw of its stream. */
interface Seen {
  readonly id: SitrepId;
  readonly draw: number;
}

/**
 * A table of rules that each record their first draw into the mission's
 * log and halve sight, so a test can read the order they ran in and the
 * stream each was handed.
 */
function recordingRules(seen: Seen[]): SitrepRules {
  const rule = (id: SitrepId): SitrepRule => ({
    id,
    setup: (state, _map, ctx) => {
      seen.push({ id, draw: ctx.rng.next() });
      return { ...state, commandSeq: state.commandSeq + 1 };
    },
    sight: (range) => range - 1,
    phaseStep: (mission, ctx) => ({
      state: {
        ...mission,
        commandSeq: mission.commandSeq + ctx.rng.nextInt(1, 1),
      },
      events: [],
    }),
  });
  return Object.fromEntries(SITREP_IDS.map((id) => [id, rule(id)])) as Record<
    SitrepId,
    SitrepRule
  >;
}

/** The first draw of a sitrep's own stream for `seed`. */
function firstDraw(id: SitrepId, seed: number): number {
  return new Mulberry32Rng(seed).fork(sitrepRngLabel(id)).next();
}

// ===========================================
// Tests
// ===========================================

describe("activeSitreps", () => {
  it("lists a mission's sitreps in SITREP_IDS order, whatever order they were rolled in", () => {
    expect(
      activeSitreps({ sitreps: ["local-guides", "nightfall", "spore-fog"] }),
    ).toEqual(["nightfall", "spore-fog", "local-guides"]);
    expect(activeSitreps({})).toEqual([]);
    expect(activeSitreps({ sitreps: [] })).toEqual([]);
  });
});

describe("applySitrepSetups", () => {
  it("runs each carried sitrep's setup in SITREP_IDS order, each on its own fork of the seed", () => {
    const seen: Seen[] = [];
    const mission = fieldMission(["local-guides", "spore-fog"]);
    const out = applySitrepSetups(
      mission,
      mission.map,
      42,
      new SequentialIdGenerator(),
      recordingRules(seen),
    );
    expect(seen).toEqual([
      { id: "spore-fog", draw: firstDraw("spore-fog", 42) },
      { id: "local-guides", draw: firstDraw("local-guides", 42) },
    ]);
    expect(out.commandSeq).toBe(mission.commandSeq + 2);
  });

  it("never shifts one sitrep's draws when another is added", () => {
    const alone: Seen[] = [];
    const paired: Seen[] = [];
    const one = fieldMission(["local-guides"]);
    const two = fieldMission(["nightfall", "local-guides"]);
    const ids = () => new SequentialIdGenerator();
    applySitrepSetups(one, one.map, 9, ids(), recordingRules(alone));
    applySitrepSetups(two, two.map, 9, ids(), recordingRules(paired));
    expect(paired.find((s) => s.id === "local-guides")).toEqual(alone[0]);
  });

  it("returns a mission without sitreps as it came", () => {
    const mission = fieldMission();
    expect(
      applySitrepSetups(mission, mission.map, 1, new SequentialIdGenerator()),
    ).toBe(mission);
  });

  it("skips a rule with no setup", () => {
    const mission = fieldMission(["nightfall"]);
    expect(
      applySitrepSetups(mission, mission.map, 1, new SequentialIdGenerator()),
    ).toBe(mission);
  });
});

describe("sitrepSightRange", () => {
  it("passes the range through every carried sitrep's sight hook", () => {
    const rules = recordingRules([]);
    expect(sitrepSightRange(12, { sitreps: ["nightfall"] }, rules)).toBe(11);
    expect(
      sitrepSightRange(12, { sitreps: ["nightfall", "spore-fog"] }, rules),
    ).toBe(10);
    expect(sitrepSightRange(12, {}, rules)).toBe(12);
  });

  it("applies the shipped Nightfall and nothing else", () => {
    expect(sitrepSightRange(12, { sitreps: ["nightfall"] })).toBe(8);
    expect(
      sitrepSightRange(12, {
        sitreps: ["spore-fog", "city-ablaze", "salvage-rich", "local-guides"],
      }),
    ).toBe(12);
  });
});

describe("sitrepPhaseSteps", () => {
  it("ships one step, City Ablaze's", () => {
    expect(sitrepPhaseSteps()).toHaveLength(1);
    expect(sitrepPhaseSteps(recordingRules([]))).toHaveLength(
      SITREP_IDS.length,
    );
  });

  it("runs a step only on a mission that carries its sitrep", () => {
    const [nightfall] = sitrepPhaseSteps(recordingRules([]));
    const ctx = { rng: new Mulberry32Rng(1), ids: new SequentialIdGenerator() };
    const without: TacticalState = fieldMission(["spore-fog"]);
    expect(nightfall!(without, ctx).state).toBe(without);
    const carrying = fieldMission(["nightfall"]);
    expect(nightfall!(carrying, ctx).state.commandSeq).toBe(
      carrying.commandSeq + 1,
    );
  });

  it("hands the step its own fork of the phase stream and draws nothing from the phase's", () => {
    const drawn: number[] = [];
    const rules: SitrepRules = {
      ...SITREP_RULES,
      nightfall: {
        id: "nightfall",
        phaseStep: (mission, ctx) => {
          drawn.push(ctx.rng.next());
          return { state: mission, events: [] };
        },
      },
    };
    const [step] = sitrepPhaseSteps(rules);
    const phase = new Mulberry32Rng(5);
    step!(fieldMission(["nightfall"]), {
      rng: phase,
      ids: new SequentialIdGenerator(),
    });
    expect(drawn).toEqual([
      new Mulberry32Rng(5).fork(sitrepRngLabel("nightfall")).next(),
    ]);
    expect(phase.next()).toBe(new Mulberry32Rng(5).next());
  });
});
