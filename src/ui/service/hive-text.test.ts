import { describe, expect, it } from "vitest";

import { HIVE_TUNING } from "../../overworld/data/hive-tuning";
import { hiveText } from "./hive-text";

const HIVES = [
  { id: "hive-1", regionId: "east-asia", formedDay: 30 },
  { id: "hive-2", regionId: "south-asia", formedDay: 40 },
];

describe("hiveText", () => {
  it("is undefined for a region without a hive", () => {
    expect(hiveText({ hives: HIVES, day: 44 }, "oceania", HIVE_TUNING)).toBe(
      undefined,
    );
  });

  it("names the region's hive with its level on the current day", () => {
    expect(
      hiveText({ hives: HIVES, day: 30 }, "east-asia", HIVE_TUNING),
    ).toEqual({
      label: "Hive (level 0)",
      detail: "Formed on day 30. Gains a level every 7 days.",
    });
    expect(
      hiveText({ hives: HIVES, day: 44 }, "east-asia", HIVE_TUNING)?.label,
    ).toBe("Hive (level 2)");
    expect(
      hiveText({ hives: HIVES, day: 44 }, "south-asia", HIVE_TUNING)?.label,
    ).toBe("Hive (level 0)");
  });
});
