import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { STARTER_LOADOUT } from "../../../roster/data/starter-roster";
import { OBJECTIVE_TUNING } from "../../data/objective-tuning";
import { extract } from "../../model/extract-command";
import { interact } from "../../model/interact-command";
import type { MechWreck } from "../../model/mech-wreck";
import { MISSION_ENDED } from "../../model/mission-ended-event";
import type { TacticalOutcome } from "../../model/tactical-handler";
import type {
  RescueCiviliansObjective,
  StripWreckObjective,
  TacticalState,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { WRECK_WORKED } from "../../model/wreck-worked-event";
import { objectivesComplete } from "../mission-end-service";
import {
  createExtractHandler,
  createInteractHandler,
  DEFAULT_OBJECTIVE_INTERACTIONS,
  reachableObjectives,
} from "../objective-service";
import {
  ctxWith,
  missionWith,
  openField,
  riggedRng,
  unitAt,
  withCivilian,
} from "../tactical-fixtures.test-helper";
import { OBJECTIVE_RULES } from "./objective-rules";
import {
  objectiveComplete,
  objectiveFailed,
  objectiveResultFields,
  objectiveResults,
} from "./objective-status";
import {
  STRIP_WRECK_OBJECTIVE,
  stripProgress,
  workWreck,
} from "./strip-wreck-objective";

// ===========================================
// Fixtures
// ===========================================

const TUNING = OBJECTIVE_TUNING;
const CTX = ctxWith(riggedRng(true));
const MAP = openField().build();
const interactWith = createInteractHandler(TUNING);
const extractWith = createExtractHandler(TUNING);

/** Ground tile (x, z). */
function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

/**
 * The wreck across x 4–6, z 4–6, its middle at (5, 5).
 *
 * ```
 *   z 7  . . . . . . . .
 *   z 6  . . . . W W W .
 *   z 5  E . . s W W W .     s squad at (3, 5): one tile off (4, 5)
 *   z 4  . . . m W W W .     m mech at (3, 4)
 *        0 1 2 3 4 5 6 7     E extraction at (0, 5)
 * ```
 */
const WRECK: MechWreck = {
  id: "wreck-1",
  pos: at(5, 5),
  tiles: [4, 5, 6].flatMap((z) => [4, 5, 6].map((x) => at(x, z))),
  mechName: "Hammerhead",
  loadout: STARTER_LOADOUT,
};

const OBJECTIVE: StripWreckObjective = {
  id: "objective-1",
  kind: "strip-wreck",
  targetId: WRECK.id,
  turnsNeeded: 2,
  turnsWorked: 0,
  workedBy: [],
  complete: false,
};

/** The squad beside the wreck, the mech beside it too, the extraction in the west. */
function beside(
  units: readonly Unit[] = [
    unitAt("s", "infantry", at(3, 5)),
    unitAt("m", "mech", at(3, 4)),
  ],
  objective: StripWreckObjective = OBJECTIVE,
): TacticalState {
  return {
    ...missionWith(MAP, units, { objectives: [objective] }),
    wrecks: [WRECK],
    extraction: [at(0, 5)],
  };
}

/** The value of an accepted command, failing the test on a refusal. */
function accepted(outcome: TacticalOutcome): {
  readonly state: TacticalState;
  readonly events: readonly { readonly type: string }[];
} {
  if (!outcome.ok) {
    throw new Error(`refused: ${outcome.error.kind}`);
  }
  return outcome.value;
}

/** The refusal's kind, failing the test when the command was accepted. */
function refusal(outcome: TacticalOutcome): string {
  if (outcome.ok) {
    throw new Error("accepted");
  }
  return outcome.error.kind;
}

/** The mission on the next player turn with everyone's actions back. */
function nextTurn(mission: TacticalState): TacticalState {
  return {
    ...mission,
    turn: mission.turn + 1,
    units: mission.units.map((unit) => ({ ...unit, ap: unit.maxAp })),
  };
}

/** The strip objective of the mission. */
function strip(mission: TacticalState): StripWreckObjective {
  const objective = mission.objectives[0];
  if (objective?.kind !== "strip-wreck") {
    throw new Error("fixture lost its strip objective");
  }
  return objective;
}

/** The fixture mission stripped over two turns by the squad `s`. */
function strippedBySquad(): TacticalState {
  const first = accepted(
    interactWith(beside(), interact("s", OBJECTIVE.id), CTX),
  );
  return accepted(
    interactWith(nextTurn(first.state), interact("s", OBJECTIVE.id), CTX),
  ).state;
}

/** The squad walked onto the extraction tile. */
function onExtraction(mission: TacticalState, unitId: string): TacticalState {
  return {
    ...mission,
    units: mission.units.map((unit) =>
      unit.id === unitId ? { ...unit, pos: at(0, 5) } : unit,
    ),
  };
}

// ===========================================
// The table
// ===========================================

describe("STRIP_WRECK_OBJECTIVE", () => {
  it("is the table's rule for strip-wreck, and Interact dispatches to it", () => {
    expect(OBJECTIVE_RULES["strip-wreck"]).toBe(STRIP_WRECK_OBJECTIVE);
    expect(DEFAULT_OBJECTIVE_INTERACTIONS["strip-wreck"]).toBe(workWreck);
  });
});

// ===========================================
// Working the wreck
// ===========================================

describe("workWreck through Interact", () => {
  it("takes two turns: one turn's work a turn, then the parts are loose", () => {
    const first = accepted(
      interactWith(beside(), interact("s", OBJECTIVE.id), CTX),
    );
    expect(strip(first.state)).toMatchObject({
      turnsWorked: 1,
      lastWorkedTurn: 1,
      workedBy: ["s"],
    });
    expect(first.events).toEqual([
      {
        type: WRECK_WORKED,
        payload: {
          unitId: "s",
          wreckId: WRECK.id,
          objectiveId: OBJECTIVE.id,
          turnsWorked: 1,
          turnsNeeded: 2,
        },
      },
    ]);
    // The squad pays the interact action, as for any objective.
    expect(first.state.units.find((u) => u.id === "s")?.ap).toBe(
      2 - TUNING.interactApCost,
    );
    expect(stripProgress(strip(first.state), first.state).status).toBe("open");

    // The same turn again: refused, whatever points are left.
    expect(
      refusal(interactWith(first.state, interact("s", OBJECTIVE.id), CTX)),
    ).toBe("objective-worked-this-turn");

    const second = accepted(
      interactWith(nextTurn(first.state), interact("s", OBJECTIVE.id), CTX),
    );
    expect(strip(second.state)).toMatchObject({
      turnsWorked: 2,
      lastWorkedTurn: 2,
      workedBy: ["s"],
    });
    expect(stripProgress(strip(second.state), second.state)).toEqual({
      status: "stripped",
      turnsWorked: 2,
      turnsNeeded: 2,
    });
    // Nothing more to work: the parts only need carrying out.
    expect(
      refusal(
        interactWith(nextTurn(second.state), interact("s", OBJECTIVE.id), CTX),
      ),
    ).toBe("wreck-stripped");
  });

  it("works once a turn however many squads stand by, and two squads may share it", () => {
    const two = beside([
      unitAt("s", "infantry", at(3, 5)),
      unitAt("t", "infantry", at(5, 3)),
    ]);
    const first = accepted(interactWith(two, interact("s", OBJECTIVE.id), CTX));
    expect(
      refusal(interactWith(first.state, interact("t", OBJECTIVE.id), CTX)),
    ).toBe("objective-worked-this-turn");
    const second = accepted(
      interactWith(nextTurn(first.state), interact("t", OBJECTIVE.id), CTX),
    );
    expect(strip(second.state)).toMatchObject({
      turnsWorked: 2,
      workedBy: ["s", "t"],
    });
  });

  it("is infantry work: a mech beside the wreck is refused and never offered it", () => {
    expect(
      refusal(interactWith(beside(), interact("m", OBJECTIVE.id), CTX)),
    ).toBe("not-a-squad");
    expect(reachableObjectives(beside(), "m", TUNING)).toEqual([]);
  });

  it("reaches from beside any wreck tile, measured to the nearest one", () => {
    const offered = reachableObjectives(beside(), "s", TUNING);
    expect(offered).toHaveLength(1);
    expect(offered[0]?.target).toEqual({ id: WRECK.id, pos: at(4, 5) });
    expect(offered[0]?.distance).toBe(1);

    const far = beside([unitAt("s", "infantry", at(1, 5))]);
    expect(reachableObjectives(far, "s", TUNING)).toEqual([]);
    expect(refusal(interactWith(far, interact("s", OBJECTIVE.id), CTX))).toBe(
      "objective-out-of-reach",
    );
  });

  it("offers what the handler accepts: not again this turn, not once stripped", () => {
    const worked = accepted(
      interactWith(beside(), interact("s", OBJECTIVE.id), CTX),
    ).state;
    expect(reachableObjectives(worked, "s", TUNING)).toEqual([]);
    expect(reachableObjectives(nextTurn(worked), "s", TUNING)).toHaveLength(1);
    expect(
      reachableObjectives(nextTurn(strippedBySquad()), "s", TUNING),
    ).toEqual([]);
  });

  it("refuses a wreck that is not on the map", () => {
    const gone = { ...beside(), wrecks: [] };
    expect(refusal(interactWith(gone, interact("s", OBJECTIVE.id), CTX))).toBe(
      "objective-target-missing",
    );
  });
});

// ===========================================
// Who works the wreck (#1179)
// ===========================================

describe("who strips the wreck (#1179)", () => {
  /** A specimen a squad took alive with the net and is hauling home. */
  const SPECIMEN = {
    unitId: "b9",
    species: "lurker",
    templateId: "swarmer",
    movePenalty: 1,
  } as const;

  /** A trapped group at (2, 5): one tile west of the squad, as the wreck is one east. */
  const RESCUE: RescueCiviliansObjective = {
    id: "objective-r",
    kind: "rescue-civilians",
    groupIds: ["c1"],
    complete: false,
    failed: false,
  };

  /** The unit with that id, failing the test when it is gone. */
  function unitOf(mission: TacticalState, id: string): Unit {
    const unit = mission.units.find((candidate) => candidate.id === id);
    if (unit === undefined) {
      throw new Error(`fixture lost unit ${id}`);
    }
    return unit;
  }

  it("leaves it to the force: a civilian group beside it neither strips it nor is offered it", () => {
    // A freed group at (3, 6), one tile off the wreck tile (4, 6).
    const mission = withCivilian(beside(), "c", at(3, 6), { trapped: false });
    const group = unitOf(mission, "c");
    expect(
      refusal(interactWith(mission, interact("c", OBJECTIVE.id), CTX)),
    ).toBe("cannot-interact");
    expect(refusal(workWreck(mission, OBJECTIVE, group, TUNING))).toBe(
      "not-a-squad",
    );
    expect(STRIP_WRECK_OBJECTIVE.reachable?.(OBJECTIVE, mission, group)).toBe(
      undefined,
    );
    expect(reachableObjectives(mission, "c", TUNING)).toEqual([]);
  });

  it("is not kept open by a civilian group: with the squads down it fails whoever else stands", () => {
    const mission = withCivilian(
      beside([
        unitAt("s", "infantry", at(3, 5), { hp: 0 }),
        unitAt("m", "mech", at(3, 4)),
      ]),
      "c",
      at(3, 6),
      { trapped: false },
    );
    expect(objectiveFailed(mission, strip(mission))).toBe(true);
  });

  // The ruling (see `workWreck`): the specimen costs the carrier
  // movement, not its hands for work, so it strips like any squad.
  it("lets a squad hauling a netted specimen strip it and bring both home", () => {
    const carrier = {
      ...unitAt("s", "infantry", at(3, 5)),
      carrying: SPECIMEN,
    };
    const first = accepted(
      interactWith(beside([carrier]), interact("s", OBJECTIVE.id), CTX),
    );
    const stripped = accepted(
      interactWith(nextTurn(first.state), interact("s", OBJECTIVE.id), CTX),
    ).state;
    expect(strip(stripped)).toMatchObject({ turnsWorked: 2, workedBy: ["s"] });
    const home = accepted(
      extractWith(onExtraction(stripped, "s"), extract("s"), CTX),
    ).state;
    expect(home.extracted.find((u) => u.id === "s")?.carrying).toEqual(
      SPECIMEN,
    );
    expect(objectiveComplete(home, strip(home))).toBe(true);
  });

  // Beside a trapped group and the wreck at once, each one tile off, the
  // tie goes to the objective the mission lists first — that is the
  // Interact key's — and the other is still offered, and accepted, after.
  it("offers a squad beside both a trapped group and the wreck both, in the mission's objective order", () => {
    const both = (
      objectives: readonly (StripWreckObjective | RescueCiviliansObjective)[],
    ): TacticalState =>
      withCivilian(
        { ...beside([unitAt("s", "infantry", at(3, 5))]), objectives },
        "c1",
        at(2, 5),
      );
    const offered = (mission: TacticalState): readonly string[] =>
      reachableObjectives(mission, "s", TUNING).map(
        (entry) => entry.objective.id,
      );

    const wreckFirst = both([OBJECTIVE, RESCUE]);
    expect(offered(wreckFirst)).toEqual([OBJECTIVE.id, RESCUE.id]);
    expect(offered(both([RESCUE, OBJECTIVE]))).toEqual([
      RESCUE.id,
      OBJECTIVE.id,
    ]);

    const freed = accepted(
      interactWith(wreckFirst, interact("s", RESCUE.id), CTX),
    ).state;
    expect(unitOf(freed, "c1").trapped).toBeUndefined();
    expect(offered(freed)).toEqual([OBJECTIVE.id]);
    expect(
      strip(
        accepted(interactWith(freed, interact("s", OBJECTIVE.id), CTX)).state,
      ).turnsWorked,
    ).toBe(1);
  });
});

// ===========================================
// Completion
// ===========================================

describe("strip-wreck completion", () => {
  it("is not complete once stripped: only when a squad that worked it is aboard", () => {
    const stripped = strippedBySquad();
    expect(objectiveComplete(stripped, strip(stripped))).toBe(false);
    expect(objectivesComplete(stripped)).toBe(false);

    const aboard = accepted(
      extractWith(onExtraction(stripped, "s"), extract("s"), CTX),
    ).state;
    expect(objectiveComplete(aboard, strip(aboard))).toBe(true);
    expect(stripProgress(strip(aboard), aboard).status).toBe("complete");
    // The stored flag never moves; the rule reads the mission.
    expect(strip(aboard).complete).toBe(false);
  });

  it("wins the mission when the carriers are out and the rest follow", () => {
    const stripped = strippedBySquad();
    const squadOut = accepted(
      extractWith(onExtraction(stripped, "s"), extract("s"), CTX),
    ).state;
    expect(squadOut.outcome).toBeUndefined();
    const allOut = accepted(
      extractWith(onExtraction(squadOut, "m"), extract("m"), CTX),
    );
    expect(allOut.state.outcome).toBe("won");
    expect(allOut.events.at(-1)?.type).toBe(MISSION_ENDED);
  });

  it("is not carried out by a unit that never worked it", () => {
    const two = beside([
      unitAt("s", "infantry", at(3, 5)),
      unitAt("t", "infantry", at(0, 5)),
    ]);
    const first = accepted(interactWith(two, interact("s", OBJECTIVE.id), CTX));
    const stripped = accepted(
      interactWith(nextTurn(first.state), interact("s", OBJECTIVE.id), CTX),
    ).state;
    const bystanderOut = accepted(
      extractWith(stripped, extract("t"), CTX),
    ).state;
    expect(objectiveComplete(bystanderOut, strip(bystanderOut))).toBe(false);
  });

  it("extracting before the strip is done brings nothing home", () => {
    const worked = accepted(
      interactWith(
        beside([unitAt("s", "infantry", at(3, 5))]),
        interact("s", OBJECTIVE.id),
        CTX,
      ),
    ).state;
    const out = accepted(
      extractWith(onExtraction(nextTurn(worked), "s"), extract("s"), CTX),
    ).state;
    expect(out.outcome).toBe("extracted");
    expect(objectiveComplete(out, strip(out))).toBe(false);
  });
});

// ===========================================
// Failure
// ===========================================

describe("strip-wreck failure", () => {
  it("fails when the mission is lost", () => {
    const lost: TacticalState = { ...strippedBySquad(), outcome: "lost" };
    expect(objectiveFailed(lost, strip(lost))).toBe(true);
    expect(objectiveComplete(lost, strip(lost))).toBe(false);
  });

  it("fails when every squad is down before the strip is done", () => {
    const mechOnly = beside([
      unitAt("s", "infantry", at(3, 5), { hp: 0 }),
      unitAt("m", "mech", at(3, 4)),
    ]);
    expect(objectiveFailed(mechOnly, strip(mechOnly))).toBe(true);
    expect(objectiveFailed(beside(), OBJECTIVE)).toBe(false);
  });

  it("fails when the squads carrying the parts are down", () => {
    const stripped = strippedBySquad();
    const carriersDown: TacticalState = {
      ...stripped,
      units: stripped.units.map((unit) =>
        unit.id === "s" ? { ...unit, hp: 0 } : unit,
      ),
    };
    expect(objectiveFailed(stripped, strip(stripped))).toBe(false);
    expect(objectiveFailed(carriersDown, strip(carriersDown))).toBe(true);
  });
});

// ===========================================
// Marker, tally and result
// ===========================================

describe("strip-wreck reporting", () => {
  it("blips the wreck's middle until it is stripped, and heads Jev there", () => {
    expect(STRIP_WRECK_OBJECTIVE.marker?.(OBJECTIVE, beside())).toEqual(
      at(5, 5),
    );
    const stripped = strippedBySquad();
    expect(STRIP_WRECK_OBJECTIVE.marker?.(strip(stripped), stripped)).toBe(
      undefined,
    );
    expect(STRIP_WRECK_OBJECTIVE.destination?.(OBJECTIVE, beside())).toEqual({
      position: at(5, 5),
    });
  });

  it("reports turns worked and the wreck line on the mission result", () => {
    const worked = accepted(
      interactWith(beside(), interact("s", OBJECTIVE.id), CTX),
    ).state;
    expect(objectiveResults(worked)).toEqual([
      {
        kind: "strip-wreck",
        complete: false,
        failed: false,
        done: 1,
        total: 2,
      },
    ]);
    expect(objectiveResultFields(worked)).toEqual({
      wreck: { stripped: false, turnsWorked: 1, turnsNeeded: 2 },
    });
    const stripped = strippedBySquad();
    expect(objectiveResultFields(stripped)).toEqual({
      wreck: { stripped: true, turnsWorked: 2, turnsNeeded: 2 },
    });
  });
});
