import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { GameState } from "../../save/model/game-state";
import type { TacticalState } from "../../tactical/model/tactical-state";
import {
  missionWith,
  openField,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { campaignOnDay, missionAt } from "../view/mission-fixtures.test-helper";
import { stageNamesOf, stageTrackOf } from "./stage-track";

// ===========================================
// Fixtures
// ===========================================

const MECH = unitAt("mech-1", "mech", { x: 2, y: 0, z: 2 });

/** Mission "mission-1" on stage `index` of `count`. */
function onStage(index: number, count = 2): TacticalState {
  return {
    ...missionWith(openField().build(), [MECH]),
    missionId: "mission-1",
    stage: { index, count, earlier: [] },
  };
}

/** A campaign whose board holds "mission-1" as an offer of `typeId`. */
function campaign(typeId: MissionTypeId = "spore-platform"): GameState {
  return campaignOnDay(4, [
    { ...missionAt("mission-1", "lagos", 9, 10), typeId },
  ]);
}

// ===========================================
// The tracker's stages
// ===========================================

describe("stageTrackOf (#1179)", () => {
  it("lists every stage by the type's names: cleared, current, ahead", () => {
    const three = onStage(1, 3);
    expect(stageNamesOf(three, campaign(), MISSION_TYPES)).toEqual([
      "The hull",
      "The core",
      "Stage 3",
    ]);
    expect(stageTrackOf(three, campaign(), MISSION_TYPES)).toEqual({
      rows: [
        { index: 0, name: "The hull", state: "cleared" },
        { index: 1, name: "The core", state: "current" },
        { index: 2, name: "Stage 3", state: "ahead" },
      ],
      closingStep: "on to stage 3",
    });
  });

  it("names the next stage as the closing step, and none on the last", () => {
    const board = campaign();
    expect(stageTrackOf(onStage(0), board, MISSION_TYPES)?.closingStep).toBe(
      "on to the core",
    );
    const track = stageTrackOf(onStage(1), board, MISSION_TYPES);
    expect(track?.rows.map((row) => row.state)).toEqual(["cleared", "current"]);
    expect(track && "closingStep" in track).toBe(false);
  });

  it("reads a won stage cleared while its transition is up, before Continue leaves it", () => {
    const board = campaign();
    const hullWon = { ...onStage(0), outcome: "won" as const };
    expect(
      stageTrackOf(hullWon, board, MISSION_TYPES)?.rows.map((row) => row.state),
    ).toEqual(["cleared", "ahead"]);
    const hullLost = { ...onStage(0), outcome: "lost" as const };
    expect(
      stageTrackOf(hullLost, board, MISSION_TYPES)?.rows.map(
        (row) => row.state,
      ),
    ).toEqual(["current", "ahead"]);
  });

  it("is undefined for a one-map mission or none, and numbers the stages without the types", () => {
    const { stage: _stage, ...oneMap } = onStage(0);
    expect(stageTrackOf(oneMap, campaign(), MISSION_TYPES)).toBeUndefined();
    expect(stageTrackOf(undefined, campaign())).toBeUndefined();
    expect(stageNamesOf(oneMap, campaign(), MISSION_TYPES)).toEqual([]);
    expect(stageNamesOf(onStage(0), campaign(), undefined)).toEqual([
      "Stage 1",
      "Stage 2",
    ]);
    expect(
      stageNamesOf(
        onStage(0),
        campaign("infestation-clearance"),
        MISSION_TYPES,
      ),
    ).toEqual(["Stage 1", "Stage 2"]);
  });
});
