import { describe, expect, it } from "vitest";

import type { Deployable } from "./deployable";

describe("Deployable", () => {
  it("round-trips through JSON unchanged", () => {
    const deployable: Deployable = {
      id: "deployable-1",
      typeId: "sensor-array",
      regionId: "western-europe",
      builtDay: 4,
      online: true,
    };
    const text = JSON.stringify(deployable);
    expect(JSON.parse(text)).toEqual(deployable);
  });
});
