import type { PartId } from "../../roster/model/mech-part";
import type {
  TechFamilyId,
  TechNodeId,
  TechNodeKind,
  TechNodeTier,
} from "../../tech/model/tech-node";

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
  /** The ring it stands on: 2 inner, 3 outer. */
  readonly tier: TechNodeTier;
  /** What sort of research it is, so a scene can dress non-part nodes differently. */
  readonly kind: TechNodeKind;
  /**
   * The parts the node makes purchasable; the first one with a model is
   * the one drawn. Empty for a node with no part effect, which then
   * stands a generic module on its pedestal.
   */
  readonly partIds: readonly PartId[];
}

/**
 * The radii the layout actually used. They start at the tuning's and
 * grow when more families share the circle than the tuning was sized
 * for, so a family's nodes always fit its sector.
 */
export interface TechGraphRings {
  /** Distance of the family plinths from the core. */
  readonly family: number;
  /** Distance of the tier 2 ring from the core. */
  readonly tier2: number;
  /** Distance of the tier 3 ring from the core. */
  readonly tier3: number;
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
 * Only what the player can see is laid out: a hidden node (ADR 0013
 * §2.7) has no placement and no edge, and a family with nothing visible
 * has no plinth.
 *
 * `radius` is how far the graph reaches from the origin, so a camera
 * can bound and frame it without walking the placements.
 */
export interface TechGraphLayout {
  readonly nodes: readonly TechGraphNodePlacement[];
  readonly families: readonly TechGraphFamilyPlacement[];
  readonly edges: readonly TechGraphEdge[];
  /** The rings the nodes and plinths stand on. */
  readonly rings: TechGraphRings;
  readonly radius: number;
}
