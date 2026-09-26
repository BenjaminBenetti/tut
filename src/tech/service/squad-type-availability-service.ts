import type { SquadTypeId } from "../../roster/model/squad-type";
import type { SquadTypeAvailability } from "../../roster/model/squad-type-availability";
import type { TechCatalogue } from "../model/tech-catalogue";
import { squadTypeIdsOf } from "../model/tech-effect";
import type { TechNode } from "../model/tech-node";
import type { TechState } from "../model/tech-state";

// ===========================================
// Gated and unlocked types
// ===========================================

/**
 * Every squad type some node of the tree opens (campaign arc §10.3):
 * the types that need research before they can be hired. A type no node
 * names is not gated.
 *
 * @param catalogue - The tech tree.
 * @returns The ids of every squad-type effect in the tree.
 */
export function gatedSquadTypeIds(
  catalogue: TechCatalogue,
): ReadonlySet<SquadTypeId> {
  const ids = new Set<SquadTypeId>();
  for (const node of catalogue.listNodes()) {
    for (const typeId of squadTypeIdsOf(node)) {
      ids.add(typeId);
    }
  }
  return ids;
}

/**
 * Every squad type the squad-type effects of the unlocked nodes of
 * `tech` open; an unknown node opens none.
 *
 * @param catalogue - The tech tree.
 * @param tech - What the campaign has researched.
 * @returns The ids of the opened types.
 */
export function unlockedSquadTypeIds(
  catalogue: TechCatalogue,
  tech: TechState,
): ReadonlySet<SquadTypeId> {
  const ids = new Set<SquadTypeId>();
  for (const nodeId of tech.unlocked) {
    const node = catalogue.getNode(nodeId);
    if (node === undefined) {
      continue;
    }
    for (const typeId of squadTypeIdsOf(node)) {
      ids.add(typeId);
    }
  }
  return ids;
}

// ===========================================
// Availability
// ===========================================

/**
 * The roster's `SquadTypeAvailability` as the tech tree decides it
 * (campaign arc §10.3, D8), mirroring `createPartAvailability`: a type
 * no node names is always for hire, as every type was before the
 * infantry branch, and a type some node names is for hire once one such
 * node is unlocked. Whether the type exists is the catalogue's question,
 * which the hire answers first.
 *
 * ```
 *   isAvailable(id) = id ∉ gated(tree)  ∨  id ∈ squadTypeIdsOf(unlocked nodes)
 * ```
 *
 * @param catalogue - The tech tree.
 * @param tech - What the campaign has researched.
 * @returns The availability the hire and the hire picker ask.
 */
export function createSquadTypeAvailability(
  catalogue: TechCatalogue,
  tech: TechState,
): SquadTypeAvailability {
  const gated = gatedSquadTypeIds(catalogue);
  const unlocked = unlockedSquadTypeIds(catalogue, tech);
  return {
    isAvailable: (id) => !gated.has(id) || unlocked.has(id),
  };
}

/**
 * Every squad type the campaign cannot hire yet, with the first node of
 * the tree that would open it, for a hire picker to lock the type and
 * say what to research (the mech bay does the same for parts). Empty
 * once every gated type is open.
 *
 * @param catalogue - The tech tree.
 * @param tech - What the campaign has researched.
 * @returns Each locked type's id, mapped to the node that opens it.
 */
export function lockedSquadTypes(
  catalogue: TechCatalogue,
  tech: TechState,
): ReadonlyMap<SquadTypeId, TechNode> {
  const availability = createSquadTypeAvailability(catalogue, tech);
  const locked = new Map<SquadTypeId, TechNode>();
  for (const node of catalogue.listNodes()) {
    for (const typeId of squadTypeIdsOf(node)) {
      if (!availability.isAvailable(typeId) && !locked.has(typeId)) {
        locked.set(typeId, node);
      }
    }
  }
  return locked;
}
