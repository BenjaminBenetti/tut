import { describe, expect, it } from "vitest";

import {
  cityPick,
  installationPick,
  regionPick,
  samePick,
} from "./overworld-pick";

describe("samePick", () => {
  it("compares picks by kind and id", () => {
    expect(samePick(cityPick("tokyo"), cityPick("tokyo"))).toBe(true);
    expect(samePick(cityPick("tokyo"), cityPick("seoul"))).toBe(false);
    expect(
      samePick(
        installationPick("deployable-1"),
        installationPick("deployable-1"),
      ),
    ).toBe(true);
    expect(
      samePick(
        installationPick("deployable-1"),
        installationPick("deployable-2"),
      ),
    ).toBe(false);
    expect(samePick(regionPick("east-asia"), regionPick("east-asia"))).toBe(
      true,
    );
    expect(samePick(regionPick("east-asia"), regionPick("europe"))).toBe(false);
  });

  it("never matches picks of different kinds, whatever their ids", () => {
    expect(samePick(cityPick("x"), installationPick("x"))).toBe(false);
    expect(samePick(installationPick("x"), regionPick("x"))).toBe(false);
    expect(samePick(regionPick("x"), cityPick("x"))).toBe(false);
  });
});
