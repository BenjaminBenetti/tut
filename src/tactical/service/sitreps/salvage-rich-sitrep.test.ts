import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../../core/model/elevation";
import { HookKinds } from "../../../mapgen/model/hook";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import { SITREP_TUNING } from "../../data/sitrep-tuning";
import type { SalvageRichTuning } from "../../model/sitrep-tuning";
import type { TacticalState } from "../../model/tactical-state";
import type { TechCarcass } from "../../model/tech-carcass";
import { missionWith } from "../tactical-fixtures.test-helper";
import { salvageRichSitrep, scatterSalvage } from "./salvage-rich-sitrep";
import {
  DEPLOY,
  EXTRACTION,
  FIELD,
  fieldMission,
  fromDeploy,
  keyOf,
  NEST,
  setupCtx,
  squad,
} from "./sitrep-fixtures.test-helper";
import { groundDistance, nearestDistance } from "./sitrep-placement";

const SALVAGE: SalvageRichTuning = SITREP_TUNING.salvageRich;

/** The offer's own carcass, mid-field. */
const OFFERED: TechCarcass = {
  id: "carcass-1",
  pos: { x: 12, y: 0, z: 12 },
  techPoints: 12,
  harvested: false,
};

/** The mission after Salvage Rich's setup for `seed`. */
function salvaged(
  seed = 1,
  mission: TacticalState = fieldMission(["salvage-rich"]),
  tuning: SalvageRichTuning = SALVAGE,
): TacticalState {
  return scatterSalvage(
    mission,
    mission.map,
    setupCtx("salvage-rich", seed),
    tuning,
  );
}

/**
 * The field cut in two by a line of water down `x = 12`: nothing on the
 * east side can be walked to from the deploy zone.
 */
function moatedField(): TacticalMap {
  const builder = new FixtureMapBuilder(
    FIELD,
    FIELD,
    3 * STOREY_LAYERS,
  ).fillGround();
  for (let z = 0; z < FIELD; z++) {
    builder.patchTile({ x: 12, y: 0, z }, { pass: PassMask.NONE });
  }
  return builder
    .deploy(DEPLOY)
    .objective(HookKinds.EGG_SPAWNER, [NEST])
    .extraction(EXTRACTION)
    .build();
}

describe("salvageRichSitrep", () => {
  it("is a setup hook only", () => {
    const rule = salvageRichSitrep(SALVAGE);
    expect(rule.id).toBe("salvage-rich");
    expect(rule.setup).toBeDefined();
    expect(rule.sight).toBeUndefined();
    expect(rule.phaseStep).toBeUndefined();
  });
});

describe("scatterSalvage", () => {
  it("adds two carcasses to a mission that had none", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(salvaged(seed).carcasses).toHaveLength(2);
    }
  });

  it("adds two more to a mission whose offer placed one, after it, clear of it", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const out = salvaged(
        seed,
        fieldMission(["salvage-rich"], { carcasses: [OFFERED] }),
      );
      expect(out.carcasses).toHaveLength(3);
      expect(out.carcasses[0]).toBe(OFFERED);
      const [, a, b] = out.carcasses;
      expect(groundDistance(a!.pos, OFFERED.pos)).toBeGreaterThanOrEqual(
        SALVAGE.spacing,
      );
      expect(groundDistance(b!.pos, OFFERED.pos)).toBeGreaterThanOrEqual(
        SALVAGE.spacing,
      );
    }
  });

  it("prices each like the offer's own, unharvested, with carcass ids", () => {
    const out = salvaged(1, fieldMission(["salvage-rich"], { difficulty: 3 }));
    for (const carcass of out.carcasses) {
      expect(carcass.techPoints).toBe(10 + 2 * 3);
      expect(carcass.harvested).toBe(false);
      expect(carcass.id).toMatch(/^carcass-\d+$/);
    }
    expect(new Set(out.carcasses.map((c) => c.id)).size).toBe(2);
  });

  it("keeps clear of the deploy zone, the objectives, units and each other", () => {
    const held = new Set(squad().map((unit) => keyOf(unit.pos)));
    for (let seed = 1; seed <= 40; seed++) {
      const [a, b] = salvaged(seed).carcasses;
      for (const carcass of [a!, b!]) {
        expect(fromDeploy(carcass.pos)).toBeGreaterThanOrEqual(
          SALVAGE.minFromDeploy,
        );
        expect(groundDistance(carcass.pos, NEST)).toBeGreaterThanOrEqual(
          SALVAGE.objectiveClearance,
        );
        expect(nearestDistance(carcass.pos, EXTRACTION)).toBeGreaterThanOrEqual(
          SALVAGE.objectiveClearance,
        );
        expect(held.has(keyOf(carcass.pos))).toBe(false);
      }
      expect(groundDistance(a!.pos, b!.pos)).toBeGreaterThanOrEqual(
        SALVAGE.spacing,
      );
    }
  });

  it("only lies where the squad can walk to", () => {
    const mission = missionWith(moatedField(), squad(), {});
    for (let seed = 1; seed <= 40; seed++) {
      for (const carcass of salvaged(seed, mission).carcasses) {
        expect(carcass.pos.x).toBeLessThan(12);
      }
    }
  });

  it("prefers the open, within reach of the deploy zone, over a building", () => {
    // Only the building's tiles are near enough to prefer when the
    // reach is short, so the fallback must still find open ground.
    const near: SalvageRichTuning = { ...SALVAGE, preferWithin: 9 };
    for (let seed = 1; seed <= 20; seed++) {
      const [a, b] = salvaged(seed, undefined, near).carcasses;
      expect(fromDeploy(a!.pos)).toBeLessThanOrEqual(9);
      expect(b).toBeDefined();
    }
  });

  it("places fewer when the map has no more room at the spacing, and none when it has none", () => {
    const crowded: SalvageRichTuning = { ...SALVAGE, spacing: 40 };
    expect(salvaged(1, undefined, crowded).carcasses).toHaveLength(1);
    const nowhere: SalvageRichTuning = { ...SALVAGE, minFromDeploy: 99 };
    const mission = fieldMission(["salvage-rich"]);
    expect(salvaged(1, mission, nowhere)).toBe(mission);
  });

  it("is a pure function of its stream", () => {
    expect(salvaged(6)).toEqual(salvaged(6));
    expect(salvaged(6).carcasses).not.toEqual(salvaged(7).carcasses);
  });
});
