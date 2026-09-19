import type { TechCatalogue } from "../../tech/model/tech-catalogue";
import type { TechNode, TechNodeId } from "../../tech/model/tech-node";
import type {
  GroundPoint,
  TechGraphEdge,
  TechGraphFamilyPlacement,
  TechGraphLayout,
  TechGraphNodePlacement,
} from "../model/tech-graph-layout";

// ===========================================
// Types
// ===========================================

/** The rings and spacings the radial layout is built from. */
export interface TechGraphLayoutTuning {
  /** Distance of the family plinths from the core. */
  readonly familyRadius: number;
  /** Distance of the tier 2 ring from the core. */
  readonly tier2Radius: number;
  /** Distance of the tier 3 ring from the core. */
  readonly tier3Radius: number;
  /** Arc length between neighbouring tier 2 nodes of one family. */
  readonly tier2Spacing: number;
  /** Arc length between the tier 3 children of one tier 2 node. */
  readonly tier3Spacing: number;
  /** Ground the graph claims beyond the outer ring, for framing. */
  readonly margin: number;
}

// ===========================================
// Constants
// ===========================================

/**
 * Tuned so that with six families, four tier 2 nodes on a family's
 * sector sit clear of the next family's, and two tier 3 children of
 * one node sit clear of their neighbour's: at these radii the closest
 * pair of nodes on either ring is 3 units apart, which at the starting
 * zoom is room for a label beside a label.
 */
export const TECH_GRAPH_LAYOUT_TUNING: TechGraphLayoutTuning = {
  familyRadius: 6,
  tier2Radius: 12,
  tier3Radius: 18,
  tier2Spacing: 3,
  tier3Spacing: 3,
  margin: 3,
};

/** The first family sits straight "up" the ground plane from the core. */
const FIRST_FAMILY_ANGLE = -Math.PI / 2;

// ===========================================
// Layout
// ===========================================

/**
 * Lays the catalogue's tree out as a radial graph (#1171): families are
 * spokes at equal angles, a family's tier 2 nodes are spread along its
 * spoke's arc at `tier2Spacing`, and each tier 3 node is spread about
 * its first prerequisite's angle at `tier3Spacing`. A tier 3 node with
 * no prerequisite in its family hangs off the family's own angle.
 *
 * Pure over the catalogue: the same tree always lays out the same way,
 * so the graph looks the same on every visit.
 *
 * @param catalogue - The tree to lay out.
 * @param tuning - Rings and spacings.
 * @returns Every placement, every link and the graph's reach.
 */
export function layoutTechGraph(
  catalogue: TechCatalogue,
  tuning: TechGraphLayoutTuning = TECH_GRAPH_LAYOUT_TUNING,
): TechGraphLayout {
  const families = catalogue.listFamilies();
  const nodes = catalogue.listNodes();
  const angleOf = new Map<TechNodeId, number>();
  const placements: TechGraphNodePlacement[] = [];
  const plinths: TechGraphFamilyPlacement[] = [];
  const edges: TechGraphEdge[] = [];
  const core: GroundPoint = { x: 0, z: 0 };

  families.forEach((family, index) => {
    const familyAngle =
      FIRST_FAMILY_ANGLE + (index * 2 * Math.PI) / Math.max(1, families.length);
    const plinth = onRing(tuning.familyRadius, familyAngle);
    plinths.push({ id: family.id, name: family.name, ...plinth });
    edges.push({ from: core, to: plinth });

    const tier2 = nodes.filter(
      (node) => node.family === family.id && node.tier === 2,
    );
    spread(
      tier2,
      familyAngle,
      tuning.tier2Spacing / tuning.tier2Radius,
    ).forEach((angle, i) => {
      const node = tier2[i];
      if (node === undefined) {
        return;
      }
      angleOf.set(node.id, angle);
      const at = onRing(tuning.tier2Radius, angle);
      placements.push(placement(node, at));
      edges.push({ from: plinth, to: at, nodeId: node.id });
    });

    const tier3 = nodes.filter(
      (node) => node.family === family.id && node.tier === 3,
    );
    const byParent = new Map<TechNodeId | undefined, TechNode[]>();
    for (const node of tier3) {
      const parent = node.requires.find((id) => angleOf.has(id));
      const siblings = byParent.get(parent) ?? [];
      siblings.push(node);
      byParent.set(parent, siblings);
    }
    for (const [parent, siblings] of byParent) {
      const parentAngle =
        parent === undefined
          ? familyAngle
          : (angleOf.get(parent) ?? familyAngle);
      const from =
        parent === undefined ? plinth : onRing(tuning.tier2Radius, parentAngle);
      spread(
        siblings,
        parentAngle,
        tuning.tier3Spacing / tuning.tier3Radius,
      ).forEach((angle, i) => {
        const node = siblings[i];
        if (node === undefined) {
          return;
        }
        angleOf.set(node.id, angle);
        const at = onRing(tuning.tier3Radius, angle);
        placements.push(placement(node, at));
        edges.push({ from, to: at, nodeId: node.id });
      });
    }
  });

  return {
    nodes: placements,
    families: plinths,
    edges,
    radius: tuning.tier3Radius + tuning.margin,
  };
}

// ===========================================
// Helpers
// ===========================================

/** The angles of `items` centred on `centre`, `step` radians apart. */
function spread(
  items: readonly unknown[],
  centre: number,
  step: number,
): number[] {
  const offset = (items.length - 1) / 2;
  return items.map((_, i) => centre + (i - offset) * step);
}

/** The ground point `radius` from the origin at `angle`. */
function onRing(radius: number, angle: number): GroundPoint {
  return {
    x: round(radius * Math.cos(angle)),
    z: round(radius * Math.sin(angle)),
  };
}

/** A node's placement at `at`. */
function placement(node: TechNode, at: GroundPoint): TechGraphNodePlacement {
  return {
    id: node.id,
    familyId: node.family,
    tier: node.tier,
    partIds: node.unlocks,
    x: at.x,
    z: at.z,
  };
}

/** Three decimals: enough to place a pedestal, few enough to compare in a test. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
