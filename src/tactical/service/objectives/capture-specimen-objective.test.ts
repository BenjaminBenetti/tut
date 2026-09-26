import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../../data/combat-tuning";
import { CAPTURE_NET, EQUIPMENT } from "../../data/equipment";
import { OBJECTIVE_TUNING } from "../../data/objective-tuning";
import { attack } from "../../model/attack-command";
import type { CarriedSpecimen } from "../../model/carried-specimen";
import { canCarrySpecimen } from "../../model/carried-specimen";
import { CIVILIANS_EXTRACTED } from "../../model/civilians-extracted-event";
import { extract } from "../../model/extract-command";
import { interact } from "../../model/interact-command";
import { MISSION_ENDED } from "../../model/mission-ended-event";
import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import { SPECIMEN_PICKED_UP } from "../../model/specimen-picked-up-event";
import type {
  CaptureSpecimenObjective,
  RescueCiviliansObjective,
  TacticalState,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { UNIT_DIED } from "../../model/unit-died-event";
import { UNIT_EXTRACTED } from "../../model/unit-extracted-event";
import { createEquipmentCatalogue } from "../../repository/equipment-catalogue";
import { createAttackHandler } from "../combat-service";
import {
  createExtractHandler,
  createInteractHandler,
} from "../objective-service";
import {
  droppedSpecimens,
  pickUpSpecimen,
  specimenCarriers,
} from "../specimen-service";
import {
  ctxWith,
  FIXTURE_TEMPLATES,
  fixtureAttackDeps,
  missionWith,
  openField,
  riggedRng,
  unitAt,
  withCivilian,
} from "../tactical-fixtures.test-helper";
import { withVision } from "../vision-service";
import {
  addCaptureObjective,
  captureStatus,
  createCaptureSpecimenObjective,
  createCaptureStep,
} from "./capture-specimen-objective";
import { objectiveComplete, objectiveFailed } from "./objective-status";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });
const NETS = createEquipmentCatalogue(EQUIPMENT);
const RULES = createCaptureSpecimenObjective(NETS);
const STEP = createCaptureStep(NETS);
const interactHandler = createInteractHandler(OBJECTIVE_TUNING);
const extractHandler = createExtractHandler(OBJECTIVE_TUNING);
const attackHandler = createAttackHandler(COMBAT_TUNING, fixtureAttackDeps());

const WANT_LURKER: CaptureSpecimenObjective = {
  id: "objective-1",
  kind: "capture-specimen",
  species: "lurker",
  complete: false,
  failed: false,
};

const LURKER: CarriedSpecimen = {
  unitId: "lurker-1",
  species: "lurker",
  templateId: FIXTURE_TEMPLATES.bug,
  movePenalty: 1,
};

/** A squad carrying the lurker. */
function carrier(id: string, pos: TileCoord, hp = 10): Unit {
  return { ...unitAt(id, "infantry", pos, { hp }), carrying: LURKER };
}

/**
 * The open field with the units and Live Specimen's capture, sight
 * taken, the extraction zone on (0,0) and the fixture squads carrying a
 * capture net when `nets` says so.
 */
function field(
  units: readonly Unit[],
  options: { nets?: boolean; phase?: TacticalState["phase"] } = {},
): TacticalState {
  const base = missionWith(openField().build(), units, {
    objectives: [WANT_LURKER],
    phase: options.phase ?? "player",
  });
  const mission: TacticalState = {
    ...base,
    extraction: [at(0, 0)],
    templates:
      options.nets === true
        ? {
            ...base.templates,
            [FIXTURE_TEMPLATES.infantry]: {
              ...base.templates[FIXTURE_TEMPLATES.infantry]!,
              equipment: [CAPTURE_NET.id],
            },
          }
        : base.templates,
  };
  return withVision({ state: mission, events: [] }).state;
}

/** The mission's only capture objective as it now stands. */
function capture(mission: TacticalState): CaptureSpecimenObjective {
  const objective = mission.objectives.find(
    (o) => o.kind === "capture-specimen",
  );
  if (objective?.kind !== "capture-specimen") throw new Error("no capture");
  return objective;
}

// ===========================================
// Setup
// ===========================================

describe("addCaptureObjective (#1179)", () => {
  it("appends an open capture of the species, named like any other objective", () => {
    const base = missionWith(openField().build(), []);
    const ids = new SequentialIdGenerator();
    const state = addCaptureObjective(base, "lurker", { ids });
    expect(state.objectives).toEqual([
      {
        id: "objective-1",
        kind: "capture-specimen",
        species: "lurker",
        complete: false,
        failed: false,
      },
    ]);
    expect(base.objectives).toEqual([]);
  });
});

// ===========================================
// Dropping and picking up
// ===========================================

describe("a carrier that falls (#1179)", () => {
  /** A bug beside a one-hit-point carrier, in the bugs' phase, and a second squad two tiles off. */
  function ambush(): TacticalState {
    return field(
      [
        carrier("carrier", at(3, 3), 1),
        unitAt("second", "infantry", at(3, 5)),
        unitAt("bug", "infantry", at(4, 3), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
  }

  it("drops the specimen on its tile, where the log and the tracker find it", () => {
    const result = attackHandler(
      ambush(),
      attack("bug", "carrier"),
      ctxWith(riggedRng(true, "high")),
    );
    if (!result.ok) throw new Error(result.error.kind);
    const after = result.value.state;
    const died = result.value.events.find((e) => e.type === UNIT_DIED);
    expect(died?.payload).toMatchObject({ unitId: "carrier", dropped: LURKER });
    expect(specimenCarriers(after, "lurker")).toEqual([]);
    expect(droppedSpecimens(after, "lurker")).toEqual([
      { carrierId: "carrier", pos: at(3, 3), specimen: LURKER },
    ]);
    // Another squad has free hands, so the capture is still open.
    expect(captureStatus(capture(after), after, NETS)).toBe("open");
    expect(RULES.reachable?.(capture(after), after)).toEqual({
      id: "carrier",
      pos: at(3, 3),
    });
    expect(RULES.marker?.(capture(after), after)).toEqual(at(3, 3));
  });

  it("lets another squad pick it up with Interact from beside it, and not from further off", () => {
    const fallen: TacticalState = {
      ...field([
        { ...carrier("carrier", at(3, 3)), hp: 0 },
        unitAt("second", "infantry", at(3, 5)),
      ]),
    };
    const tooFar = interactHandler(
      fallen,
      interact("second", "objective-1"),
      ctxWith(riggedRng(true)),
    );
    expect(tooFar.ok).toBe(false);
    if (tooFar.ok) return;
    expect(tooFar.error).toEqual({
      kind: "objective-out-of-reach",
      objectiveId: "objective-1",
      distance: 2,
      range: 1,
    });

    const beside: TacticalState = {
      ...fallen,
      units: fallen.units.map((u) =>
        u.id === "second" ? { ...u, pos: at(3, 4) } : u,
      ),
    };
    const picked = interactHandler(
      beside,
      interact("second", "objective-1"),
      ctxWith(riggedRng(true)),
    );
    if (!picked.ok) throw new Error(picked.error.kind);
    const after = picked.value.state;
    const second = after.units.find((u) => u.id === "second")!;
    expect(second.carrying).toEqual(LURKER);
    expect(second.ap).toBe(1);
    expect(
      after.units.find((u) => u.id === "carrier")?.carrying,
    ).toBeUndefined();
    expect(droppedSpecimens(after)).toEqual([]);
    expect(picked.value.events).toEqual([
      {
        type: SPECIMEN_PICKED_UP,
        payload: {
          unitId: "second",
          fromUnitId: "carrier",
          specimen: LURKER,
          pos: at(3, 3),
        },
      },
    ]);
  });

  it("refuses a pick-up by a squad whose hands are full", () => {
    const mission = field([
      { ...carrier("carrier", at(3, 3)), hp: 0 },
      carrier("second", at(3, 4)),
    ]);
    const result = interactHandler(
      mission,
      interact("second", "objective-1"),
      ctxWith(riggedRng(true)),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("already-carrying");
  });
});

// ===========================================
// Home
// ===========================================

describe("extracting the carrier (#1179)", () => {
  it("completes the capture, tallies it and fills the result's specimenCaptured", () => {
    const mission = field([
      carrier("carrier", at(0, 0)),
      unitAt("other", "infantry", at(5, 5)),
    ]);
    expect(objectiveComplete(mission, capture(mission))).toBe(false);
    expect(RULES.resultFields?.(capture(mission), mission)).toEqual({});
    expect(RULES.tally?.(capture(mission), mission)).toEqual({
      done: 0,
      total: 1,
    });

    const result = extractHandler(
      mission,
      extract("carrier"),
      ctxWith(riggedRng(true)),
    );
    if (!result.ok) throw new Error(result.error.kind);
    const after = result.value.state;
    expect(objectiveComplete(after, capture(after))).toBe(true);
    expect(objectiveFailed(after, capture(after))).toBe(false);
    expect(RULES.tally?.(capture(after), after)).toEqual({
      done: 1,
      total: 1,
    });
    expect(RULES.resultFields?.(capture(after), after)).toEqual({
      specimenCaptured: "lurker",
    });

    // Boarding writes it down at once (the rules' onExtracted), and the
    // log hears of it right after the unit's own line; the phase step
    // then has nothing left to say.
    expect(capture(after).complete).toBe(true);
    expect(result.value.events.map((event) => event.type)).toEqual([
      UNIT_EXTRACTED,
      OBJECTIVE_UPDATED,
    ]);
    expect(result.value.events[1]).toEqual({
      type: OBJECTIVE_UPDATED,
      payload: { objectiveId: "objective-1", complete: true, failed: false },
    });
    expect(STEP(after, ctxWith(riggedRng(true))).events).toEqual([]);

    // The last squad out ends the mission won.
    const last = extractHandler(
      {
        ...after,
        units: after.units.map((u) =>
          u.id === "other" ? { ...u, pos: at(0, 0) } : u,
        ),
      },
      extract("other"),
      ctxWith(riggedRng(true)),
    );
    if (!last.ok) throw new Error(last.error.kind);
    expect(last.value.state.outcome).toBe("won");
    expect(last.value.events.map((e) => e.type)).toContain(MISSION_ENDED);
  });

  it("does not complete when a squad extracts empty-handed", () => {
    const mission = field([
      unitAt("empty", "infantry", at(0, 0)),
      unitAt("other", "infantry", at(5, 5)),
    ]);
    const result = extractHandler(
      mission,
      extract("empty"),
      ctxWith(riggedRng(true)),
    );
    if (!result.ok) throw new Error(result.error.kind);
    expect(objectiveComplete(result.value.state, WANT_LURKER)).toBe(false);
    expect(capture(result.value.state)).toBe(WANT_LURKER);
    expect(result.value.events.map((event) => event.type)).toEqual([
      UNIT_EXTRACTED,
    ]);
  });

  it("hears nothing of a civilian group boarding beside a rescue, and the rescue hears nothing of the carrier", () => {
    const rescue: RescueCiviliansObjective = {
      id: "objective-2",
      kind: "rescue-civilians",
      groupIds: ["civ"],
      complete: false,
      failed: false,
    };
    const base = field([
      carrier("carrier", at(0, 0)),
      unitAt("other", "infantry", at(5, 5)),
    ]);
    const mission = withCivilian(
      { ...base, objectives: [WANT_LURKER, rescue] },
      "civ",
      at(0, 0),
      { trapped: false },
    );

    const group = extractHandler(
      mission,
      extract("civ"),
      ctxWith(riggedRng(true)),
    );
    if (!group.ok) throw new Error(group.error.kind);
    expect(capture(group.value.state)).toBe(WANT_LURKER);
    expect(group.value.events.map((event) => event.type)).toEqual([
      UNIT_EXTRACTED,
      CIVILIANS_EXTRACTED,
      OBJECTIVE_UPDATED,
    ]);
    expect(group.value.events[2]?.payload).toMatchObject({
      objectiveId: "objective-2",
      complete: true,
    });

    const home = extractHandler(
      group.value.state,
      extract("carrier"),
      ctxWith(riggedRng(true)),
    );
    if (!home.ok) throw new Error(home.error.kind);
    expect(home.value.events.map((event) => event.type)).toEqual([
      UNIT_EXTRACTED,
      OBJECTIVE_UPDATED,
    ]);
    expect(home.value.events[1]?.payload).toMatchObject({
      objectiveId: "objective-1",
      complete: true,
    });
  });
});

// ===========================================
// Failure
// ===========================================

describe("a capture out of reach (#1179)", () => {
  it("stays open while a free-handed squad has a net left, and fails once none can bring one home", () => {
    const armed = field([unitAt("squad", "infantry", at(3, 3))], {
      nets: true,
    });
    expect(captureStatus(WANT_LURKER, armed, NETS)).toBe("open");

    const spent: TacticalState = {
      ...armed,
      units: armed.units.map((u) => ({
        ...u,
        equipment: { [CAPTURE_NET.id]: 0 },
      })),
    };
    expect(captureStatus(WANT_LURKER, spent, NETS)).toBe("failed");
    expect(objectiveFailed(spent, WANT_LURKER)).toBe(true);
    const stepped = STEP(spent, ctxWith(riggedRng(true)));
    expect(capture(stepped.state)).toMatchObject({
      complete: false,
      failed: true,
    });

    // No nets at all: failed from the start.
    const bare = field([unitAt("squad", "infantry", at(3, 3))]);
    expect(captureStatus(WANT_LURKER, bare, NETS)).toBe("failed");
  });

  it("stays open while someone carries one, or one lies dropped with a free squad to fetch it", () => {
    const carried = field([carrier("carrier", at(3, 3))]);
    expect(captureStatus(WANT_LURKER, carried, NETS)).toBe("open");
    const dropped = field([
      { ...carrier("carrier", at(3, 3)), hp: 0 },
      unitAt("second", "infantry", at(6, 6)),
    ]);
    expect(captureStatus(WANT_LURKER, dropped, NETS)).toBe("open");
    const nobody = field([{ ...carrier("carrier", at(3, 3)), hp: 0 }]);
    expect(captureStatus(WANT_LURKER, nobody, NETS)).toBe("failed");
  });

  it("changes nothing on a mission without a capture", () => {
    const plain = missionWith(openField().build(), [
      unitAt("squad", "infantry", at(3, 3)),
    ]);
    const stepped = STEP(plain, ctxWith(riggedRng(true)));
    expect(stepped.state).toBe(plain);
    expect(stepped.events).toEqual([]);
  });
});

// ===========================================
// Civilian groups (campaign arc §6.4)
// ===========================================

describe("civilian groups and the specimen (#1179, campaign arc §6.4)", () => {
  it("never lets a group carry: it is no free pair of hands, and it cannot pick one up", () => {
    expect(canCarrySpecimen({ kind: "civilian" })).toBe(false);
    // A dropped lurker, and nobody left to fetch it but a freed group
    // standing right beside it.
    const mission = withCivilian(
      field([{ ...carrier("carrier", at(3, 3)), hp: 0 }]),
      "civ",
      at(3, 4),
      { trapped: false },
    );
    expect(captureStatus(WANT_LURKER, mission, NETS)).toBe("failed");

    const group = mission.units.find((unit) => unit.id === "civ")!;
    const picked = pickUpSpecimen(
      mission,
      group,
      "lurker",
      OBJECTIVE_TUNING.interactRange,
      WANT_LURKER.id,
    );
    expect(picked.ok).toBe(false);
    if (picked.ok) return;
    expect(picked.error.kind).toBe("cannot-carry");

    // Nor through Interact: only the force works objectives.
    const worked = interactHandler(
      mission,
      interact("civ", WANT_LURKER.id),
      ctxWith(riggedRng(true)),
    );
    expect(worked.ok).toBe(false);
    if (worked.ok) return;
    expect(worked.error.kind).toBe("cannot-interact");
  });
});
