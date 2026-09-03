import { describe, expect, it } from "vitest";

import type { OverworldSelectionSnapshot } from "../model/overworld-selection";
import { OverworldSelectionState } from "./overworld-selection-state";

describe("OverworldSelectionState", () => {
  it("starts empty", () => {
    expect(new OverworldSelectionState().selection).toEqual({
      cityId: undefined,
      missionId: undefined,
    });
  });

  it("selecting a mission highlights its city; selecting another city drops the mission", () => {
    const state = new OverworldSelectionState();
    state.selectMission("mission-1", "cairo");
    expect(state.selection).toEqual({
      cityId: "cairo",
      missionId: "mission-1",
    });
    state.select("cairo");
    expect(state.selection.missionId).toBe("mission-1");
    state.select("lagos");
    expect(state.selection).toEqual({ cityId: "lagos", missionId: undefined });
  });

  it("clearMission keeps the city", () => {
    const state = new OverworldSelectionState();
    state.selectMission("mission-1", "cairo");
    state.clearMission();
    expect(state.selection).toEqual({ cityId: "cairo", missionId: undefined });
  });

  it("notifies subscribers only on real changes and honours unsubscribe", () => {
    const state = new OverworldSelectionState();
    const seen: OverworldSelectionSnapshot[] = [];
    const stop = state.subscribe((s) => {
      seen.push(s);
    });
    state.select("cairo");
    state.select("cairo");
    state.selectMission("mission-1", "cairo");
    state.selectMission("mission-1", "cairo");
    state.clearMission();
    state.clearMission();
    expect(seen).toEqual([
      { cityId: "cairo", missionId: undefined },
      { cityId: "cairo", missionId: "mission-1" },
      { cityId: "cairo", missionId: undefined },
    ]);
    stop();
    state.select("lagos");
    expect(seen).toHaveLength(3);
  });
});
