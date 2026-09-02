import type { SquadType, SquadTypeId } from "../model/squad-type";
import type { SquadTypeCatalogue } from "../model/squad-type-catalogue";

// ===========================================
// DataSquadTypeCatalogue
// ===========================================

/**
 * `SquadTypeCatalogue` backed by an in-memory list of types, normally
 * `SQUAD_TYPES` from `roster/data/squad-types.ts`. Duplicate ids are a
 * content bug and are rejected at construction.
 */
export class DataSquadTypeCatalogue implements SquadTypeCatalogue {
  // ===========================================
  // Fields
  // ===========================================

  private readonly byId: ReadonlyMap<SquadTypeId, SquadType>;
  private readonly ordered: readonly SquadType[];

  // ===========================================
  // Construction
  // ===========================================

  /** Indexes the given types; throws if two share an id. */
  constructor(types: readonly SquadType[]) {
    const byId = new Map<SquadTypeId, SquadType>();
    for (const type of types) {
      if (byId.has(type.id)) {
        throw new Error(`Duplicate squad type id "${type.id}"`);
      }
      byId.set(type.id, type);
    }
    this.byId = byId;
    this.ordered = [...types];
  }

  // ===========================================
  // SquadTypeCatalogue
  // ===========================================

  /** Returns the type with the given id, or `undefined` if unknown. */
  getSquadType(id: SquadTypeId): SquadType | undefined {
    return this.byId.get(id);
  }

  /** Returns every type in the order they were supplied. */
  listSquadTypes(): readonly SquadType[] {
    return this.ordered;
  }
}
