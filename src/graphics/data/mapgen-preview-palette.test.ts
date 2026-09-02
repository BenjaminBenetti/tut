import { describe, expect, it } from "vitest";

import { SURFACE_DEFINITIONS } from "../../mapgen/data/surfaces";
import { COVER_LEVELS } from "../../mapgen/model/cover";
import { HookKinds } from "../../mapgen/model/hook";
import {
  CONNECTOR_COLOURS,
  HOOK_COLOURS,
  PROP_COLOURS,
  PROP_HEIGHTS,
  SURFACE_COLOURS,
  WALL_COLOURS,
} from "./mapgen-preview-palette";

describe("mapgen preview palette", () => {
  it("has a colour for every shipped surface", () => {
    for (const surface of SURFACE_DEFINITIONS) {
      expect(SURFACE_COLOURS[surface.id], surface.id).toBeDefined();
    }
  });

  it("has a colour for every shipped hook kind", () => {
    for (const kind of Object.values(HookKinds)) {
      expect(HOOK_COLOURS[kind], kind).toBeDefined();
    }
  });

  it("covers every cover level, wall kind and connector kind", () => {
    for (const level of COVER_LEVELS) {
      expect(PROP_COLOURS[level]).toBeDefined();
      expect(PROP_HEIGHTS[level]).toBeGreaterThan(0);
    }
    expect(Object.keys(WALL_COLOURS).sort()).toEqual([
      "door",
      "solid",
      "window",
    ]);
    expect(Object.keys(CONNECTOR_COLOURS).sort()).toEqual([
      "ladder",
      "ramp",
      "stairs",
    ]);
  });
});
