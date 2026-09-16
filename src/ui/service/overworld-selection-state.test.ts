import { describe, expect, it } from "vitest";

import type { OverworldSelectionSnapshot } from "../model/overworld-selection";
import { OverworldSelectionState } from "./overworld-selection-state";

/** A two-region toy map: Cairo and Lagos in Africa, Tokyo in East Asia. */
const REGION_OF: Readonly<Record<string, string>> = {
  cairo: "africa",
  lagos: "africa",
  tokyo: "east-asia",
};
const state = (): OverworldSelectionState =>
  new OverworldSelectionState((cityId) => REGION_OF[cityId]);

describe("OverworldSelectionState", () => {
  it("starts empty", () => {
    expect(state().selection).toEqual({
      regionId: undefined,
      cityId: undefined,
      missionId: undefined,
    });
  });

  it("selecting a city selects its region (#1154); an unknown city has none", () => {
    const s = state();
    s.select("tokyo");
    expect(s.selection).toEqual({
      regionId: "east-asia",
      cityId: "tokyo",
      missionId: undefined,
    });
    s.select("atlantis");
    expect(s.regionId).toBeUndefined();
    expect(s.cityId).toBe("atlantis");
    s.select(undefined);
    expect(s.selection).toEqual({
      regionId: undefined,
      cityId: undefined,
      missionId: undefined,
    });
  });

  it("selecting a mission highlights its city and region; selecting another city drops the mission", () => {
    const s = state();
    s.selectMission("mission-1", "cairo");
    expect(s.selection).toEqual({
      regionId: "africa",
      cityId: "cairo",
      missionId: "mission-1",
    });
    s.select("cairo");
    expect(s.selection.missionId).toBe("mission-1");
    s.select("lagos");
    expect(s.selection).toEqual({
      regionId: "africa",
      cityId: "lagos",
      missionId: undefined,
    });
  });

  it("selectRegion focuses the region alone, clearing city and mission", () => {
    const s = state();
    s.selectMission("mission-1", "cairo");
    s.selectRegion("east-asia");
    expect(s.selection).toEqual({
      regionId: "east-asia",
      cityId: undefined,
      missionId: undefined,
    });
    s.selectRegion(undefined);
    expect(s.regionId).toBeUndefined();
  });

  it("clearMission keeps the city and region", () => {
    const s = state();
    s.selectMission("mission-1", "cairo");
    s.clearMission();
    expect(s.selection).toEqual({
      regionId: "africa",
      cityId: "cairo",
      missionId: undefined,
    });
  });

  it("notifies subscribers only on real changes and honours unsubscribe", () => {
    const s = state();
    const seen: OverworldSelectionSnapshot[] = [];
    const stop = s.subscribe((snapshot) => {
      seen.push(snapshot);
    });
    s.select("cairo");
    s.select("cairo");
    s.selectMission("mission-1", "cairo");
    s.selectMission("mission-1", "cairo");
    s.clearMission();
    s.clearMission();
    s.selectRegion("africa");
    s.selectRegion("africa");
    expect(seen).toEqual([
      { regionId: "africa", cityId: "cairo", missionId: undefined },
      { regionId: "africa", cityId: "cairo", missionId: "mission-1" },
      { regionId: "africa", cityId: "cairo", missionId: undefined },
      { regionId: "africa", cityId: undefined, missionId: undefined },
    ]);
    stop();
    s.select("lagos");
    expect(seen).toHaveLength(4);
  });
});
