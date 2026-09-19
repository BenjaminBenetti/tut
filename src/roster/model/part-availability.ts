import type { PartId } from "./mech-part";

/**
 * Whether a catalogue part may be bought right now. The roster asks this
 * when a mech is built and the bay asks it to close a card; who answers
 * is the tech tree (#1171), but the roster depends only on the question
 * (architecture §2, dependency inversion).
 */
export interface PartAvailability {
  /** True when a mech may be built with this part today. */
  isAvailable(id: PartId): boolean;
}

/** The availability every campaign had before the tree: everything for credits. */
export const ALL_PARTS_AVAILABLE: PartAvailability = {
  isAvailable: () => true,
};
