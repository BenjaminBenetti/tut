import { stepGridPos } from "../../core/service/grid-math";
import type { MapDraft } from "../model/map-draft";
import { columnKey, isPassableGround } from "./draft-queries";

// ===========================================
// UnionFind
// ===========================================

/** Disjoint sets over integer keys with path compression. */
export class UnionFind {
  // ===========================================
  // Fields
  // ===========================================

  private readonly parent = new Map<number, number>();

  // ===========================================
  // Public Methods
  // ===========================================

  /** Registers a key as its own set. */
  add(key: number): void {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
    }
  }

  /** Representative of the key's set. */
  find(key: number): number {
    let root = key;
    while ((this.parent.get(root) ?? root) !== root) {
      root = this.parent.get(root) ?? root;
    }
    let current = key;
    while (current !== root) {
      const next = this.parent.get(current) ?? root;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  /** Merges the two sets. */
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent.set(ra, rb);
    }
  }

  /** Number of distinct sets. */
  count(): number {
    return this.sizes().size;
  }

  /** Size of every set keyed by its representative. */
  sizes(): Map<number, number> {
    const sizes = new Map<number, number>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      sizes.set(root, (sizes.get(root) ?? 0) + 1);
    }
    return sizes;
  }
}

// ===========================================
// Ground components
// ===========================================

/** Passable exterior ground columns and how they connect. */
export interface GroundComponents {
  /** Column keys of every node. */
  readonly nodes: ReadonlySet<number>;
  /** Live union-find; callers may keep merging (the ramp pass does). */
  readonly components: UnionFind;
}

/**
 * Groups flat exterior ground and man-made ramps for deploy placement.
 * Natural wedges are excluded to preserve the existing seed selection
 * through the layer conversion; the ramp pass joins their endpoints too.
 * Actual traversal, including free half steps, uses ReachabilityService.
 */
export function buildGroundComponents(draft: MapDraft): GroundComponents {
  const nodes = new Set<number>();
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (isPassableGround(draft, x, z)) {
        nodes.add(columnKey(draft, x, z));
      }
    }
  }
  const components = new UnionFind();
  for (const key of nodes) {
    components.add(key);
  }
  for (const key of nodes) {
    const x = key % draft.width;
    const z = Math.floor(key / draft.width);
    const here = draft.groundCoord(x, z);
    for (const direction of ["e", "s"] as const) {
      const next = stepGridPos(here, direction);
      if (!draft.inBounds(next.x, next.z)) {
        continue;
      }
      const nextKey = columnKey(draft, next.x, next.z);
      // A one-layer step is a free walk (ADR 0008 §2.3), so it joins the
      // components exactly as flat ground does; two or more layers is a
      // cliff until a connector crosses it.
      if (
        nodes.has(nextKey) &&
        Math.abs(draft.groundLevelAt(next.x, next.z) - here.y) <= 1 &&
        draft.wallAt(here, direction) === undefined
      ) {
        components.union(key, nextKey);
      }
    }
  }
  for (const connector of draft.connectors) {
    if (connector.kind !== "ramp") {
      continue;
    }
    const a = columnKey(draft, connector.from.x, connector.from.z);
    const b = columnKey(draft, connector.to.x, connector.to.z);
    if (nodes.has(a) && nodes.has(b)) {
      components.union(a, b);
    }
  }
  return { nodes, components };
}

/**
 * Representative of the largest ground component, or undefined when the
 * map has no passable ground at all.
 */
export function largestGroundComponent(
  ground: GroundComponents,
): number | undefined {
  let best: number | undefined;
  let bestSize = 0;
  for (const [root, size] of ground.components.sizes()) {
    if (size > bestSize) {
      best = root;
      bestSize = size;
    }
  }
  return best;
}
