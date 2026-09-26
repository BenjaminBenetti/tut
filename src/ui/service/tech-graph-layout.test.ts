import { describe, expect, it } from "vitest";

import {
  conditionalTechCatalogue,
  FX_FIELD_NOTES,
  FX_HEAVY_WEAPONS,
  FX_JUMP_JETS,
  FX_PHEROMONE_ANALYSIS,
  FX_POD_TELEMETRY,
  FX_SPRINT_FRAME,
  FX_SQUAD_ARMOUR,
  HIVE_CORE_SAMPLE,
  SPORE_SAMPLE,
  withFlags,
} from "../../tech/data/conditional-tech-tree.test-helper";
import { TECH_FAMILIES } from "../../tech/data/tech-families";
import { TECH_NODES } from "../../tech/data/tech-tree";
import type { TechCatalogue } from "../../tech/model/tech-catalogue";
import { NO_TECH_CONDITIONS } from "../../tech/model/tech-conditions";
import type { TechConditions } from "../../tech/model/tech-conditions";
import type {
  TechFamily,
  TechFamilyId,
  TechNode,
} from "../../tech/model/tech-node";
import { StaticTechCatalogue } from "../../tech/repository/static-tech-catalogue";
import type { GroundPoint, TechGraphLayout } from "../model/tech-graph-layout";
import { layoutTechGraph, TECH_GRAPH_LAYOUT_TUNING } from "./tech-graph-layout";

const CATALOGUE = new StaticTechCatalogue(
  TECH_NODES,
  Object.values(TECH_FAMILIES),
);

/** Distance between two ground points. */
function distance(a: GroundPoint, b: GroundPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * The shipped tree without its infantry family (campaign arc §10.3):
 * the six families the tuned rings were drawn for.
 */
function sixFamilyCatalogue(): StaticTechCatalogue {
  return new StaticTechCatalogue(
    TECH_NODES.filter((node) => node.family !== "infantry"),
    Object.values(TECH_FAMILIES).filter((family) => family.id !== "infantry"),
  );
}

/**
 * The shipped families plus three made-up ones as crowded as the
 * busiest shipped family (four tier 2 nodes, three tier 3 nodes under
 * one of them), the shape the intel and xenobiology families will add.
 * Family ids outside the closed union are cast: the layout never reads
 * them as anything but keys.
 */
function crowdedCatalogue(): StaticTechCatalogue {
  const extra = ["extra-a", "extra-b", "extra-c"].map((id): TechFamily => ({
    id: id as TechFamilyId,
    name: id,
    description: id,
  }));
  const nodes: TechNode[] = [...TECH_NODES];
  for (const family of extra) {
    for (let i = 0; i < 4; i += 1) {
      nodes.push({
        id: `tech.${family.id}-t2-${String(i)}`,
        name: `${family.id} ${String(i)}`,
        description: "-",
        family: family.id,
        kind: "intel",
        tier: 2,
        cost: 10,
        requires: [],
        effects: [{ kind: "flag", flag: `${family.id}-${String(i)}` }],
      });
    }
    for (let i = 0; i < 3; i += 1) {
      nodes.push({
        id: `tech.${family.id}-t3-${String(i)}`,
        name: `${family.id} capstone ${String(i)}`,
        description: "-",
        family: family.id,
        kind: "intel",
        tier: 3,
        cost: 10,
        requires: [`tech.${family.id}-t2-0`],
        effects: [{ kind: "flag", flag: `${family.id}-cap-${String(i)}` }],
      });
    }
  }
  return new StaticTechCatalogue(nodes, [
    ...Object.values(TECH_FAMILIES),
    ...extra,
  ]);
}

/**
 * The layout's invariants for any catalogue and any number of
 * families, as a list of broken ones (empty when all hold): nodes on
 * their tier's ring, each inside its family's sector of 2π / n, links
 * from the core or the node's first placed prerequisite, and pedestals
 * clear of each other.
 */
function brokenInvariants(
  catalogue: TechCatalogue,
  layout: TechGraphLayout,
): string[] {
  const broken: string[] = [];
  const sector = (2 * Math.PI) / Math.max(1, layout.families.length);
  const spokes = new Map(
    layout.families.map((f) => [f.id, Math.atan2(f.z, f.x)]),
  );
  for (const node of layout.nodes) {
    const radius = Math.hypot(node.x, node.z);
    const ring = node.tier === 2 ? layout.rings.tier2 : layout.rings.tier3;
    if (Math.abs(radius - ring) > 0.01) {
      broken.push(
        `${node.id} is at ${String(radius)}, not on ring ${String(ring)}`,
      );
    }
    const spoke = spokes.get(node.familyId);
    if (spoke === undefined) {
      broken.push(`${node.id} has no family spoke`);
      continue;
    }
    let delta = Math.atan2(node.z, node.x) - spoke;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) >= sector / 2) {
      broken.push(`${node.id} is outside its family's sector`);
    }
  }
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const plinths = new Map(layout.families.map((f) => [f.id, f]));
  if (layout.edges.length !== layout.families.length + layout.nodes.length) {
    broken.push("an edge too many or too few");
  }
  for (const edge of layout.edges) {
    if (edge.nodeId === undefined) {
      if (edge.from.x !== 0 || edge.from.z !== 0) {
        broken.push("a family link does not start at the core");
      }
      continue;
    }
    const node = byId.get(edge.nodeId);
    if (!node) {
      broken.push(`an edge names ${edge.nodeId}, which is not placed`);
      continue;
    }
    const parent = catalogue
      .getNode(node.id)
      ?.requires.find((id) => byId.has(id));
    const from =
      parent === undefined ? plinths.get(node.familyId) : byId.get(parent);
    if (from?.x !== edge.from.x || from?.z !== edge.from.z) {
      broken.push(`${node.id} is not linked from its parent or family`);
    }
    if (edge.to.x !== node.x || edge.to.z !== node.z) {
      broken.push(`${node.id}'s link does not end on it`);
    }
  }
  for (const a of layout.nodes) {
    for (const b of layout.nodes) {
      if (a !== b && distance(a, b) < 2.9) {
        broken.push(`${a.id} vs ${b.id} too close`);
      }
      if (a !== b && a.tier === 2 && b.tier === 2 && distance(a, b) < 5.9) {
        broken.push(`${a.id} vs ${b.id} tier 2 too close`);
      }
    }
  }
  return broken;
}

describe("layoutTechGraph", () => {
  const layout = layoutTechGraph(CATALOGUE, NO_TECH_CONDITIONS);

  it("places every node once, every family once, and reaches past the outer ring", () => {
    expect(layout.nodes.map((n) => n.id).sort()).toEqual(
      TECH_NODES.map((n) => n.id).sort(),
    );
    expect(layout.families.map((f) => f.id)).toEqual(
      Object.values(TECH_FAMILIES).map((f) => f.id),
    );
    expect(layout.radius).toBe(
      layout.rings.tier3 + TECH_GRAPH_LAYOUT_TUNING.margin,
    );
  });

  it("lays the six pre-infantry families out on the tuned rings, exactly as before the rings could grow", () => {
    const six = layoutTechGraph(sixFamilyCatalogue(), NO_TECH_CONDITIONS);
    expect(six.families).toHaveLength(6);
    expect(six.rings).toEqual({
      family: TECH_GRAPH_LAYOUT_TUNING.familyRadius,
      tier2: TECH_GRAPH_LAYOUT_TUNING.tier2Radius,
      tier3: TECH_GRAPH_LAYOUT_TUNING.tier3Radius,
    });
    expect(six.radius).toBe(
      TECH_GRAPH_LAYOUT_TUNING.tier3Radius + TECH_GRAPH_LAYOUT_TUNING.margin,
    );
  });

  /**
   * The infantry family is the seventh (campaign arc §10.3): each sector
   * narrows to 2π / 7, and the rings grow just enough that four tier 2
   * nodes six apart still fit one, the tier 3 ring keeping its six
   * units beyond.
   *
   * ```
   *   family = 6 · 7 / 2π      ≈  6.68
   *   tier 2 = 4 · 6 · 7 / 2π  ≈ 26.74
   *   tier 3 = tier 2 + 6      ≈ 32.74
   * ```
   */
  it("grows the rings just enough for the shipped seven families", () => {
    expect(layout.families).toHaveLength(7);
    expect(layout.rings.family).toBeCloseTo(6.685, 3);
    expect(layout.rings.tier2).toBeCloseTo(26.738, 3);
    expect(layout.rings.tier3).toBeCloseTo(32.738, 3);
  });

  it("puts tier 2 on the inner ring and tier 3 on the outer, each inside its family's sector, linked from its family or prerequisite and clear of the others", () => {
    expect(brokenInvariants(CATALOGUE, layout)).toEqual([]);
  });

  it("carries each node's kind and its part ids", () => {
    const jump = layout.nodes.find((n) => n.id === "tech.jump-jets");
    expect(jump?.kind).toBe("part");
    expect(jump?.partIds).toEqual(["legs-jumper"]);
  });

  it("keeps the same invariants with three more families, growing the rings further to fit", () => {
    const more = crowdedCatalogue();
    const crowded = layoutTechGraph(more, NO_TECH_CONDITIONS);
    expect(crowded.families).toHaveLength(layout.families.length + 3);
    expect(crowded.nodes).toHaveLength(TECH_NODES.length + 3 * 7);
    expect(brokenInvariants(more, crowded)).toEqual([]);
    expect(crowded.rings.tier2).toBeGreaterThan(layout.rings.tier2);
    expect(crowded.rings.tier3 - crowded.rings.tier2).toBeCloseTo(
      TECH_GRAPH_LAYOUT_TUNING.tier3Radius -
        TECH_GRAPH_LAYOUT_TUNING.tier2Radius,
      5,
    );
    expect(crowded.radius).toBe(
      crowded.rings.tier3 + TECH_GRAPH_LAYOUT_TUNING.margin,
    );
  });

  it("is deterministic", () => {
    expect(layoutTechGraph(CATALOGUE, NO_TECH_CONDITIONS)).toEqual(layout);
  });
});

describe("layoutTechGraph with hidden nodes (ADR 0013 §2.7)", () => {
  const catalogue = conditionalTechCatalogue();
  const ids = (conditions: TechConditions) =>
    layoutTechGraph(catalogue, conditions)
      .nodes.map((n) => n.id)
      .sort();

  it("leaves hidden nodes, their links and a family with nothing to show out of the graph", () => {
    const fresh = layoutTechGraph(catalogue, NO_TECH_CONDITIONS);
    expect(fresh.nodes.map((n) => n.id).sort()).toEqual(
      [
        FX_FIELD_NOTES,
        FX_HEAVY_WEAPONS,
        FX_JUMP_JETS,
        FX_SPRINT_FRAME,
        FX_SQUAD_ARMOUR,
      ].sort(),
    );
    const linked = fresh.edges.flatMap((edge) =>
      edge.nodeId === undefined ? [] : [edge.nodeId],
    );
    expect(linked).not.toContain(FX_PHEROMONE_ANALYSIS);
    expect(linked).not.toContain(FX_POD_TELEMETRY);
    // Energy holds only the two intel nodes: no spoke until one shows.
    expect(fresh.families.map((f) => f.id)).toEqual([
      "mobility",
      "protection",
      "support",
    ]);
    expect(brokenInvariants(catalogue, fresh)).toEqual([]);
  });

  it("brings a node in with its flags, its family with it, and keeps the rest of the invariants", () => {
    expect(ids(withFlags(SPORE_SAMPLE))).toContain(FX_PHEROMONE_ANALYSIS);
    expect(ids(withFlags(SPORE_SAMPLE))).not.toContain(FX_POD_TELEMETRY);
    const all = layoutTechGraph(
      catalogue,
      withFlags(SPORE_SAMPLE, HIVE_CORE_SAMPLE),
    );
    expect(all.nodes).toHaveLength(7);
    expect(all.families.map((f) => f.id)).toEqual([
      "mobility",
      "protection",
      "energy",
      "support",
    ]);
    // Pod Telemetry hangs off Pheromone Analysis, not off the plinth.
    const pod = all.edges.find((edge) => edge.nodeId === FX_POD_TELEMETRY);
    const pheromone = all.nodes.find((n) => n.id === FX_PHEROMONE_ANALYSIS);
    expect(pod?.from).toEqual({ x: pheromone?.x, z: pheromone?.z });
    expect(brokenInvariants(catalogue, all)).toEqual([]);
  });

  it("gives a node with no part effect no part ids, and keeps its kind", () => {
    const notes = layoutTechGraph(catalogue, NO_TECH_CONDITIONS).nodes.find(
      (n) => n.id === FX_FIELD_NOTES,
    );
    expect(notes?.kind).toBe("story");
    expect(notes?.partIds).toEqual([]);
  });
});
