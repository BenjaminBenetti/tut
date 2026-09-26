import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { advanceDay } from "../../overworld/model/advance-day-command";
import type { Mission } from "../../overworld/model/mission";
import type { TechNode } from "../../tech/model/tech-node";
import { NO_TECH_CONDITIONS } from "../../tech/model/tech-conditions";
import {
  composeSweepGame,
  SWEEP_NOW,
  SWEEP_RESULTS,
} from "./campaign-sweep.test-helper";
import type { ResearchView } from "./modelled-player.test-helper";
import {
  CAMPAIGN_SWEEP_TUNING,
  chooseOffer,
  deploymentFor,
  MODELLED_PLAYER_IDS,
  ModelledMissionResolver,
  nextResearch,
  playsOn,
  resultContextFor,
  rollOutcome,
} from "./modelled-player.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** A tree node of `kind` costing `cost`, open unless it requires something. */
function node(
  id: string,
  kind: TechNode["kind"],
  cost: number,
  extra: Partial<TechNode> = {},
): TechNode {
  return {
    id,
    name: id,
    description: id,
    family: "chassis",
    kind,
    tier: 2,
    cost,
    requires: [],
    effects: [],
    ...extra,
  } as TechNode;
}

/** A research view over `nodes` with `pool` in hand and `unlocked` bought. */
function view(
  nodes: readonly TechNode[],
  pool: number,
  unlocked: readonly string[] = [],
): ResearchView {
  return {
    nodes,
    tech: { unlocked },
    economy: { techPoints: pool },
    conditions: NO_TECH_CONDITIONS,
  };
}

/**
 * Two offers for the offer policy: a real one off a fresh campaign's
 * first board, and a copy of it under another id.
 */
function realOffers(): readonly Mission[] {
  const game = composeSweepGame(CAMPAIGN_SWEEP_TUNING.players.average);
  const fresh = game.createCampaign({ seed: 3, createdAt: SWEEP_NOW });
  const applied = game.dispatcher.process(fresh, advanceDay());
  if (!applied.ok) throw new Error(JSON.stringify(applied.error));
  const offer = applied.value.state.overworld.missions[0];
  if (offer === undefined) throw new Error("the first board has an offer");
  return [offer, { ...offer, id: `${offer.id}-copy` }];
}

// ===========================================
// Tuning and cadence
// ===========================================

describe("CAMPAIGN_SWEEP_TUNING (campaign arc §12)", () => {
  it("models the four players the arc names, with shares that sum to at most one", () => {
    expect(Object.keys(CAMPAIGN_SWEEP_TUNING.players).sort()).toEqual(
      [...MODELLED_PLAYER_IDS].sort(),
    );
    const { average, strong } = CAMPAIGN_SWEEP_TUNING.players;
    expect(average.outcomes).toEqual({ won: 0.7, extracted: 0.1 });
    expect(strong.outcomes.won).toBe(0.95);
    expect(CAMPAIGN_SWEEP_TUNING.players["story-only"].intelShare).toBe(1);
    for (const id of MODELLED_PLAYER_IDS) {
      const { won, extracted } = CAMPAIGN_SWEEP_TUNING.players[id].outcomes;
      expect(won + extracted, id).toBeLessThanOrEqual(1);
    }
  });

  it("plays three days in four, one mission a day: 0.75 missions a day (arc §3)", () => {
    const average = CAMPAIGN_SWEEP_TUNING.players.average;
    const days = Array.from({ length: 400 }, (_, day) => day);
    const played = days.filter((day) => playsOn(average, day, 0)).length;
    expect(played / days.length).toBe(0.75);
    expect(
      days.some((day) => playsOn(CAMPAIGN_SWEEP_TUNING.players.idle, day, 0)),
    ).toBe(false);
  });
});

// ===========================================
// The resolver
// ===========================================

describe("ModelledMissionResolver", () => {
  it("splits one draw by the shares: won, then extracted, then lost", () => {
    const shares = { won: 0.7, extracted: 0.1 };
    expect(rollOutcome(shares, 0)).toBe("won");
    expect(rollOutcome(shares, 0.699)).toBe("won");
    expect(rollOutcome(shares, 0.7)).toBe("extracted");
    expect(rollOutcome(shares, 0.799)).toBe("extracted");
    expect(rollOutcome(shares, 0.8)).toBe("lost");
    expect(rollOutcome(shares, 0.999)).toBe("lost");
  });

  it("wins about its share of missions over many draws, from the stream it is handed", () => {
    const average = CAMPAIGN_SWEEP_TUNING.players.average;
    const resolver = new ModelledMissionResolver(
      average,
      resultContextFor(average, SWEEP_RESULTS),
    );
    const offer = realOffers()[0];
    if (offer === undefined) throw new Error("a fresh campaign has offers");
    const rng = new Mulberry32Rng(11);
    const outcomes = Array.from(
      { length: 2000 },
      () =>
        resolver.resolve(
          offer,
          deploymentFor(offer, { squads: [], mechs: [] }),
          undefined as never,
          rng.fork(),
        ).outcome,
    );
    const won =
      outcomes.filter((each) => each === "won").length / outcomes.length;
    const extracted =
      outcomes.filter((each) => each === "extracted").length / outcomes.length;
    expect(won).toBeGreaterThan(0.66);
    expect(won).toBeLessThan(0.74);
    expect(extracted).toBeGreaterThan(0.07);
    expect(extracted).toBeLessThan(0.13);
  });
});

// ===========================================
// Offers
// ===========================================

describe("chooseOffer", () => {
  const ctx = resultContextFor(
    CAMPAIGN_SWEEP_TUNING.players.average,
    SWEEP_RESULTS,
  );

  it("takes the offer whose win brings home the most tech points", () => {
    const [first, second] = realOffers();
    if (first === undefined || second === undefined)
      throw new Error("two offers");
    const rich: Mission = {
      ...second,
      rewards: { ...second.rewards, techPoints: 999 },
    };
    expect(chooseOffer([first, rich], ctx)?.id).toBe(rich.id);
  });

  it("takes a pinned story offer over any richer one", () => {
    const [first, second] = realOffers();
    if (first === undefined || second === undefined)
      throw new Error("two offers");
    const story: Mission = { ...first, storyId: "first-skyfall", pinned: true };
    const rich: Mission = {
      ...second,
      rewards: { ...second.rewards, techPoints: 999 },
    };
    expect(chooseOffer([rich, story], ctx)?.id).toBe(story.id);
  });

  it("breaks a tie on credits, then board order, and takes nothing from an empty board", () => {
    const [first, second] = realOffers();
    if (first === undefined || second === undefined)
      throw new Error("two offers");
    const same = { credits: 300, techPoints: 10 };
    const a: Mission = {
      ...first,
      rewards: same,
      mapParams: { ...first.mapParams, techCarcass: undefined },
    };
    const b: Mission = {
      ...second,
      rewards: same,
      mapParams: { ...second.mapParams, techCarcass: undefined },
    };
    expect(chooseOffer([a, b], ctx)?.id).toBe(a.id);
    expect(
      chooseOffer([a, { ...b, rewards: { ...same, credits: 900 } }], ctx)?.id,
    ).toBe(b.id);
    expect(chooseOffer([], ctx)).toBeUndefined();
  });
});

// ===========================================
// Research
// ===========================================

describe("nextResearch", () => {
  const part = node("part-a", "part", 40);
  const cheap = node("part-b", "part", 18);
  const intel = node("intel-a", "intel", 180);

  it("buys the cheapest open node of a fund that covers it", () => {
    expect(nextResearch(view([part, cheap], 100), 0.5)?.id).toBe("part-b");
  });

  it("waits for an unaffordable Intel node rather than spend its fund on parts", () => {
    // Earned 200: intel fund 100 < 180, other fund 100 ≥ 18.
    expect(nextResearch(view([intel, cheap], 200), 0.5)?.id).toBe("part-b");
    // Earned 200 with 18 spent: Intel's 100 waits on 180, the other
    // fund's 82 waits on a 90 part; nothing is bought.
    const big = node("part-d", "part", 90);
    expect(
      nextResearch(view([intel, cheap, big], 182, ["part-b"]), 0.5),
    ).toBeUndefined();
    // Earned 360: its half covers Intel.
    expect(
      nextResearch(view([intel, cheap, big], 342, ["part-b"]), 0.5)?.id,
    ).toBe("intel-a");
  });

  it("the Story-only share spends nothing on parts", () => {
    expect(nextResearch(view([cheap], 500), 1)).toBeUndefined();
    expect(nextResearch(view([intel, cheap], 180), 1)?.id).toBe("intel-a");
  });

  it("an other fund with nothing left to buy flows to Intel", () => {
    expect(nextResearch(view([intel, cheap], 180, ["part-b"]), 0.5)?.id).toBe(
      "intel-a",
    );
  });

  it("never buys a hidden node: it appears only through the real reveal rules", () => {
    const hidden = node("intel-h", "intel", 10, {
      requiresFlags: ["spore-sample"],
    });
    expect(nextResearch(view([hidden], 500), 1)).toBeUndefined();
    expect(
      nextResearch(
        {
          ...view([hidden], 500),
          conditions: { flags: new Set(["spore-sample"]) },
        },
        1,
      )?.id,
    ).toBe("intel-h");
  });

  it("never buys a node whose prerequisite is not bought", () => {
    const locked = node("part-c", "part", 10, { requires: ["part-a"] });
    expect(nextResearch(view([locked, part], 100), 0)?.id).toBe("part-a");
  });
});
