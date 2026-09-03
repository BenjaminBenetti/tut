import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { Transaction } from "../../economy/model/transaction";
import type { CampaignState } from "../model/campaign-state";
import type { GameOutcome } from "../model/game-outcome";
import { GAME_ENDED } from "../model/overworld-domain-event";
import { MAX_THREAT } from "../model/threat";
import { buildEarthMap } from "./earth-map-builder";
import {
  applyOutcome,
  evaluateOutcome,
  isDefeat,
  isVictory,
  summarise,
} from "./outcome-service";

// ===========================================
// Fixtures
// ===========================================

/** Three cities at the given infestation levels. */
function campaign(
  levels: readonly [number, number, number],
  options: {
    threat?: number;
    day?: number;
    hives?: boolean;
    outcome?: GameOutcome;
    ledger?: readonly Transaction[];
  } = {},
): CampaignState {
  const map = buildEarthMap({
    regions: [
      {
        id: "r",
        name: "R",
        biome: "temperate",
        cities: [
          {
            id: "a",
            name: "A",
            layout: { x: 0.1, y: 0.1 },
            infestation: levels[0],
          },
          {
            id: "b",
            name: "B",
            layout: { x: 0.2, y: 0.1 },
            infestation: levels[1],
          },
          {
            id: "c",
            name: "C",
            layout: { x: 0.3, y: 0.1 },
            infestation: levels[2],
          },
        ],
      },
    ],
    links: [
      ["a", "b"],
      ["b", "c"],
    ],
  });
  return {
    meta: {
      rng: new Mulberry32Rng(1).getState(),
      ids: new SequentialIdGenerator().getState(),
    },
    overworld: {
      day: options.day ?? 12,
      map,
      threat: options.threat ?? 40,
      spreadCooldowns: {},
      missions: [],
      pendingEvents: [],
      deployables: [],
      hives: options.hives ? [{ id: "hive-1", regionId: "r" }] : [],
      ...(options.outcome === undefined ? {} : { outcome: options.outcome }),
    },
    roster: { squads: [], mechs: [], savedLoadouts: [] },
    economy: { credits: 100, ledger: options.ledger ?? [] },
  };
}

/** A ledger entry of the given kind against `ref`. */
function txn(id: string, kind: Transaction["kind"], ref: string): Transaction {
  return { id, day: 1, amount: kind === "reward" ? 100 : -100, kind, ref };
}

// ===========================================
// Conditions
// ===========================================

describe("isDefeat", () => {
  it("is true only when threat has reached the maximum", () => {
    expect(
      isDefeat(campaign([50, 50, 50], { threat: MAX_THREAT }).overworld),
    ).toBe(true);
    expect(
      isDefeat(campaign([50, 50, 50], { threat: MAX_THREAT - 1 }).overworld),
    ).toBe(false);
  });
});

describe("isVictory", () => {
  it("needs every city clean", () => {
    expect(isVictory(campaign([0, 0, 0]).overworld)).toBe(true);
    expect(isVictory(campaign([0, 1, 0]).overworld)).toBe(false);
  });

  it("is blocked by a remaining hive", () => {
    expect(isVictory(campaign([0, 0, 0], { hives: true }).overworld)).toBe(
      false,
    );
  });
});

// ===========================================
// Evaluation
// ===========================================

describe("evaluateOutcome", () => {
  it("returns undefined while the campaign is still in play", () => {
    expect(evaluateOutcome(campaign([0, 30, 100]))).toBeUndefined();
    expect(
      evaluateOutcome(campaign([0, 0, 0], { hives: true })),
    ).toBeUndefined();
    expect(
      evaluateOutcome(campaign([50, 50, 50], { threat: 99 })),
    ).toBeUndefined();
  });

  it("reports defeat at maximum threat with the day and summary", () => {
    const state = campaign([100, 60, 0], { threat: MAX_THREAT, day: 40 });
    expect(evaluateOutcome(state)).toEqual({
      kind: "defeat",
      day: 40,
      summary: {
        citiesLost: 1,
        citiesInfested: 2,
        citiesTotal: 3,
        missionsRun: 0,
        daysSurvived: 40,
        finalThreat: MAX_THREAT,
      },
    });
  });

  it("reports the victory stub when Earth is clean and hive-free", () => {
    const state = campaign([0, 0, 0], { threat: 12, day: 90 });
    expect(evaluateOutcome(state)).toMatchObject({
      kind: "victory-stub",
      day: 90,
      summary: { citiesLost: 0, citiesInfested: 0, finalThreat: 12 },
    });
  });

  it("prefers defeat when both conditions hold", () => {
    const state = campaign([0, 0, 0], { threat: MAX_THREAT });
    expect(evaluateOutcome(state)?.kind).toBe("defeat");
  });

  it("returns a stored outcome unchanged even if the map now says otherwise", () => {
    const stored: GameOutcome = {
      kind: "defeat",
      day: 5,
      summary: {
        citiesLost: 3,
        citiesInfested: 3,
        citiesTotal: 3,
        missionsRun: 2,
        daysSurvived: 5,
        finalThreat: 100,
      },
    };
    const state = campaign([0, 0, 0], { threat: 0, day: 9, outcome: stored });
    expect(evaluateOutcome(state)).toBe(stored);
  });
});

// ===========================================
// Summary
// ===========================================

describe("summarise", () => {
  it("counts missions from distinct reward refs only", () => {
    const state = campaign([0, 0, 0], {
      ledger: [
        txn("t1", "reward", "mission-1"),
        txn("t2", "reward", "mission-1"),
        txn("t3", "reward", "mission-2"),
        txn("t4", "purchase", "mission-3"),
        txn("t5", "stipend", "earth"),
      ],
    });
    expect(summarise(state).missionsRun).toBe(2);
  });
});

// ===========================================
// Apply
// ===========================================

describe("applyOutcome", () => {
  it("does nothing while the campaign is in play", () => {
    const state = campaign([0, 30, 100]);
    const { state: next, events } = applyOutcome(state);
    expect(next).toBe(state);
    expect(events).toEqual([]);
  });

  it("stores the outcome and emits GameEnded exactly once", () => {
    const state = campaign([100, 100, 100], { threat: MAX_THREAT, day: 33 });
    const first = applyOutcome(state);
    expect(first.state.overworld.outcome?.kind).toBe("defeat");
    expect(first.events).toEqual([
      { type: GAME_ENDED, payload: { outcome: first.state.overworld.outcome } },
    ]);

    const second = applyOutcome(first.state);
    expect(second.state).toBe(first.state);
    expect(second.events).toEqual([]);
  });

  it("never overwrites a stored outcome, even when a different condition now holds", () => {
    const won = applyOutcome(campaign([0, 0, 0], { day: 20 }));
    expect(won.state.overworld.outcome?.kind).toBe("victory-stub");

    const overrun: CampaignState = {
      ...won.state,
      overworld: { ...won.state.overworld, threat: MAX_THREAT, day: 21 },
    };
    const again = applyOutcome(overrun);
    expect(again.state).toBe(overrun);
    expect(again.state.overworld.outcome).toEqual(won.state.overworld.outcome);
    expect(again.events).toEqual([]);
  });

  it("never mutates its input and keeps the other slices", () => {
    const state = campaign([0, 0, 0]);
    const before = JSON.parse(JSON.stringify(state)) as CampaignState;
    const { state: next } = applyOutcome(state);
    expect(state).toEqual(before);
    expect(next.meta).toBe(state.meta);
    expect(next.roster).toBe(state.roster);
    expect(next.economy).toBe(state.economy);
    expect(next.overworld.map).toBe(state.overworld.map);
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);
  });
});
