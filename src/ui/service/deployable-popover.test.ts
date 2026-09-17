import { describe, expect, it } from "vitest";

import { DEPLOYABLE_TYPES } from "../../overworld/data/deployable-types";
import type { Deployable } from "../../overworld/model/deployable";
import {
  buildPopover,
  installedPopover,
  MAX_LEVEL_LINE,
} from "./deployable-popover";

const SENSOR = DEPLOYABLE_TYPES["sensor-array"];
const BATTERY = DEPLOYABLE_TYPES["defensive-battery"];

const built = (
  typeId: Deployable["typeId"],
  level: Deployable["level"],
  online = true,
): Deployable => ({
  id: "deployable-1",
  typeId,
  regionId: "east-asia",
  level,
  builtDay: 1,
  online,
});

describe("buildPopover (#1155)", () => {
  it("names the type over its level 1 effects, the build price and upkeep, and the cap", () => {
    const content = buildPopover(SENSOR, { held: 0 });
    expect(content.title).toBe("Sensor array");
    expect(content.lines.map((l) => l.kind)).toEqual([
      "body",
      "body",
      "dim",
      "dim",
    ]);
    expect(content.lines[0]?.text).toBe(
      "Finds infested cities at 60% of the usual infestation",
    );
    expect(content.lines[1]?.text).toBe("Missions stay on offer 1 day longer");
    expect(content.lines[2]?.text).toBe("Build ¢800 · upkeep ¢20/day");
    expect(content.lines[3]?.text).toBe("1 per region · 0/1 built");
  });

  it("closes with the blocker as a warning when the button is disabled", () => {
    const content = buildPopover(BATTERY, {
      held: 1,
      blocker: "Region cap of 1 reached",
    });
    expect(content.lines.at(-2)?.text).toBe("1 per region · 1/1 built");
    expect(content.lines.at(-1)).toEqual({
      text: "Region cap of 1 reached",
      kind: "warn",
    });
  });
});

describe("installedPopover (#1155)", () => {
  it("shows the current level's effects and upkeep, then the next level's price, upkeep and deltas", () => {
    const content = installedPopover(BATTERY, built("defensive-battery", 1));
    expect(content.title).toBe("Defensive battery · L1 · online");
    expect(content.lines).toEqual([
      { text: "1 garrison turret on every mission map", kind: "body" },
      { text: "Upkeep ¢50/day", kind: "dim" },
      { text: "Upgrade to L2 · ¢1,500 · upkeep ¢80/day", kind: "heading" },
      {
        text: "2 garrison turrets on every mission map (from 1 garrison turret)",
        kind: "body",
      },
    ]);
  });

  it("says Max level at the top of the ladder and reads offline in the title", () => {
    const content = installedPopover(SENSOR, built("sensor-array", 3, false));
    expect(content.title).toBe("Sensor array · L3 · offline");
    expect(content.lines.at(-1)).toEqual({
      text: MAX_LEVEL_LINE,
      kind: "heading",
    });
    expect(content.lines.some((l) => l.text.startsWith("Upgrade"))).toBe(false);
  });
});
