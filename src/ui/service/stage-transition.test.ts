import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { GameState } from "../../save/model/game-state";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import {
  FIXTURE_TEMPLATES,
  missionWith,
  openField,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { campaignOnDay, missionAt } from "../view/mission-fixtures.test-helper";
import type { MissionPresentationCatalogue } from "../model/mission-presentation";
import { MISSION_PRESENTATION } from "./missions/mission-presentation";
import { STAGE_TRANSITION_NOTE, stageTransitionOf } from "./stage-transition";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The squad template with a three-round magazine and two grenades. */
function armed(template: UnitTemplate | undefined): UnitTemplate {
  if (template === undefined) throw new Error("no fixture template");
  const [weapon] = template.weapons;
  if (weapon === undefined) throw new Error("no fixture weapon");
  return {
    ...template,
    weapons: [{ ...weapon, charges: 3 }],
    equipment: ["grenade"],
  };
}

/** The hull of mission "mission-1", its stage won or not, with `units` and `extracted`. */
function hull(
  outcome: TacticalState["outcome"],
  units: readonly Unit[],
  extracted: readonly Unit[] = [],
): TacticalState {
  const base = missionWith(openField().build(), units, { extracted });
  return {
    ...base,
    missionId: "mission-1",
    templates: {
      ...base.templates,
      [FIXTURE_TEMPLATES.infantry]: armed(
        base.templates[FIXTURE_TEMPLATES.infantry],
      ),
    },
    stage: { index: 0, count: 2, earlier: [] },
    ...(outcome === undefined ? {} : { outcome }),
  };
}

/** A campaign whose board holds "mission-1" as an offer of `typeId`. */
function campaign(
  typeId: "spore-platform" | "infestation-clearance",
): GameState {
  return campaignOnDay(4, [
    { ...missionAt("mission-1", "lagos", 9, 10), typeId },
  ]);
}

/** The starter roster's first squad and mech, which name the fixture units. */
const ROSTER = campaign("spore-platform").roster;
const ALPHA = ROSTER.squads[0];
const HAMMERHEAD = ROSTER.mechs[0];

const SQUAD = {
  ...unitAt("squad-1", "infantry", at(1, 1), { hp: 6 }),
  sourceId: ALPHA?.id ?? "",
  charges: { primary: 1 },
  equipment: { grenade: 0 },
};
const MECH = {
  ...unitAt("mech-1", "mech", at(2, 2)),
  sourceId: HAMMERHEAD?.id ?? "",
};

// ===========================================
// The transition
// ===========================================

describe("stageTransitionOf (#1179)", () => {
  it("says the hull is cleared and lists who boards the core by name, as they left, in the order they left", () => {
    const transition = stageTransitionOf(
      hull("won", [], [MECH, SQUAD]),
      campaign("spore-platform"),
      { missionTypes: MISSION_TYPES },
    );
    expect(transition).toEqual({
      headline: "Hull cleared. The squad boards the core.",
      next: "Next: The core, stage 2 of 2",
      note: STAGE_TRANSITION_NOTE,
      survivors: [
        {
          unitId: "mech-1",
          name: "Hammerhead",
          hp: "10 / 10",
          wounded: false,
          stores: [],
        },
        {
          unitId: "squad-1",
          name: "Alpha",
          hp: "6 / 10",
          wounded: true,
          stores: ["ammo 1 / 3", "Grenade · uses 0 / 2"],
        },
      ],
    });
  });

  it("names nobody who stayed behind or fell, and counts the standing force of a stage won on the spot", () => {
    const fallen = unitAt("squad-2", "infantry", at(3, 3), { hp: 0 });
    const bug = unitAt("bug-1", "infantry", at(4, 4), { team: "bugs" });
    const transition = stageTransitionOf(
      hull("won", [SQUAD, fallen, bug], [MECH]),
      campaign("spore-platform"),
    );
    expect(transition?.survivors.map((row) => row.unitId)).toEqual([
      "mech-1",
      "squad-1",
    ]);
  });

  it("falls back to the stages' names, then their numbers, for a type with no line of its own", () => {
    const quiet: MissionPresentationCatalogue = {
      ...MISSION_PRESENTATION,
      "spore-platform": {
        ...MISSION_PRESENTATION["spore-platform"],
        stageTransition: () => undefined,
      },
    };
    const mission = hull("won", [], [MECH]);
    expect(
      stageTransitionOf(mission, campaign("spore-platform"), {
        missionTypes: MISSION_TYPES,
        presentations: quiet,
      }),
    ).toMatchObject({
      headline: "The hull cleared.",
      next: "Next: The core, stage 2 of 2",
    });
    expect(
      stageTransitionOf(mission, campaign("spore-platform"), {
        presentations: quiet,
      }),
    ).toMatchObject({
      headline: "Stage 1 cleared.",
      next: "Next: Stage 2, stage 2 of 2",
    });
  });

  it("is undefined unless a won stage has another after it", () => {
    const board = campaign("spore-platform");
    expect(stageTransitionOf(hull(undefined, [MECH]), board)).toBeUndefined();
    expect(stageTransitionOf(hull("lost", [MECH]), board)).toBeUndefined();
    const last = {
      ...hull("won", [MECH]),
      stage: { index: 1, count: 2, earlier: [] },
    };
    expect(stageTransitionOf(last, board)).toBeUndefined();
    const { stage: _stage, ...oneMap } = hull("won", [MECH]);
    expect(stageTransitionOf(oneMap, board)).toBeUndefined();
  });
});
