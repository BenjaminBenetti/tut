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

/**
 * Style guide §4.3 environment tokens; infestation uses the §4.2 flesh token.
 * the palette is what a player sees until a map cell resolves to a model
 * (#474), so a drifted hex is a drifted game.
 */
const ENV_TOKENS: Readonly<Record<string, number>> = {
  "env-asphalt": 0x3a3d42,
  "env-concrete": 0x8e8a82,
  "env-sidewalk": 0xa7a297,
  "env-brick": 0x8a4b3a,
  "env-glass": 0x6e8fa6,
  "env-roof": 0x55524c,
  "env-metal": 0x6f7378,
  "env-rust": 0x8c5a3a,
  "env-rock": 0x6e6a66,
  "env-bark": 0x5a4634,
  "env-foliage": 0x3f6b33,
  "env-grass": 0x5e7a3a,
  "env-dirt": 0x7a6045,
  "env-snow": 0xe8ecf0,
  "env-ice": 0xb9d2e0,
  "env-frozen-dirt": 0x6b6a66,
  "env-sand": 0xd9b87a,
  "env-sandstone": 0xb58a5a,
  "env-scrub": 0x8a8a4a,
  "env-wet-sand": 0xb5a276,
  "env-water-shallow": 0x3f8fa8,
  "env-water-deep": 0x1f5c73,
  "env-seawall": 0x7e7f7a,
};

/**
 * The spore platform's surfaces (#1179): the bugs' own chitin (style
 * guide §4.2) for plates and rims, and the scene's clear colour, `ui-bg`,
 * for the void that is never drawn.
 */
const PLATFORM_TOKENS: Readonly<Record<string, number>> = {
  "hull-plate": 0x8b5d36,
  "hull-plate-dark": 0x5c3b25,
  "hull-rim": 0xb88b58,
  void: 0x0b0d12,
};

/**
 * The four overlay colours from style guide §12.2. A world surface painted
 * one of these steals the meaning of "your unit" or "where it can go".
 */
const OVERLAY_COLOURS = [0x7fd1ff, 0xf0c63c, 0xe0453c, 0xf08a24];

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

  it("paints world surfaces with environment tokens and infestation with bug flesh", () => {
    const env = new Set(Object.values(ENV_TOKENS));
    const worldColours = [
      ...Object.entries(SURFACE_COLOURS),
      ...Object.entries(WALL_COLOURS),
      ...Object.entries(PROP_COLOURS),
      ...Object.entries(CONNECTOR_COLOURS),
    ];
    for (const [key, colour] of worldColours) {
      if (key === "infested") {
        expect(colour).toBe(0x73452e);
        continue;
      }
      if (key in PLATFORM_TOKENS) {
        expect(colour, key).toBe(PLATFORM_TOKENS[key]);
        continue;
      }
      expect(env.has(colour), `${key} = #${colour.toString(16)}`).toBe(true);
    }
  });

  it("keeps the four overlay colours off world surfaces", () => {
    const worldColours = [
      ...Object.values(SURFACE_COLOURS),
      ...Object.values(WALL_COLOURS),
      ...Object.values(PROP_COLOURS),
      ...Object.values(CONNECTOR_COLOURS),
    ];
    for (const colour of worldColours) {
      expect(OVERLAY_COLOURS, `#${colour.toString(16)}`).not.toContain(colour);
    }
  });

  it("covers every cover level, wall kind and connector kind", () => {
    for (const level of COVER_LEVELS) {
      expect(PROP_COLOURS[level]).toBeDefined();
      expect(PROP_HEIGHTS[level]).toBeGreaterThan(0);
    }
    expect(Object.keys(WALL_COLOURS).sort()).toEqual([
      "door",
      "half",
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
