import { describe, expect, it } from "vitest";

import { tileTopCentre } from "../view/tactical-map-view";
import { unitFeetAt } from "./unit-placement";

describe("unitFeetAt", () => {
  it("stands a one-tile unit exactly where every unit stood before footprints", () => {
    const anchor = { x: 3, y: 2, z: 5 };
    expect(unitFeetAt(anchor, 1)).toEqual(tileTopCentre(anchor));
  });

  it("stands a 2×2 unit on the corner its four tiles share, at the anchor's height", () => {
    const anchor = { x: 3, y: 2, z: 5 };
    expect(unitFeetAt(anchor, 2)).toEqual({
      x: 4,
      y: tileTopCentre(anchor).y,
      z: 6,
    });
  });
});
