import { describe, expect, it } from "vitest";

import { HookKinds } from "../../mapgen/model/hook";
import {
  missionWith,
  openField,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { boardingTrackOf, FORWARD_CLOSING_STEP } from "./boarding-track";

// ===========================================
// Fixtures
// ===========================================

const MECH = unitAt("mech-1", "mech", { x: 2, y: 0, z: 2 });

// ===========================================
// boardingTrackOf
// ===========================================

describe("boardingTrackOf (#1179)", () => {
  it("names both places to board on a map with a forward extraction point", () => {
    const map = openField()
      .objective(HookKinds.FORWARD_EXTRACTION, [{ x: 6, y: 0, z: 6 }])
      .build();
    expect(boardingTrackOf(missionWith(map, [MECH]))).toEqual({
      rows: [],
      closingStep: FORWARD_CLOSING_STEP,
    });
    expect(FORWARD_CLOSING_STEP).toBe(
      "board at the forward point or the landing zone",
    );
  });

  it("leaves the tracker's own step where the force boards only where it landed", () => {
    const map = openField()
      .objective(HookKinds.EGG_SPAWNER, [{ x: 6, y: 0, z: 6 }])
      .build();
    expect(boardingTrackOf(missionWith(map, [MECH]))).toBeUndefined();
    expect(boardingTrackOf(undefined)).toBeUndefined();
  });
});
