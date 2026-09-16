import { describe, expect, it } from "vitest";

import { DEPLOYABLE_TYPE_IDS } from "../../overworld/model/deployable-type";
import { DEPLOYABLE_ANIMATIONS } from "./deployable-animations";

describe("DEPLOYABLE_ANIMATIONS (#1155)", () => {
  it("names an idle for every deployable type, all slow enough to read as idle", () => {
    for (const id of DEPLOYABLE_TYPE_IDS) {
      const animation = DEPLOYABLE_ANIMATIONS[id];
      if (animation.kind === "spin") {
        // At most one turn every six seconds.
        expect(Math.abs(animation.radiansPerSecond)).toBeLessThanOrEqual(
          (2 * Math.PI) / 6,
        );
      } else {
        expect(animation.arc).toBeGreaterThan(0);
        expect(animation.arc).toBeLessThanOrEqual(Math.PI / 2);
        expect(animation.phaseRate).toBeLessThanOrEqual((2 * Math.PI) / 4);
      }
    }
  });

  it("turns the dish about once every twelve seconds and sprays only from the dispersal", () => {
    const dish = DEPLOYABLE_ANIMATIONS["sensor-array"];
    expect(dish.kind).toBe("spin");
    if (dish.kind === "spin") {
      expect((2 * Math.PI) / dish.radiansPerSecond).toBeCloseTo(12, 6);
    }
    const dispersal = DEPLOYABLE_ANIMATIONS["repellent-dispersal"];
    expect(dispersal.kind === "sweep" && dispersal.spray).toBeTruthy();
    const battery = DEPLOYABLE_ANIMATIONS["defensive-battery"];
    expect(battery.kind === "sweep" && battery.spray).toBeUndefined();
  });
});
