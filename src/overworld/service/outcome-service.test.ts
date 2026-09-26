import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import type { Transaction } from "../../economy/model/transaction";
import type { CampaignState } from "../model/campaign-state";
import type { GameOutcome } from "../model/game-outcome";
import { GAME_ENDED } from "../model/overworld-domain-event";
import { MAX_THREAT } from "../model/threat";
import { createInitialCampaignProgress } from "./campaign-progress-factory";
import { buildEarthMap } from "./earth-map-builder";
import {
  applyOutcome,
  evaluateOutcome,
  isDefeat,
  isStoryDefeat,
  isStoryVictory,
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
    flags?: readonly CampaignFlagId[];
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
      threatOffset: 0,
      spreadCooldowns: {},
      missions: [],
      pendingEvents: [],
      deployables: [],
      hives: options.hives
        ? [{ id: "hive-1", regionId: "r", formedDay: 1 }]
        : [],
      progress: {
        ...createInitialCampaignProgress(),
        flags: options.flags ?? [],
      },
      ...(options.outcome === undefined ? {} : { outcome: options.outcome }),
    },
    roster: { squads: [], mechs: [], savedLoadouts: [], graveyard: [] },
    economy: { credits: 100, ledger: options.ledger ?? [], techPoints: 0 },
    tech: { unlocked: [] },
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

describe("isStoryVictory and isStoryDefeat", () => {
  it("read the story's verdict flags and nothing else", () => {
    const won = campaign([50, 50, 50], { flags: ["campaign-won"] });
    const lost = campaign([50, 50, 50], { flags: ["campaign-lost"] });
    const neither = campaign([0, 0, 0], { flags: ["platform-failed"] });
    expect(isStoryVictory(won.overworld.progress)).toBe(true);
    expect(isStoryDefeat(won.overworld.progress)).toBe(false);
    expect(isStoryDefeat(lost.overworld.progress)).toBe(true);
    expect(isStoryVictory(lost.overworld.progress)).toBe(false);
    expect(isStoryVictory(neither.overworld.progress)).toBe(false);
    expect(isStoryDefeat(neither.overworld.progress)).toBe(false);
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

  it("never produces the retired victory stub, even with every city clean and no hive (D1)", () => {
    const clean = campaign([0, 0, 0], { threat: 0, day: 90 });
    expect(clean.overworld.hives).toEqual([]);
    expect(evaluateOutcome(clean)).toBeUndefined();
    expect(applyOutcome(clean).state).toBe(clean);
  });

  it("reports defeat at maximum threat with the day, the cause and the summary", () => {
    const state = campaign([100, 60, 0], { threat: MAX_THREAT, day: 40 });
    expect(evaluateOutcome(state)).toEqual({
      kind: "defeat",
      cause: "threat",
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

  it("reports victory once the story is won, however infested Earth is", () => {
    const state = campaign([80, 60, 40], {
      threat: 70,
      day: 66,
      flags: ["campaign-won"],
    });
    expect(evaluateOutcome(state)).toMatchObject({
      kind: "victory",
      cause: "story",
      day: 66,
      summary: { citiesInfested: 3, finalThreat: 70 },
    });
  });

  it("reports a story defeat when the platform has fallen twice (D7)", () => {
    const state = campaign([80, 60, 40], {
      threat: 55,
      flags: ["platform-failed", "last-hope", "campaign-lost"],
    });
    expect(evaluateOutcome(state)).toMatchObject({
      kind: "defeat",
      cause: "story",
    });
  });

  it("decides the story's verdict before threat, since the mission was played before the tick", () => {
    const won = campaign([0, 0, 0], {
      threat: MAX_THREAT,
      flags: ["campaign-won"],
    });
    expect(evaluateOutcome(won)).toMatchObject({
      kind: "victory",
      cause: "story",
    });
    const lost = campaign([0, 0, 0], {
      threat: MAX_THREAT,
      flags: ["campaign-lost"],
    });
    expect(evaluateOutcome(lost)).toMatchObject({
      kind: "defeat",
      cause: "story",
    });
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
    const won = applyOutcome(
      campaign([0, 0, 0], { day: 20, flags: ["campaign-won"] }),
    );
    expect(won.state.overworld.outcome?.kind).toBe("victory");

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
    const state = campaign([0, 0, 0], { flags: ["campaign-won"] });
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
