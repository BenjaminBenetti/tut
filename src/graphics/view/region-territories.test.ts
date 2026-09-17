import type {
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { Box3 } from "three";
import { describe, expect, it } from "vitest";

import type { GroundPolygon } from "../service/coastline-projection";
import type { GroundSegment } from "../service/coastline-segments";
import type { TerritorySeed } from "../service/region-territory-service";
import { computeTerritories } from "../service/region-territory-service";
import { SELECTION_COLOUR } from "./city-marker";
import { infestationColour } from "./infestation-ramp";
import {
  BORDER_COLOUR,
  BORDER_OPACITY,
  FILL_MAX_OPACITY,
  HOVER_OPACITY,
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

/** One continent a unit in from every edge of the 24×12 plane. */
const LAND: readonly GroundPolygon[] = [
  {
    outer: [
      { x: 1, z: 1 },
      { x: 23, z: 1 },
      { x: 23, z: 11 },
      { x: 1, z: 11 },
      { x: 1, z: 1 },
    ],
    holes: [],
  },
];

function makeTerritories(
  land: readonly GroundPolygon[] = LAND,
): RegionTerritories {
  return new RegionTerritories({
    cells: computeTerritories(SEEDS, { width: 24, depth: 12 }),
    land,
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
  it("builds one fill per region covering that region's land, hidden while clean", () => {
    const territories = makeTerritories();
    const west = fillOf(territories, "west");
    const bounds = new Box3().setFromObject(west);
    // The continent's edge, not the map's: the fill is cut to land.
    expect(bounds.min.x).toBeCloseTo(1);
    // West ends at the tilted b|c bisector, which crosses x = 12 at its midpoint.
    expect(bounds.max.x).toBeGreaterThan(12);
    expect(bounds.max.x).toBeLessThan(14);
    expect(bounds.min.z).toBeCloseTo(1);
    expect(bounds.max.z).toBeCloseTo(11);
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

  it("cuts fills and borders to land on the CPU and leaves the stencil alone", () => {
    const territories = makeTerritories();
    const materials = [
      fillOf(territories, "west").material,
      fillOf(territories, "east").material,
      linesOf(territories, "territory-borders").material,
      linesOf(territories, "territory-selection").material,
      linesOf(territories, "territory-selection-coast").material,
      linesOf(territories, "territory-hover").material,
    ];
    for (const material of materials) {
      if (Array.isArray(material)) throw new Error("unexpected material array");
      expect(material.stencilWrite).toBe(false);
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
    }
    // The b|c border runs the plane's full depth but is drawn only across the continent.
    const border = new Box3().setFromObject(
      linesOf(territories, "territory-borders"),
    );
    expect(border.min.z).toBeCloseTo(1);
    expect(border.max.z).toBeCloseTo(11);
    // Every fill vertex is on the continent.
    for (const regionId of ["west", "east"]) {
      const bounds = new Box3().setFromObject(fillOf(territories, regionId));
      expect(bounds.min.x).toBeGreaterThanOrEqual(1 - 1e-6);
      expect(bounds.max.x).toBeLessThanOrEqual(23 + 1e-6);
      expect(bounds.min.z).toBeGreaterThanOrEqual(1 - 1e-6);
      expect(bounds.max.z).toBeLessThanOrEqual(11 + 1e-6);
    }
    territories.dispose();
  });

  it("gives a region with no land an empty fill and no border", () => {
    // An island under east's cells only.
    const territories = makeTerritories([
      {
        outer: [
          { x: 15, z: 2 },
          { x: 22, z: 2 },
          { x: 22, z: 8 },
          { x: 15, z: 8 },
          { x: 15, z: 2 },
        ],
        holes: [],
      },
    ]);
    expect(
      fillOf(territories, "west").geometry.getAttribute("position").count,
    ).toBe(0);
    expect(
      fillOf(territories, "east").geometry.getAttribute("position").count,
    ).toBeGreaterThan(0);
    expect(
      linesOf(territories, "territory-borders").geometry.getAttribute(
        "position",
      ).count,
    ).toBe(0);
    expect(territories.fillLook("west")?.opacity).toBe(0);
    territories.dispose();
  });

  it("outlines the hovered region dimly in the accent, unless it is the selected one", () => {
    const territories = makeTerritories();
    const hover = linesOf(territories, "territory-hover");
    const hoverCoast = linesOf(territories, "territory-hover-coast");
    const core = linesOf(territories, "territory-selection");
    expect(hover.visible).toBe(false);
    expect(territories.hoveredRegion()).toBeUndefined();

    territories.setHovered("west");

    expect(territories.hoveredRegion()).toBe("west");
    expect(hover.visible).toBe(true);
    expect(hoverCoast.visible).toBe(true);
    expect((hover.material as LineBasicMaterial).color.getHex()).toBe(
      SELECTION_COLOUR,
    );
    expect((hover.material as LineBasicMaterial).opacity).toBeCloseTo(
      HOVER_OPACITY,
    );
    expect(hover.geometry.getAttribute("position").count / 2).toBe(1);
    expect(hoverCoast.geometry.getAttribute("position").count / 2).toBe(1);
    expect(core.visible).toBe(false);

    territories.setSelected("west");
    expect(hover.visible).toBe(false);
    expect(core.visible).toBe(true);
    expect(core.geometry).not.toBe(hover.geometry);

    territories.setHovered("east");
    expect(hover.visible).toBe(true);
    expect(hover.geometry).not.toBe(core.geometry);

    territories.setHovered(undefined);
    expect(hover.visible).toBe(false);
    expect(territories.hoveredRegion()).toBeUndefined();
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
    // Two fills, the borders, a hover line and a core and glow for each outline half.
    expect([...seen].filter((item) => "isMaterial" in item)).toHaveLength(9);
  });
});
