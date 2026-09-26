import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { NEMESIS_LORE } from "../../data/nemesis-lore";
import type { Mission } from "../../model/mission";
import type { Nemesis } from "../../model/nemesis";
import type { OverworldState } from "../../model/overworld-state";
import { MISSION_OFFER_DECORATORS } from "./mission-offer-decorators";
import { fixtureState, missionAt } from "./mission-fixtures.test-helper";
import { withNamedAlpha } from "./named-alpha-offer";

// ===========================================
// Fixtures
// ===========================================

/** Grinder, a level-2 brute nemesis of the east. */
const GRINDER: Nemesis = {
  id: "nemesis:mission-2:alpha",
  speciesId: "brute",
  name: "Grinder",
  scar: "a leg lost to the squad's guns",
  regionId: "east",
  level: 2,
  escapes: 2,
};

/** An offer at `cityId` carrying `sitreps`. */
function offer(
  cityId: string,
  sitreps: Mission["sitreps"] = ["alpha-present"],
): Mission {
  return { ...missionAt(cityId, 9), sitreps };
}

/** The fixture overworld with `nemeses` on the record and `missions` on the board. */
function campaign(
  nemeses: readonly Nemesis[],
  missions: readonly Mission[] = [],
): OverworldState {
  const base = fixtureState();
  return fixtureState({
    missions,
    progress: { ...base.progress, nemeses },
  });
}

/** `mission` through the named-alpha roll on seed `seed`. */
function named(mission: Mission, state: OverworldState, seed = 1): Mission {
  return withNamedAlpha(mission, state, new Mulberry32Rng(seed), NEMESIS_LORE);
}

// ===========================================
// The roll
// ===========================================

describe("withNamedAlpha", () => {
  it("is appended to the shipped decorators, after the sitrep roll it reads", () => {
    expect(MISSION_OFFER_DECORATORS.map((d) => d.id)).toEqual([
      "bestiary",
      "sitreps",
      "alpha",
    ]);
  });

  it("leaves an offer without Alpha Present untouched", () => {
    const plain = offer("mid", ["nightfall"]);
    expect(named(plain, campaign([GRINDER]))).toBe(plain);
    const none = missionAt("mid", 9);
    expect(named(none, campaign([]))).toBe(none);
  });

  it("names a fresh alpha from the lore at level 0, the same on the same stream", () => {
    const alpha = named(offer("low"), campaign([])).alpha;
    expect(alpha?.level).toBe(0);
    expect(alpha?.nemesisId).toBeUndefined();
    expect(NEMESIS_LORE.alphaNames).toContain(alpha?.name);
    expect(named(offer("low"), campaign([])).alpha).toEqual(alpha);
  });

  it("brings back a living alpha nemesis of the offer's region, with its name, scar, level and species", () => {
    expect(named(offer("mid"), campaign([GRINDER])).alpha).toEqual({
      name: "Grinder",
      level: 2,
      nemesisId: GRINDER.id,
      speciesId: "brute",
      scar: GRINDER.scar,
    });
    // Another region's nemesis stays home.
    expect(named(offer("low"), campaign([GRINDER])).alpha?.nemesisId).toBe(
      undefined,
    );
    // A Broodmother is hunted, never crowned.
    const brood = { ...GRINDER, speciesId: "broodmother" as const };
    expect(named(offer("mid"), campaign([brood])).alpha?.nemesisId).toBe(
      undefined,
    );
  });

  it("does not bring one nemesis back on two offers at once", () => {
    const carried: Mission = {
      ...offer("full"),
      alpha: { name: "Grinder", level: 2, nemesisId: GRINDER.id },
    };
    const alpha = named(offer("mid"), campaign([GRINDER], [carried])).alpha;
    expect(alpha?.nemesisId).toBeUndefined();
    expect(alpha?.name).not.toBe("Grinder");
  });
});
