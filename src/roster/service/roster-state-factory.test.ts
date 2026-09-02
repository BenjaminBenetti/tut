import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { RIFLE_SQUAD, ROCKET_SQUAD } from "../data/squad-types";
import type { MechLoadout } from "../model/mech-loadout";
import type { RosterState } from "../model/roster-state";
import { SQUAD_MAX_STRENGTH } from "../model/squad";
import type { StarterRosterSpec } from "../model/starter-roster-spec";
import { DataSquadTypeCatalogue } from "../repository/squad-type-catalogue";
import { createInitialRosterState } from "./roster-state-factory";

const LOADOUT: MechLoadout = {
  name: "Test",
  chassisId: "chassis-vanguard",
  legsId: "legs-strider",
  armsId: "arms-manipulator",
  armWeaponId: "arm-weapon-autocannon",
  backWeaponId: "back-weapon-missile-pod",
  utilityIds: [],
};

const SPEC: StarterRosterSpec = {
  squads: [
    { typeId: "rifle", name: "Alpha" },
    { typeId: "rocket", name: "Bravo" },
  ],
  mechs: [
    { name: "One", loadout: LOADOUT },
    { name: "Two", loadout: LOADOUT },
  ],
};

/** Fresh generator and catalogue per test so ids never leak. */
function setup(): {
  ids: SequentialIdGenerator;
  deps: Parameters<typeof createInitialRosterState>[1];
} {
  const ids = new SequentialIdGenerator();
  return {
    ids,
    deps: {
      ids,
      squadTypes: new DataSquadTypeCatalogue([RIFLE_SQUAD, ROCKET_SQUAD]),
    },
  };
}

describe("createInitialRosterState", () => {
  it("creates squads then mechs with sequential ids in spec order", () => {
    const { deps } = setup();
    const roster = createInitialRosterState(SPEC, deps);

    expect(roster.squads.map((squad) => squad.id)).toEqual([
      "squad-1",
      "squad-2",
    ]);
    expect(roster.squads.map((squad) => squad.typeId)).toEqual([
      "rifle",
      "rocket",
    ]);
    expect(roster.squads.map((squad) => squad.name)).toEqual([
      "Alpha",
      "Bravo",
    ]);
    for (const squad of roster.squads) {
      expect(squad.strength).toBe(SQUAD_MAX_STRENGTH);
    }
    expect(roster.mechs.map((mech) => mech.id)).toEqual(["mech-1", "mech-2"]);
    expect(roster.mechs.map((mech) => mech.name)).toEqual(["One", "Two"]);
    for (const mech of roster.mechs) {
      expect(mech.damage).toBe(0);
    }
  });

  it("saves each distinct loadout name once and gives mechs their own copies", () => {
    const { deps } = setup();
    const roster = createInitialRosterState(SPEC, deps);

    expect(roster.savedLoadouts).toEqual([LOADOUT]);
    expect(roster.mechs[0]?.loadout).toEqual(LOADOUT);
    expect(roster.mechs[0]?.loadout).not.toBe(LOADOUT);
  });

  it("leaves the id generator at the next free ids", () => {
    const { deps, ids } = setup();
    createInitialRosterState(SPEC, deps);
    expect(ids.getState()).toEqual({ counters: { squad: 3, mech: 3 } });
  });

  it("builds an empty roster from an empty spec without consuming ids", () => {
    const { deps, ids } = setup();
    expect(createInitialRosterState({ squads: [], mechs: [] }, deps)).toEqual({
      squads: [],
      mechs: [],
      savedLoadouts: [],
    });
    expect(ids.getState()).toEqual({ counters: {} });
  });

  it("treats an unknown squad type as a content bug", () => {
    const { deps } = setup();
    const spec: StarterRosterSpec = {
      squads: [{ typeId: "cavalry", name: "Charlie" }],
      mechs: [],
    };
    expect(() => createInitialRosterState(spec, deps)).toThrow(/cavalry/);
  });

  it("round-trips through JSON unchanged", () => {
    const { deps } = setup();
    const roster = createInitialRosterState(SPEC, deps);
    expect(JSON.parse(JSON.stringify(roster)) as RosterState).toEqual(roster);
  });
});
