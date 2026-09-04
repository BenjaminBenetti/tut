import type { Registry } from "../../core/model/registry";
import { createRegistry } from "../../core/service/definition-registry";
import type { SquadType, SquadTypeId } from "../model/squad-type";
import type { SquadTypeCatalogue } from "../model/squad-type-catalogue";

// ===========================================
// DataSquadTypeCatalogue
// ===========================================

/**
 * `SquadTypeCatalogue` backed by an in-memory list of types, normally
 * `SQUAD_TYPES` from `roster/data/squad-types.ts`. Duplicate ids are a
 * content bug and are rejected at construction.
 *
 * The indexing is `core`'s `Registry` (#108); this class stays as the
 * domain's own facade, so the roster asks for squad types by name and
 * never learns the generic vocabulary. The registry's label is
 * `squad type`, which keeps the message a duplicate raises identical to
 * the one this threw before.
 */
export class DataSquadTypeCatalogue implements SquadTypeCatalogue {
  // ===========================================
  // Fields
  // ===========================================

  private readonly types: Registry<SquadType>;

  // ===========================================
  // Construction
  // ===========================================

  /** Indexes the given types; throws if two share an id. */
  constructor(types: readonly SquadType[]) {
    this.types = createRegistry("squad type", types);
  }

  // ===========================================
  // SquadTypeCatalogue
  // ===========================================

  /** Returns the type with the given id, or `undefined` if unknown. */
  getSquadType(id: SquadTypeId): SquadType | undefined {
    return this.types.find(id);
  }

  /** Returns every type in the order they were supplied. */
  listSquadTypes(): readonly SquadType[] {
    return this.types.values;
  }
}
