import type { PartId } from "../../roster/model/mech-part";
import type { TechFamilyId, TechNodeId } from "../../tech/model/tech-node";

// ===========================================
// Types
// ===========================================

/** A point on the graph's ground plane, in world units. */
export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

/** Where one node stands, and what it shows there. */
export interface TechGraphNodePlacement extends GroundPoint {
  readonly id: TechNodeId;
  readonly familyId: TechFamilyId;
  readonly tier: 2 | 3;
  /** The parts the node makes purchasable; the first one is the one drawn. */
  readonly partIds: readonly PartId[];
}

/** Where one family's plinth stands. */
export interface TechGraphFamilyPlacement extends GroundPoint {
  readonly id: TechFamilyId;
  readonly name: string;
}

/**
 * One link of the graph. `nodeId` names the node at the far end, whose
 * status tints the link; the links from the core to the family plinths
 * have none and stay neutral.
 */
export interface TechGraphEdge {
  readonly from: GroundPoint;
  readonly to: GroundPoint;
  readonly nodeId?: TechNodeId;
}

/**
 * The tech tree laid out as a graph on the ground plane (#1171): the
 * core at the origin, a plinth per family around it, tier 2 nodes on a
 * ring beyond the plinths and tier 3 nodes on a ring beyond those, each
 * under the node it requires.
 *
 * ```
 *                 ·T3   ·T3
 *            ·T2      ·T2       ring 2 / 3: the nodes
 *         ▲ family plinth       ring 1: the families
 *     ·T2      ◆ core     ·T2
 *         ▲            ▲
 *            ·T2    ·T2
 *                 ·T3
 * ```
 *
 * `radius` is how far the graph reaches from the origin, so a camera
 * can bound and frame it without walking the placements.
 */
export interface TechGraphLayout {
  readonly nodes: readonly TechGraphNodePlacement[];
  readonly families: readonly TechGraphFamilyPlacement[];
  readonly edges: readonly TechGraphEdge[];
  readonly radius: number;
}
