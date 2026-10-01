import { describe, expect, it } from "vitest";

import { ACTS } from "../../overworld/data/acts";
import { EXPERT_OBJECTIVE_STRATEGIES } from "../../tactical/service/players/expert-objective-strategies.test-helper";
import { OBJECTIVE_STRATEGIES } from "../../tactical/service/players/objective-strategies.test-helper";
import { CALIBRATION_CELLS } from "./calibration-cells.test-helper";
import {
  composeCalibrationGame,
  playerFor,
  prepareRun,
} from "./calibration-run.test-helper";

describe("the calibration runs", () => {
  it("hand the new player the shared strategies and the expert its own", () => {
    expect(playerFor("new").strategies).toBe(OBJECTIVE_STRATEGIES);
    expect(playerFor("expert").strategies).toBe(EXPERT_OBJECTIVE_STRATEGIES);
  });

  it("offer every cell's own mission, at a difficulty its act offers, with a bug mix", () => {
    CALIBRATION_CELLS.forEach((cell, cellIndex) => {
      const prepared = prepareRun(composeCalibrationGame(1), {
        cellIndex,
        seedIndex: 1,
        player: "new",
        luck: "new",
      });
      const offer = prepared.state.overworld.missions.find(
        (m) => m.id === prepared.missionId,
      );
      const mission =
        offer?.storyId === undefined ? offer?.typeId : `story:${offer.storyId}`;
      expect(mission, cell.id).toBe(cell.mission);
      expect(offer?.bugMix, cell.id).toBeDefined();
      if (offer?.storyId === undefined) {
        const band = ACTS[cell.act].difficultyBand;
        expect(offer?.difficulty, cell.id).toBeGreaterThanOrEqual(band.min);
        expect(offer?.difficulty, cell.id).toBeLessThanOrEqual(band.max);
      }
    });
  }, 30_000);

  it("offer both players the same mission on the same seed", () => {
    const spec = { cellIndex: 3, seedIndex: 2 } as const;
    const a = prepareRun(composeCalibrationGame(1), {
      ...spec,
      player: "new",
      luck: "new",
    });
    const b = prepareRun(composeCalibrationGame(1), {
      ...spec,
      player: "expert",
      luck: "expert",
    });
    expect(a.state.overworld.missions).toEqual(b.state.overworld.missions);
  });
});
