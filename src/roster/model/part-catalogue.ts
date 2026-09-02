import type { MechPart, PartForSlot, PartId, PartSlot } from "./mech-part";

/**
 * Read-only lookup over the part definitions a campaign knows about.
 * Services depend on this interface; the app decides which parts back it.
 */
export interface PartCatalogue {
  /** Returns the part with the given id, or undefined when the id is unknown. */
  getPart(id: PartId): MechPart | undefined;

  /** Returns every part that fits the given slot, in catalogue order. */
  partsForSlot<S extends PartSlot>(slot: S): readonly PartForSlot<S>[];
}
