import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../../content/model/act-id";
import { MISSION_TYPE_IDS } from "../../../content/model/mission-type-id";
import { ACTS } from "../../data/acts";
import type { Mission } from "../../model/mission";
import {
  fixtureState,
  installation,
  offerContext,
  progressIn,
} from "./mission-fixtures.test-helper";
import { MISSION_OFFER_RULES } from "./mission-offer-rules";

describe("MISSION_OFFER_RULES", () => {
  it("has one entry per mission type, keyed by its own type", () => {
    expect(Object.keys(MISSION_OFFER_RULES).sort()).toEqual(
      [...MISSION_TYPE_IDS].sort(),
    );
    for (const typeId of MISSION_TYPE_IDS) {
      expect(MISSION_OFFER_RULES[typeId].typeId).toBe(typeId);
    }
  });

  it("draws the clearance and triggers the defence (arc §5)", () => {
    expect(MISSION_OFFER_RULES["infestation-clearance"].kind).toBe("offer");
    expect(MISSION_OFFER_RULES["defend-installation"].kind).toBe("trigger");
  });

  it("gives every drawn type in an act's weights an offer rule", () => {
    for (const act of ACT_IDS) {
      for (const typeId of Object.keys(ACTS[act].typeWeights)) {
        expect(
          MISSION_OFFER_RULES[typeId as keyof typeof MISSION_OFFER_RULES].kind,
        ).toBe("offer");
      }
    }
  });

  it("keeps every non-story offer inside the act's difficulty band, whatever the pressure", () => {
    for (const act of ACT_IDS) {
      const band = ACTS[act].difficultyBand;
      for (const threat of [0, 100]) {
        const state = fixtureState({
          threat,
          progress: progressIn(act),
          deployables: [installation("dep-1", "east")],
        });
        const ctx = offerContext(1, ACTS[act]);
        const offers: Mission[] = [];
        for (const typeId of MISSION_TYPE_IDS) {
          const rule = MISSION_OFFER_RULES[typeId];
          if (rule.kind === "offer") {
            for (const site of rule.eligible(state, ctx)) {
              offers.push(rule.create(state, site, ctx));
            }
          } else {
            const always = {
              ...ctx,
              tuning: {
                ...ctx.tuning,
                defence: {
                  ...ctx.tuning.defence,
                  offer: {
                    ...ctx.tuning.defence.offer,
                    chanceAtThreshold: 1,
                    chanceAtMax: 1,
                  },
                },
              },
            };
            offers.push(...rule.trigger(state, always));
          }
        }
        expect(offers.length).toBeGreaterThan(1);
        for (const offer of offers.filter((o) => o.storyId === undefined)) {
          expect(offer.difficulty).toBeGreaterThanOrEqual(band.min);
          expect(offer.difficulty).toBeLessThanOrEqual(band.max);
        }
      }
    }
  });
});
