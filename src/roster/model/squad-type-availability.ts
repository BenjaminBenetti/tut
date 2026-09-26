import type { SquadTypeId } from "./squad-type";

// ===========================================
// Squad type availability
// ===========================================

/**
 * Whether a squad type may be hired right now (campaign arc §10.3, D8).
 * The roster asks it when a squad is hired and the hire picker asks it
 * to lock an option; who answers is the tech tree, but the roster
 * depends only on the question, as it does for parts
 * (`PartAvailability`, architecture §2).
 */
export interface SquadTypeAvailability {
  /** True when a squad of this type may be hired today. */
  isAvailable(id: SquadTypeId): boolean;
}

/** The availability every campaign had before the infantry branch: every type for credits. */
export const ALL_SQUAD_TYPES_AVAILABLE: SquadTypeAvailability = {
  isAvailable: () => true,
};
