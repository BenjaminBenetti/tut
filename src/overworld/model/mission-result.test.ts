import { describe, expect, it } from "vitest";

import type { MissionResult } from "./mission-result";
import { MISSION_OUTCOMES, isMissionOutcome } from "./mission-result";

const SAMPLE: MissionResult = {
  missionId: "mission-4",
  outcome: "won",
  squadCasualties: [
    { squadId: "squad-1", losses: 2 },
    { squadId: "squad-3", losses: 5 },
  ],
  squadsWiped: ["squad-3"],
  mechsDestroyed: [],
  mechDamage: [{ mechId: "mech-2", damage: 35 }],
  creditsAwarded: 1500,
  infestationDelta: -25,
};

describe("MissionOutcome", () => {
  it("lists each outcome once", () => {
    expect(new Set(MISSION_OUTCOMES).size).toBe(MISSION_OUTCOMES.length);
  });

  it("narrows known outcomes and rejects unknown strings", () => {
    for (const outcome of MISSION_OUTCOMES) {
      expect(isMissionOutcome(outcome)).toBe(true);
    }
    expect(isMissionOutcome("")).toBe(false);
    expect(isMissionOutcome("Won")).toBe(false);
    expect(isMissionOutcome("aborted")).toBe(false);
  });
});

describe("MissionResult", () => {
  it("round-trips through JSON unchanged", () => {
    const text = JSON.stringify(SAMPLE);
    expect(JSON.parse(text)).toEqual(SAMPLE);
  });

  it("keeps an absent intel field absent after a round-trip", () => {
    const parsed = JSON.parse(JSON.stringify(SAMPLE)) as MissionResult;
    expect("intel" in parsed).toBe(false);
  });

  it("round-trips a result carrying intel", () => {
    const withIntel: MissionResult = { ...SAMPLE, intel: 3 };
    expect(JSON.parse(JSON.stringify(withIntel))).toEqual(withIntel);
  });

  it("keeps the sample's wiped squads a subset of its casualty reports", () => {
    const reported = new Set(SAMPLE.squadCasualties.map((c) => c.squadId));
    for (const squadId of SAMPLE.squadsWiped) {
      expect(reported.has(squadId), squadId).toBe(true);
    }
  });
});
