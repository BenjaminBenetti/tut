import { describe, expect, it } from "vitest";

import type { CasualtyReport } from "../model/casualty-report";
import type { Mech } from "../model/mech";
import { MECH_MAX_DAMAGE } from "../model/mech";
import type { MechLoadout } from "../model/mech-loadout";
import {
  MECH_DESTROYED,
  SQUAD_WIPED,
  UNIT_DAMAGED,
} from "../model/roster-event";
import type { RosterState } from "../model/roster-state";
import type { RosterTuning } from "../model/roster-tuning";
import type { Squad } from "../model/squad";
import { applyCasualties } from "./roster-casualty-service";

// ===========================================
// Fixtures
// ===========================================

const DAY = 12;
const TUNING: RosterTuning = {
  repairCostPerPoint: 10,
  xpPerMissionSurvived: 10,
};

const LOADOUT: MechLoadout = {
  name: "L",
  chassisId: "c",
  legsId: "l",
  armsId: "a",
  armWeaponId: "aw",
  backWeaponId: "bw",
  utilityIds: [],
};

/** A squad with the given id and strength and a small history. */
function squad(id: string, strength: number): Squad {
  return {
    id,
    name: id.toUpperCase(),
    typeId: "rifle",
    strength,
    maxStrength: 5,
    kills: 1,
    missionsSurvived: 2,
    xp: 30,
  };
}

/** A mech with the given id and damage and a small history. */
function mech(id: string, damage: number): Mech {
  return {
    id,
    name: id.toUpperCase(),
    loadout: LOADOUT,
    damage,
    kills: 4,
    missionsSurvived: 3,
    xp: 50,
  };
}

const ROSTER: RosterState = {
  squads: [squad("s1", 5), squad("s2", 3), squad("s3", 5)],
  mechs: [mech("m1", 0), mech("m2", 60), mech("m3", 10)],
  savedLoadouts: [LOADOUT],
  graveyard: [{ kind: "squad", name: "OLD", day: 2, missionId: "mission-0" }],
};

/** An empty report for the given deployment; fields override. */
function report(overrides: Partial<CasualtyReport>): CasualtyReport {
  return {
    missionId: "mission-7",
    squadCasualties: [],
    squadsWiped: [],
    mechsDestroyed: [],
    mechDamage: [],
    deployedSquadIds: [],
    deployedMechIds: [],
    ...overrides,
  };
}

// ===========================================
// Tests
// ===========================================

describe("applyCasualties", () => {
  it("leaves units that did not deploy untouched and emits nothing", () => {
    const snapshot = JSON.parse(JSON.stringify(ROSTER)) as RosterState;
    const { roster, events } = applyCasualties(
      ROSTER,
      report({ deployedSquadIds: ["s1"], deployedMechIds: ["m1"] }),
      DAY,
      TUNING,
    );
    expect(roster.squads[1]).toBe(ROSTER.squads[1]);
    expect(roster.squads[2]).toBe(ROSTER.squads[2]);
    expect(roster.mechs[1]).toBe(ROSTER.mechs[1]);
    expect(roster.graveyard).toEqual(ROSTER.graveyard);
    expect(events).toEqual([]);
    expect(ROSTER).toEqual(snapshot);
  });

  it("credits unhurt survivors with the mission and xp but no damage event", () => {
    const { roster, events } = applyCasualties(
      ROSTER,
      report({ deployedSquadIds: ["s1"], deployedMechIds: ["m1"] }),
      DAY,
      TUNING,
    );
    expect(roster.squads[0]).toEqual({
      ...squad("s1", 5),
      missionsSurvived: 3,
      xp: 40,
    });
    expect(roster.mechs[0]).toEqual({
      ...mech("m1", 0),
      missionsSurvived: 4,
      xp: 60,
    });
    expect(events).toEqual([]);
  });

  it("applies partial losses and damage with kills, emitting UnitDamaged", () => {
    const { roster, events } = applyCasualties(
      ROSTER,
      report({
        squadCasualties: [{ squadId: "s2", losses: 2, kills: 3 }],
        mechDamage: [{ mechId: "m3", damage: 25, kills: 2 }],
        deployedSquadIds: ["s2"],
        deployedMechIds: ["m3"],
      }),
      DAY,
      TUNING,
    );
    expect(roster.squads[1]).toEqual({
      ...squad("s2", 1),
      kills: 4,
      missionsSurvived: 3,
      xp: 40,
    });
    expect(roster.mechs[2]).toEqual({
      ...mech("m3", 35),
      kills: 6,
      missionsSurvived: 4,
      xp: 60,
    });
    expect(events).toEqual([
      {
        type: UNIT_DAMAGED,
        payload: { kind: "squad", unitId: "s2", from: 3, to: 1 },
      },
      {
        type: UNIT_DAMAGED,
        payload: { kind: "mech", unitId: "m3", from: 10, to: 35 },
      },
    ]);
  });

  it("removes wiped squads and destroyed mechs and buries them in order", () => {
    const { roster, events } = applyCasualties(
      ROSTER,
      report({
        squadCasualties: [{ squadId: "s2", losses: 3 }],
        squadsWiped: ["s2"],
        mechDamage: [{ mechId: "m2", damage: 40 }],
        mechsDestroyed: ["m2"],
        deployedSquadIds: ["s2"],
        deployedMechIds: ["m2"],
      }),
      DAY,
      TUNING,
    );
    expect(roster.squads.map((s) => s.id)).toEqual(["s1", "s3"]);
    expect(roster.mechs.map((m) => m.id)).toEqual(["m1", "m3"]);
    expect(roster.graveyard).toEqual([
      ...ROSTER.graveyard,
      { kind: "squad", name: "S2", day: DAY, missionId: "mission-7" },
      { kind: "mech", name: "M2", day: DAY, missionId: "mission-7" },
    ]);
    expect(events).toEqual([
      {
        type: SQUAD_WIPED,
        payload: { squad: ROSTER.squads[1], grave: roster.graveyard[1] },
      },
      {
        type: MECH_DESTROYED,
        payload: { mech: ROSTER.mechs[1], grave: roster.graveyard[2] },
      },
    ]);
    expect(roster.savedLoadouts).toBe(ROSTER.savedLoadouts);
  });

  it("treats losses reaching zero or damage reaching the maximum as permadeath even when the summary lists omit them", () => {
    const { roster } = applyCasualties(
      ROSTER,
      report({
        squadCasualties: [{ squadId: "s1", losses: 5 }],
        mechDamage: [{ mechId: "m2", damage: MECH_MAX_DAMAGE - 60 }],
        deployedSquadIds: ["s1"],
        deployedMechIds: ["m2"],
      }),
      DAY,
      TUNING,
    );
    expect(roster.squads.map((s) => s.id)).toEqual(["s2", "s3"]);
    expect(roster.mechs.map((m) => m.id)).toEqual(["m1", "m3"]);
    expect(roster.graveyard).toHaveLength(3);
  });

  it("honours the summary lists even when the report understates the loss", () => {
    const { roster } = applyCasualties(
      ROSTER,
      report({
        squadCasualties: [{ squadId: "s3", losses: 1 }],
        squadsWiped: ["s3"],
        mechsDestroyed: ["m1"],
        deployedSquadIds: ["s3"],
        deployedMechIds: ["m1"],
      }),
      DAY,
      TUNING,
    );
    expect(roster.squads.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(roster.mechs.map((m) => m.id)).toEqual(["m2", "m3"]);
  });

  it("clamps losses to the squad's strength and damage to the maximum", () => {
    const { roster } = applyCasualties(
      ROSTER,
      report({
        squadCasualties: [{ squadId: "s2", losses: 99 }],
        mechDamage: [{ mechId: "m2", damage: 999 }],
        deployedSquadIds: ["s2"],
        deployedMechIds: ["m2"],
      }),
      DAY,
      TUNING,
    );
    expect(roster.squads.some((s) => s.id === "s2")).toBe(false);
    expect(roster.mechs.some((m) => m.id === "m2")).toBe(false);
    expect(roster.graveyard).toHaveLength(3);
  });

  it("ignores negative reports and ids the roster does not hold", () => {
    const { roster, events } = applyCasualties(
      ROSTER,
      report({
        squadCasualties: [
          { squadId: "s1", losses: -2 },
          { squadId: "ghost", losses: 5 },
        ],
        squadsWiped: ["ghost"],
        mechDamage: [{ mechId: "phantom", damage: 100 }],
        mechsDestroyed: ["phantom"],
        deployedSquadIds: ["s1", "ghost"],
        deployedMechIds: ["phantom"],
      }),
      DAY,
      TUNING,
    );
    expect(roster.squads[0]?.strength).toBe(5);
    expect(roster.squads).toHaveLength(3);
    expect(roster.mechs).toHaveLength(3);
    expect(roster.graveyard).toEqual(ROSTER.graveyard);
    expect(events).toEqual([]);
  });
});
