import { describe, expect, it } from "vitest";

import type { Deployment } from "./deployment";

const SAMPLE: Deployment = {
  missionId: "mission-4",
  squadIds: ["squad-1", "squad-3"],
  mechIds: ["mech-2"],
};

describe("Deployment", () => {
  it("round-trips through JSON unchanged", () => {
    const text = JSON.stringify(SAMPLE);
    expect(JSON.parse(text)).toEqual(SAMPLE);
  });

  it("round-trips an empty force unchanged", () => {
    const empty: Deployment = {
      missionId: "mission-1",
      squadIds: [],
      mechIds: [],
    };
    expect(JSON.parse(JSON.stringify(empty))).toEqual(empty);
  });
});
