import { describe, expect, it } from "vitest";

import { SQUAD_TYPES } from "../../roster/data/squad-types";
import type { Mech } from "../../roster/model/mech";
import type { MechRater } from "../../roster/model/mech-rater";
import type { Squad } from "../../roster/model/squad";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { MissionResolutionState } from "../model/mission-resolution-state";
import {
  computeForceRating,
  mechRating,
  squadRating,
} from "./force-rating-service";

const SQUAD_TYPES_CATALOGUE = new DataSquadTypeCatalogue(SQUAD_TYPES);
const RIFLE = SQUAD_TYPES.find((t) => t.id === "rifle");

/** Rates every mech at a fixed value. */
const FLAT_RATER = (rating: number): MechRater => ({ rateMech: () => rating });

function squad(id: string, strength: number, typeId = "rifle"): Squad {
  return {
    id,
    name: id,
    typeId,
    strength,
    maxStrength: 5,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

function mech(id: string, damage: number): Mech {
  return {
    id,
    name: id,
    loadout: {
      name: "l",
      chassisId: "c",
      legsId: "l",
      armsId: "a",
      armWeaponId: "aw",
      backWeaponId: "bw",
      utilityIds: [],
    },
    damage,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

const CITY = {
  id: "c",
  name: "C",
  regionId: "r",
  infestation: 30,
  scale: "city" as const,
  neighbourIds: [],
  layout: { x: 0, y: 0 },
};

describe("squadRating", () => {
  it("scales the type rating by remaining strength", () => {
    const full = RIFLE?.combatRating ?? 0;
    expect(squadRating(squad("s", 5), SQUAD_TYPES_CATALOGUE)).toBe(full);
    expect(squadRating(squad("s", 2), SQUAD_TYPES_CATALOGUE)).toBeCloseTo(
      full * 0.4,
    );
    expect(squadRating(squad("s", 0), SQUAD_TYPES_CATALOGUE)).toBe(0);
  });

  it("throws on an unknown squad type", () => {
    expect(() =>
      squadRating(squad("s", 5, "cavalry"), SQUAD_TYPES_CATALOGUE),
    ).toThrow(/unknown type "cavalry"/);
  });
});

describe("mechRating", () => {
  it("reduces the built rating by damage according to the penalty", () => {
    expect(
      mechRating(mech("m", 0), FLAT_RATER(100), { damagePenalty: 1 }),
    ).toBe(100);
    expect(
      mechRating(mech("m", 50), FLAT_RATER(100), { damagePenalty: 1 }),
    ).toBe(50);
    expect(
      mechRating(mech("m", 100), FLAT_RATER(100), { damagePenalty: 1 }),
    ).toBe(0);
    expect(
      mechRating(mech("m", 50), FLAT_RATER(100), { damagePenalty: 0.5 }),
    ).toBe(75);
    expect(
      mechRating(mech("m", 50), FLAT_RATER(100), { damagePenalty: 0 }),
    ).toBe(100);
  });
});

describe("computeForceRating", () => {
  const state: MissionResolutionState = {
    squads: [squad("s1", 5), squad("s2", 3, "rocket"), squad("s3", 5)],
    mechs: [mech("m1", 0), mech("m2", 50)],
    city: CITY,
  };
  const deps = {
    squadTypes: SQUAD_TYPES_CATALOGUE,
    mechRater: FLAT_RATER(100),
    tuning: { damagePenalty: 1 },
  };

  it("sums only the deployed units", () => {
    const rocket =
      SQUAD_TYPES.find((t) => t.id === "rocket")?.combatRating ?? 0;
    const rifle = RIFLE?.combatRating ?? 0;
    const force = computeForceRating(
      { missionId: "m", squadIds: ["s1", "s2"], mechIds: ["m2"] },
      state,
      deps,
    );
    expect(force).toBeCloseTo(rifle + rocket * 0.6 + 50);
  });

  it("is zero for an empty deployment", () => {
    expect(
      computeForceRating(
        { missionId: "m", squadIds: [], mechIds: [] },
        state,
        deps,
      ),
    ).toBe(0);
  });

  it("throws when the deployment names units that are not in the state", () => {
    expect(() =>
      computeForceRating(
        { missionId: "m", squadIds: ["ghost"], mechIds: [] },
        state,
        deps,
      ),
    ).toThrow(/unknown squad "ghost"/);
    expect(() =>
      computeForceRating(
        { missionId: "m", squadIds: [], mechIds: ["ghost"] },
        state,
        deps,
      ),
    ).toThrow(/unknown mech "ghost"/);
  });
});
