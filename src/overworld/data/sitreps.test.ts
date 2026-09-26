import { describe, expect, it } from "vitest";

import { SITREP_IDS } from "../../content/model/sitrep-id";
import {
  DUST_OFF_SITREP_MISSION,
  FIRST_SITREP_MISSION,
  SITREPS,
  SPAWN_SITREP_MISSION,
} from "./sitreps";

describe("SITREPS", () => {
  it("keys every definition by its own id", () => {
    for (const id of SITREP_IDS) {
      expect(SITREPS[id].id).toBe(id);
    }
  });

  it("debuts the five Act I sitreps at M10, the spawn pair at M16 and Dust-off at M20 (arc §3, §11)", () => {
    expect(FIRST_SITREP_MISSION).toBe(10);
    expect(SPAWN_SITREP_MISSION).toBe(16);
    expect(DUST_OFF_SITREP_MISSION).toBe(20);
    expect(
      Object.fromEntries(
        SITREP_IDS.map((id) => [id, SITREPS[id].debutMission]),
      ),
    ).toEqual({
      nightfall: 10,
      "spore-fog": 10,
      "city-ablaze": 10,
      "salvage-rich": 10,
      "local-guides": 10,
      "hardened-clutches": 16,
      "swarm-tide": 16,
      "dust-off-window": 20,
    });
  });

  it("names the map hooks a sitrep needs to act, and only for the three that need one", () => {
    expect(
      Object.fromEntries(
        SITREP_IDS.map((id) => [id, SITREPS[id].requiredHooks ?? []]),
      ),
    ).toEqual({
      nightfall: [],
      "spore-fog": [],
      "city-ablaze": [],
      "salvage-rich": [],
      "local-guides": [],
      "hardened-clutches": ["egg-spawner"],
      "swarm-tide": ["edge-spawn"],
      "dust-off-window": ["extraction"],
    });
  });

  it("gives every sitrep a positive weight", () => {
    for (const id of SITREP_IDS) {
      expect(SITREPS[id].weight).toBeGreaterThan(0);
    }
  });

  it("marks exactly Salvage Rich and Local Guides as helping the player", () => {
    const helping = SITREP_IDS.filter((id) => SITREPS[id].helpsPlayer);
    expect(helping).toEqual(["salvage-rich", "local-guides"]);
  });
});
