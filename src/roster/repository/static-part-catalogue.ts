import type { Registry } from "../../core/model/registry";
import { createRegistry } from "../../core/service/definition-registry";
import type {
  MechPart,
  PartForSlot,
  PartId,
  PartSlot,
} from "../model/mech-part";
import type { PartCatalogue } from "../model/part-catalogue";

// ===========================================
// Constants
// ===========================================

const NO_PARTS: readonly MechPart[] = [];

// ===========================================
// StaticPartCatalogue
// ===========================================

/**
 * `PartCatalogue` over a fixed list of part definitions, indexed once at
 * construction. Back it with `STARTER_PARTS` for a campaign, or a
 * hand-built list in tests.
 */
export class StaticPartCatalogue implements PartCatalogue {
  // ===========================================
  // Fields
  // ===========================================

  private readonly parts: Registry<MechPart>;
  private readonly bySlot: ReadonlyMap<PartSlot, readonly MechPart[]>;

  // ===========================================
  // Construction
  // ===========================================

  /** Indexes the parts. Throws when two parts share an id, since that is a content bug. */
  constructor(parts: readonly MechPart[]) {
    // The registry owns the id index and the duplicate check; the slot
    // index is this catalogue's own, since nothing generic knows that a
    // part belongs to a slot.
    this.parts = createRegistry("part", parts);
    const bySlot = new Map<PartSlot, MechPart[]>();
    for (const part of this.parts.values) {
      const slotParts = bySlot.get(part.slot);
      if (slotParts === undefined) {
        bySlot.set(part.slot, [part]);
      } else {
        slotParts.push(part);
      }
    }
    this.bySlot = bySlot;
  }

  // ===========================================
  // PartCatalogue
  // ===========================================

  /** Looks a part up by id. */
  getPart(id: PartId): MechPart | undefined {
    return this.parts.find(id);
  }

  /** Lists the parts indexed under a slot, in the order they were given. */
  partsForSlot<S extends PartSlot>(slot: S): readonly PartForSlot<S>[] {
    // Parts are bucketed by their own `slot`, so every entry is a PartForSlot<S>.
    return (this.bySlot.get(slot) ?? NO_PARTS) as readonly PartForSlot<S>[];
  }
}
