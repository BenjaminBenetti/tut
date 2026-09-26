import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../../content/data/mission-types";
import { ACTS } from "../../data/acts";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { MAX_INFESTATION } from "../../model/city";
import type { MissionOfferContext } from "../../model/mission-offer-rule";
import type { OfferChanceCurve } from "../../model/mission-tuning";
import {
  DEFEND_INSTALLATION_TRIGGER,
  offerChance,
  wavesFor,
} from "./defend-installation-trigger";
import {
  fixtureState,
  installation,
  missionAt,
  offerContext,
} from "./mission-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const CURVE = MISSION_TUNING.defence.offer;

/** `ctx` whose defend roll is `chance` at every infestation from the threshold up. */
function rolling(
  ctx: MissionOfferContext,
  chance: number,
): MissionOfferContext {
  return {
    ...ctx,
    tuning: {
      ...ctx.tuning,
      defence: {
        ...ctx.tuning.defence,
        offer: { ...CURVE, chanceAtThreshold: chance, chanceAtMax: chance },
      },
    },
  };
}

/** A context whose defend roll always succeeds. */
function always(seed = 1): MissionOfferContext {
  return rolling(offerContext(seed), 1);
}

// ===========================================
// Formulae
// ===========================================

describe("offerChance", () => {
  it("is zero below the threshold and linear up to the maximum", () => {
    expect(offerChance(CURVE.minInfestation - 1, CURVE)).toBe(0);
    expect(offerChance(CURVE.minInfestation, CURVE)).toBeCloseTo(
      CURVE.chanceAtThreshold,
    );
    expect(offerChance(MAX_INFESTATION, CURVE)).toBeCloseTo(CURVE.chanceAtMax);
    const mid = (CURVE.minInfestation + MAX_INFESTATION) / 2;
    expect(offerChance(mid, CURVE)).toBeCloseTo(
      (CURVE.chanceAtThreshold + CURVE.chanceAtMax) / 2,
    );
  });

  it("treats a threshold at maximum infestation as an all-or-nothing gate", () => {
    const gate: OfferChanceCurve = {
      ...CURVE,
      minInfestation: MAX_INFESTATION,
    };
    expect(offerChance(99, gate)).toBe(0);
    expect(offerChance(100, gate)).toBeCloseTo(CURVE.chanceAtMax);
  });
});

describe("wavesFor", () => {
  it("adds a wave per twenty points of regional infestation and caps", () => {
    const tuning = MISSION_TUNING.defence;
    expect(wavesFor(0, tuning)).toBe(tuning.baseWaves);
    expect(wavesFor(40, tuning)).toBe(tuning.baseWaves + 2);
    expect(wavesFor(60, tuning)).toBe(tuning.baseWaves + 3);
    expect(wavesFor(100, tuning)).toBe(tuning.maxWaves);
    expect(wavesFor(1000, tuning)).toBe(tuning.maxWaves);
  });

  it("never sends fewer than one wave", () => {
    expect(
      wavesFor(0, {
        ...MISSION_TUNING.defence,
        baseWaves: 0,
        wavesPerInfestationPoint: 0,
        maxWaves: 0,
      }),
    ).toBe(1);
  });
});

// ===========================================
// Trigger
// ===========================================

describe("DEFEND_INSTALLATION_TRIGGER", () => {
  it("is a trigger rule for the defend type", () => {
    expect(DEFEND_INSTALLATION_TRIGGER.kind).toBe("trigger");
    expect(DEFEND_INSTALLATION_TRIGGER.typeId).toBe("defend-installation");
  });

  it("offers nothing to a region without an installation, however infested", () => {
    expect(
      DEFEND_INSTALLATION_TRIGGER.trigger(fixtureState(), always()),
    ).toEqual([]);
  });

  it("offers a defend mission to an installed region above the threshold, on its worst city", () => {
    const offered = DEFEND_INSTALLATION_TRIGGER.trigger(
      fixtureState({ deployables: [installation("dep-1", "east", "bank")] }),
      always(),
    );
    expect(offered).toHaveLength(1);
    const [mission] = offered;
    expect(mission?.typeId).toBe("defend-installation");
    expect(mission?.cityId).toBe("full");
    expect(mission?.defence).toEqual({
      installation: "bank",
      deployableId: "dep-1",
      generators: 3,
      waves: wavesFor(75, MISSION_TUNING.defence),
    });
    expect(mission?.mapParams.settlement).toBe("town");
    expect(mission?.expiresDay).toBe(
      5 + MISSION_TYPES["defend-installation"].expiryDays,
    );
    // Not pinned: it lapses like any offer; it is off the cap because
    // it comes from a trigger rule.
    expect(mission).not.toHaveProperty("pinned");
  });

  it("offers nothing to an installed region below the regional threshold", () => {
    expect(
      DEFEND_INSTALLATION_TRIGGER.trigger(
        fixtureState({ deployables: [installation("dep-1", "west")] }),
        always(),
      ),
    ).toEqual([]);
  });

  it("falls back to the next city when the worst one already has an offer", () => {
    const offered = DEFEND_INSTALLATION_TRIGGER.trigger(
      fixtureState({
        deployables: [installation("dep-1", "east")],
        missions: [missionAt("full", 9)],
      }),
      always(),
    );
    expect(offered.map((m) => m.cityId)).toEqual(["mid"]);
  });

  it("offers nothing when every city in the region already has an offer", () => {
    expect(
      DEFEND_INSTALLATION_TRIGGER.trigger(
        fixtureState({
          deployables: [installation("dep-1", "east")],
          missions: [missionAt("full", 9), missionAt("mid", 9)],
        }),
        always(),
      ),
    ).toEqual([]);
  });

  it("offers at most one defend mission per region per day", () => {
    const offered = DEFEND_INSTALLATION_TRIGGER.trigger(
      fixtureState({
        deployables: [
          installation("dep-1", "east", "bank"),
          installation("dep-2", "east", "sensor-array"),
        ],
      }),
      always(),
    );
    expect(offered).toHaveLength(1);
  });

  it("clamps its difficulty into the act's band like any non-story offer", () => {
    const state = fixtureState({
      threat: 100,
      deployables: [installation("dep-1", "east")],
    });
    const [wide] = DEFEND_INSTALLATION_TRIGGER.trigger(state, always());
    const [actOne] = DEFEND_INSTALLATION_TRIGGER.trigger(
      state,
      rolling(offerContext(1, ACTS["act-1"]), 1),
    );
    expect(wide?.difficulty).toBe(10);
    expect(actOne?.difficulty).toBe(4);
  });

  it("picks which installation is attacked on a fork keyed by the mission id", () => {
    const state = fixtureState({
      deployables: [
        installation("dep-1", "east", "bank"),
        installation("dep-2", "east", "sensor-array"),
        installation("dep-3", "east", "defensive-battery"),
      ],
    });
    const picks = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const [mission] = DEFEND_INSTALLATION_TRIGGER.trigger(
        state,
        always(seed),
      );
      picks.add(mission?.defence?.deployableId ?? "none");
    }
    expect([...picks].sort()).toEqual(["dep-1", "dep-2", "dep-3"]);
    expect(DEFEND_INSTALLATION_TRIGGER.trigger(state, always(7))).toEqual(
      DEFEND_INSTALLATION_TRIGGER.trigger(state, always(7)),
    );
  });

  it("offers roughly in proportion to the tuned chance over many days", () => {
    const state = fixtureState({
      deployables: [installation("dep-1", "east")],
    });
    let offered = 0;
    const days = 2000;
    for (let seed = 0; seed < days; seed++) {
      offered += DEFEND_INSTALLATION_TRIGGER.trigger(
        state,
        rolling(offerContext(seed), 0.1),
      ).length;
    }
    expect(offered / days).toBeGreaterThan(0.07);
    expect(offered / days).toBeLessThan(0.13);
  });
});
