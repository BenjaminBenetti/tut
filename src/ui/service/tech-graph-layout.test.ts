import { describe, expect, it } from "vitest";

import { TECH_FAMILIES } from "../../tech/data/tech-families";
import { TECH_NODES } from "../../tech/data/tech-tree";
import { StaticTechCatalogue } from "../../tech/repository/static-tech-catalogue";
import type { GroundPoint } from "../model/tech-graph-layout";
import { layoutTechGraph, TECH_GRAPH_LAYOUT_TUNING } from "./tech-graph-layout";

const CATALOGUE = new StaticTechCatalogue(
  TECH_NODES,
  Object.values(TECH_FAMILIES),
);

/** Distance between two ground points. */
function distance(a: GroundPoint, b: GroundPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe("layoutTechGraph", () => {
  const layout = layoutTechGraph(CATALOGUE);

  it("places every node once, every family once, and reaches past the outer ring", () => {
    expect(layout.nodes.map((n) => n.id).sort()).toEqual(
      TECH_NODES.map((n) => n.id).sort(),
    );
    expect(layout.families.map((f) => f.id)).toEqual(
      Object.values(TECH_FAMILIES).map((f) => f.id),
    );
    expect(layout.radius).toBe(
      TECH_GRAPH_LAYOUT_TUNING.tier3Radius + TECH_GRAPH_LAYOUT_TUNING.margin,
    );
  });

  it("puts tier 2 on the inner ring and tier 3 on the outer, each under its family's spoke", () => {
    const spokes = new Map(
      layout.families.map((f) => [f.id, Math.atan2(f.z, f.x)]),
    );
    for (const node of layout.nodes) {
      const radius = Math.hypot(node.x, node.z);
      expect(radius).toBeCloseTo(
        node.tier === 2
          ? TECH_GRAPH_LAYOUT_TUNING.tier2Radius
          : TECH_GRAPH_LAYOUT_TUNING.tier3Radius,
        2,
      );
      const spoke = spokes.get(node.familyId);
      expect(spoke).toBeDefined();
      if (spoke === undefined) continue;
      let delta = Math.atan2(node.z, node.x) - spoke;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      // Inside the family's sixty-degree sector.
      expect(Math.abs(delta)).toBeLessThan(Math.PI / 6);
    }
  });

  it("links the core to every plinth, every node to its family or its prerequisite, and nothing else", () => {
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const plinths = new Map(layout.families.map((f) => [f.id, f]));
    expect(layout.edges).toHaveLength(
      layout.families.length + layout.nodes.length,
    );
    for (const edge of layout.edges) {
      if (edge.nodeId === undefined) {
        expect(edge.from).toEqual({ x: 0, z: 0 });
        continue;
      }
      const node = byId.get(edge.nodeId);
      expect(node).toBeDefined();
      if (!node) continue;
      expect(edge.to).toEqual({ x: node.x, z: node.z });
      const definition = CATALOGUE.getNode(node.id);
      const parent = definition?.requires[0];
      const expectedFrom =
        parent === undefined ? plinths.get(node.familyId) : byId.get(parent);
      expect(expectedFrom).toBeDefined();
      if (!expectedFrom) continue;
      expect(edge.from).toEqual({ x: expectedFrom.x, z: expectedFrom.z });
    }
  });

  it("keeps every pair of nodes at least a pedestal's width apart", () => {
    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a === b) continue;
        expect(distance(a, b), `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(
          2.9,
        );
      }
    }
  });

  it("keeps tier 2 nodes twice a pedestal's width apart, across families too (#1171)", () => {
    const tier2 = layout.nodes.filter((node) => node.tier === 2);
    for (const a of tier2) {
      for (const b of tier2) {
        if (a === b) continue;
        expect(distance(a, b), `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(
          5.9,
        );
      }
    }
  });

  it("is deterministic", () => {
    expect(layoutTechGraph(CATALOGUE)).toEqual(layout);
  });
});
