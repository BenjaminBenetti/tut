import { describe, expect, it } from "vitest";

import type { Region } from "../../overworld/model/region";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import { createFalloffTexture } from "../service/falloff-texture";
import type { PlateExtent } from "../service/overworld-layout";
import { SELECTION_COLOUR } from "./city-marker";
import { infestationColour } from "./infestation-ramp";
import { RegionPlate } from "./region-plate";

// ===========================================
// Fixtures
// ===========================================

const REGION: Region = {
  id: "north-america",
  name: "North America",
  biome: "temperate",
  cityIds: ["vancouver", "toronto"],
  neighbourRegionIds: [],
  layout: { x: 0.2, y: 0.25 },
};

const EXTENT: PlateExtent = {
  centre: { x: 0, y: 0, z: 0 },
  width: 4,
  depth: 2,
};

/** A plate on the shipped config, with its own falloff map. */
function makePlate(): RegionPlate {
  return new RegionPlate(
    REGION,
    EXTENT,
    OVERWORLD_SCENE_CONFIG,
    createFalloffTexture(),
  );
}

// ===========================================
// Tests
// ===========================================

describe("RegionPlate (#440)", () => {
  it("draws nothing at all for a clean region", () => {
    const plate = makePlate();

    expect(plate.look().opacity).toBe(0);
    plate.dispose();
  });

  it("draws no border, so regions cannot read as boxes", () => {
    const plate = makePlate();

    // The wash is the only thing in the group; the EdgesGeometry outline
    // that made overlapping plates look like a debug overlay is gone.
    expect(plate.object.children).toHaveLength(1);
    expect(plate.object.children[0]?.type).toBe("Mesh");
    plate.dispose();
  });

  it("shows more of the ramp colour the worse the infestation gets", () => {
    const plate = makePlate();

    plate.setInfestation(50);
    const half = plate.look();
    plate.setInfestation(100);
    const full = plate.look();

    expect(half.opacity).toBeGreaterThan(0);
    expect(full.opacity).toBeGreaterThan(half.opacity);
    expect(full.opacity).toBeCloseTo(OVERWORLD_SCENE_CONFIG.plateOpacity, 5);
    expect(half.colour).toBe(infestationColour(50));
    expect(full.colour).toBe(infestationColour(100));
    plate.dispose();
  });

  it("keeps a selected region visible even when it is clean", () => {
    const plate = makePlate();

    plate.setSelected(true);
    // Green on green land cannot be seen, so a selected region wears the
    // same accent as the marker's ring.
    expect(plate.look().opacity).toBeGreaterThan(0);
    expect(plate.look().colour).toBe(SELECTION_COLOUR);

    plate.setSelected(false);
    expect(plate.look().opacity).toBe(0);
    expect(plate.look().colour).toBe(infestationColour(0));
    plate.dispose();
  });

  it("never dims an infested region just because it is selected", () => {
    const plate = makePlate();

    plate.setInfestation(100);
    const unselected = plate.look().opacity;
    plate.setSelected(true);

    expect(plate.look().opacity).toBeGreaterThanOrEqual(unselected);
    plate.dispose();
  });
});
