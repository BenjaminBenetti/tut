import type { SquadType, SquadTypeId } from "./squad-type";

/**
 * Read-only lookup of squad types. Services (hiring, auto-resolve) depend
 * on this interface rather than on the data module so tests can supply
 * a small fixture catalogue and content can be swapped without touching
 * logic.
 */
export interface SquadTypeCatalogue {
  /** Returns the type with the given id, or `undefined` if unknown. */
  getSquadType(id: SquadTypeId): SquadType | undefined;

  /** Returns every type in catalogue order. */
  listSquadTypes(): readonly SquadType[];
}
