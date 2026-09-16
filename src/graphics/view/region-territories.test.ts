import type {
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { Box3 } from "three";
import { describe, expect, it } from "vitest";

import type { GroundSegment } from "../service/coastline-segments";
import { testsLandStencil } from "../service/land-stencil";
import type { TerritorySeed } from "../service/region-territory-service";
import { computeTerritories } from "../service/region-territory-service";
import { SELECTION_COLOUR } from "./city-marker";
import { infestationColour } from "./infestation-ramp";
import {
  BORDER_COLOUR,
  BORDER_OPACITY,
  FILL_MAX_OPACITY,
  RegionTerritories,
} from "./region-territories";

// ===========================================
// Fixtures
// ===========================================

const SEEDS: readonly TerritorySeed[] = [
  { cityId: "a", regionId: "west", point: { x: 4, z: 3 } },
  { cityId: "b", regionId: "west", point: { x: 8, z: 4 } },
  { cityId: "c", regionId: "east", point: { x: 16, z: 3 } },
  { cityId: "d", regionId: "east", point: { x: 20, z: 5 } },
];

/** A coast edge near `a`, one near `c`. */
const COAST: readonly GroundSegment[] = [
  { a: { x: 3, z: 2 }, b: { x: 5, z: 2 } },
  { a: { x: 15, z: 2 }, b: { x: 17, z: 2 } },
];

function makeTerritories(): RegionTerritories {
  return new RegionTerritories({
    cells: computeTerritories(SEEDS, { width: 24, depth: 12 }),
    coast: COAST,
  });
}

function fillOf(
  territories: RegionTerritories,
  regionId: string,
): Mesh<BufferGeometry, MeshBasicMaterial> {
  const mesh = territories.object.getObjectByName(
    `territory-fill-${regionId}`,
  ) as Mesh<BufferGeometry, MeshBasicMaterial> | undefined;
  if (!mesh) throw new Error(`no fill for ${regionId}`);
  return mesh;
}

function linesOf(territories: RegionTerritories, name: string): LineSegments {
  const lines = territories.object.getObjectByName(name) as
    LineSegments | undefined;
  if (!lines) throw new Error(`no ${name}`);
  return lines;
}

// ===========================================
// Tests
// ===========================================

describe("RegionTerritories (#1149)", () => {
  it("builds one fill per region covering that region's cells, hidden while clean", () => {
    const territories = makeTerritories();
    const west = fillOf(territories, "west");
    const bounds = new Box3().setFromObject(west);
    expect(bounds.min.x).toBeCloseTo(0);
    // West ends at the tilted b|c bisector, which crosses x = 12 at its midpoint.
    expect(bounds.max.x).toBeGreaterThan(12);
    expect(bounds.max.x).toBeLessThan(14);
    expect(bounds.min.z).toBeCloseTo(0);
    expect(bounds.max.z).toBeCloseTo(12);
    expect(bounds.min.y).toBeCloseTo(bounds.max.y);
    expect(bounds.min.y).toBeGreaterThan(0);
    expect(territories.fillLook("west")).toEqual({
      colour: infestationColour(0),
      opacity: 0,
    });
    expect(west.material.visible).toBe(false);
    expect(territories.fillLook("nowhere")).toBeUndefined();
    territories.dispose();
  });

  it("fills on the ramp with opacity rising linearly to the maximum", () => {
    const territories = makeTerritories();
    territories.setInfestation("west", 50);
    const half = territories.fillLook("west");
    territories.setInfestation("west", 100);
    const full = territories.fillLook("west");
    expect(half?.colour).toBe(infestationColour(50));
    expect(half?.opacity).toBeCloseTo(FILL_MAX_OPACITY / 2, 6);
    expect(full?.colour).toBe(infestationColour(100));
    expect(full?.opacity).toBeCloseTo(FILL_MAX_OPACITY, 6);
    expect(fillOf(territories, "west").material.visible).toBe(true);
    expect(territories.fillLook("east")?.opacity).toBe(0);
    territories.setInfestation("west", 0);
    expect(fillOf(territories, "west").material.visible).toBe(false);
    territories.dispose();
  });

  it("draws the region borders dim, and only between different regions", () => {
    const territories = makeTerritories();
    const borders = linesOf(territories, "territory-borders");
    const material = borders.material as LineBasicMaterial;
    expect(material.color.getHex()).toBe(BORDER_COLOUR);
    expect(material.opacity).toBeCloseTo(BORDER_OPACITY);
    expect(material.transparent).toBe(true);
    // One bisector between the two regions (b|c), not a|b or c|d.
    expect(borders.geometry.getAttribute("position").count / 2).toBe(1);
    territories.dispose();
  });

  it("lights the selected region's outline in the accent with a glow, and no fill", () => {
    const territories = makeTerritories();
    const core = linesOf(territories, "territory-selection");
    const glow = linesOf(territories, "territory-selection-glow-0");
    const coast = linesOf(territories, "territory-selection-coast");
    const coastGlow = linesOf(territories, "territory-selection-coast-glow-0");
    expect(core.visible).toBe(false);
    expect(coast.visible).toBe(false);
    expect(territories.selectedRegion()).toBeUndefined();

    territories.setSelected("west");

    expect(territories.selectedRegion()).toBe("west");
    for (const lines of [core, glow, coast, coastGlow]) {
      expect(lines.visible).toBe(true);
      expect((lines.material as LineBasicMaterial).color.getHex()).toBe(
        SELECTION_COLOUR,
      );
    }
    expect(glow.geometry).toBe(core.geometry);
    expect(coastGlow.geometry).toBe(coast.geometry);
    expect((glow.material as LineBasicMaterial).opacity).toBeLessThan(1);
    expect(glow.position.x).not.toBe(core.position.x);
    // The b|c border, and the one coast edge that falls in west's cells.
    expect(core.geometry.getAttribute("position").count / 2).toBe(1);
    expect(coast.geometry.getAttribute("position").count / 2).toBe(1);
    expect(territories.outlineSegmentCount("west")).toBe(2);
    expect(territories.fillLook("west")?.opacity).toBe(0);

    territories.setSelected(undefined);
    expect(core.visible).toBe(false);
    expect(coast.visible).toBe(false);
    expect(territories.selectedRegion()).toBeUndefined();
    territories.dispose();
  });

  it("clips every fill and border line to the land stencil, but not the coast outline", () => {
    const territories = makeTerritories();
    const clipped = [
      fillOf(territories, "west").material,
      fillOf(territories, "east").material,
      linesOf(territories, "territory-borders").material,
      linesOf(territories, "territory-selection").material,
      linesOf(territories, "territory-selection-glow-3").material,
    ];
    for (const material of clipped) {
      if (Array.isArray(material)) throw new Error("unexpected material array");
      expect(testsLandStencil(material)).toBe(true);
      // Drawn in the transparent pass, after the land fill has stamped it.
      expect(material.transparent).toBe(true);
    }
    // The coast lies on the stencil's own edge: tested against it, only
    // half its pixels would survive, and it is on land by definition.
    const coast = [
      linesOf(territories, "territory-selection-coast").material,
      linesOf(territories, "territory-selection-coast-glow-1").material,
    ];
    for (const material of coast) {
      if (Array.isArray(material)) throw new Error("unexpected material array");
      expect(testsLandStencil(material)).toBe(false);
      expect(material.transparent).toBe(true);
    }
    territories.dispose();
  });

  it("dispose releases every geometry and material", () => {
    const territories = makeTerritories();
    const disposed = new Set<object>();
    const seen = new Set<object>();
    territories.object.traverse((child) => {
      const drawable = child as Partial<Mesh>;
      const items = [
        drawable.geometry,
        ...(Array.isArray(drawable.material)
          ? drawable.material
          : [drawable.material]),
      ];
      for (const item of items) {
        if (!item || seen.has(item)) continue;
        seen.add(item);
        item.addEventListener("dispose", () => disposed.add(item));
      }
    });
    territories.setSelected("east");
    territories.dispose();
    for (const item of seen) {
      expect(disposed.has(item)).toBe(true);
    }
    // Two fills, the borders, and a core and glow for each outline half.
    expect([...seen].filter((item) => "isMaterial" in item)).toHaveLength(7);
  });
});
