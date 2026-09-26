import type { TechCatalogue } from "../../tech/model/tech-catalogue";
import type { TechConditions } from "../../tech/model/tech-conditions";
import { partIdsOf } from "../../tech/model/tech-effect";
import type {
  TechFamily,
  TechNode,
  TechNodeId,
} from "../../tech/model/tech-node";
import { isTechNodeHidden } from "../../tech/service/tech-status-service";
import type {
  GroundPoint,
  TechGraphEdge,
  TechGraphFamilyPlacement,
  TechGraphLayout,
  TechGraphNodePlacement,
  TechGraphRings,
} from "../model/tech-graph-layout";

// ===========================================
// Types
// ===========================================

/** The rings and spacings the radial layout is built from. */
export interface TechGraphLayoutTuning {
  /** Least distance of the family plinths from the core. */
  readonly familyRadius: number;
  /** Least distance of the tier 2 ring from the core. */
  readonly tier2Radius: number;
  /** Least distance of the tier 3 ring from the core; its gap to tier 2 is kept as the rings grow. */
  readonly tier3Radius: number;
  /** Arc length between neighbouring tier 2 nodes of one family, and the least gap to the next family's. */
  readonly tier2Spacing: number;
  /** Arc length between the tier 3 children of one tier 2 node. */
  readonly tier3Spacing: number;
  /** Least arc length between neighbouring family plinths. */
  readonly familySpacing: number;
  /** Ground the graph claims beyond the outer ring, for framing. */
  readonly margin: number;
}

// ===========================================
// Constants
// ===========================================

/**
 * Tuned so that with six families, four tier 2 nodes on a family's
 * sector sit clear of the next family's at the same spacing they sit
 * from each other: a sector is 2π · 24 / 6 ≈ 25 units of arc, the four
 * nodes span 18 of it, and 7 remain to the neighbouring family. Tier 3
 * keeps a ring of its own 6 units further out, where two children of
 * one node sit 3 apart and 4.5 from the next node's children.
 *
 * The radii are floors, not fixed: with more families (intel,
 * xenobiology and infantry are coming, ADR 0013) each sector narrows,
 * and the rings grow just enough that the widest family still fits its
 * sector at these spacings. Six families of the shipped tree need no
 * growth, so they lay out exactly as before.
 *
 * The tier 2 spacing was 3 on a ring of 12; the Executive Director
 * found that tight and asked for twice the gap (#1171).
 */
export const TECH_GRAPH_LAYOUT_TUNING: TechGraphLayoutTuning = {
  familyRadius: 6,
  tier2Radius: 24,
  tier3Radius: 30,
  tier2Spacing: 6,
  tier3Spacing: 3,
  familySpacing: 6,
  margin: 3,
};

/** The first family sits straight "up" the ground plane from the core. */
const FIRST_FAMILY_ANGLE = -Math.PI / 2;

// ===========================================
// Layout
// ===========================================

/**
 * Lays the visible part of the catalogue's tree out as a radial graph
 * (#1171): families are spokes at equal angles, a family's tier 2 nodes
 * are spread along its spoke's arc at `tier2Spacing`, and each tier 3
 * node is spread about its first prerequisite's angle at
 * `tier3Spacing`. A tier 3 node with no visible prerequisite in the
 * graph hangs off the family's own angle.
 *
 * Hidden nodes (ADR 0013 §2.7) are filtered out first, so they get no
 * placement and no edge, and a family left with nothing to show gets no
 * spoke: the families that remain share the circle. Any number of
 * families works; see `ringsFor`.
 *
 * ```
 *   catalogue ──► drop hidden nodes ──► drop empty families ──► rings for n spokes ──► place
 * ```
 *
 * Pure over the catalogue and the conditions: the same tree with the
 * same flags always lays out the same way, so the graph looks the same
 * on every visit.
 *
 * @param catalogue - The tree to lay out.
 * @param conditions - The campaign's flags, which decide what is hidden.
 * @param tuning - Rings and spacings.
 * @returns Every placement, every link, the rings used and the graph's reach.
 */
export function layoutTechGraph(
  catalogue: TechCatalogue,
  conditions: TechConditions,
  tuning: TechGraphLayoutTuning = TECH_GRAPH_LAYOUT_TUNING,
): TechGraphLayout {
  const nodes = catalogue
    .listNodes()
    .filter((node) => !isTechNodeHidden(node, conditions));
  const families = catalogue
    .listFamilies()
    .filter((family) => nodes.some((node) => node.family === family.id));
  const rings = ringsFor(families, nodes, tuning);
  const angleOf = new Map<TechNodeId, number>();
  const placements: TechGraphNodePlacement[] = [];
  const plinths: TechGraphFamilyPlacement[] = [];
  const edges: TechGraphEdge[] = [];
  const core: GroundPoint = { x: 0, z: 0 };

  families.forEach((family, index) => {
    const familyAngle =
      FIRST_FAMILY_ANGLE + (index * 2 * Math.PI) / Math.max(1, families.length);
    const plinth = onRing(rings.family, familyAngle);
    plinths.push({ id: family.id, name: family.name, ...plinth });
    edges.push({ from: core, to: plinth });

    const tier2 = nodes.filter(
      (node) => node.family === family.id && node.tier === 2,
    );
    spread(tier2, familyAngle, tuning.tier2Spacing / rings.tier2).forEach(
      (angle, i) => {
        const node = tier2[i];
        if (node === undefined) {
          return;
        }
        angleOf.set(node.id, angle);
        const at = onRing(rings.tier2, angle);
        placements.push(placement(node, at));
        edges.push({ from: plinth, to: at, nodeId: node.id });
      },
    );

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
        parent === undefined ? plinth : onRing(rings.tier2, parentAngle);
      spread(siblings, parentAngle, tuning.tier3Spacing / rings.tier3).forEach(
        (angle, i) => {
          const node = siblings[i];
          if (node === undefined) {
            return;
          }
          angleOf.set(node.id, angle);
          const at = onRing(rings.tier3, angle);
          placements.push(placement(node, at));
          edges.push({ from, to: at, nodeId: node.id });
        },
      );
    }
  });

  return {
    nodes: placements,
    families: plinths,
    edges,
    rings,
    radius: rings.tier3 + tuning.margin,
  };
}

/**
 * The rings for `families` sharing the circle. Each family owns a
 * sector of `2π / n`; a ring's radius is its tuned floor, or whatever
 * lets the widest family's nodes on that ring fit their sector with one
 * spacing to spare for the gap to the next family, whichever is larger.
 * The tier 3 ring keeps its tuned distance beyond tier 2.
 *
 * ```
 *   sector θ = 2π / n
 *   family  = max(familyRadius, familySpacing / θ)
 *   tier 2  = max(tier2Radius,  widest tier 2 · tier2Spacing / θ)
 *   tier 3  = max(tier 2 + (tier3Radius − tier2Radius), widest tier 3 · tier3Spacing / θ)
 * ```
 */
function ringsFor(
  families: readonly TechFamily[],
  nodes: readonly TechNode[],
  tuning: TechGraphLayoutTuning,
): TechGraphRings {
  const sector = (2 * Math.PI) / Math.max(1, families.length);
  const widest = (tier: 2 | 3): number =>
    Math.max(
      0,
      ...families.map(
        (family) =>
          nodes.filter(
            (node) => node.family === family.id && node.tier === tier,
          ).length,
      ),
    );
  const tier2 = Math.max(
    tuning.tier2Radius,
    (widest(2) * tuning.tier2Spacing) / sector,
  );
  return {
    family: Math.max(tuning.familyRadius, tuning.familySpacing / sector),
    tier2,
    tier3: Math.max(
      tier2 + (tuning.tier3Radius - tuning.tier2Radius),
      (widest(3) * tuning.tier3Spacing) / sector,
    ),
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
    kind: node.kind,
    partIds: partIdsOf(node),
    x: at.x,
    z: at.z,
  };
}

/** Three decimals: enough to place a pedestal, few enough to compare in a test. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
