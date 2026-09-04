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
 * The lookup itself is core's `Registry` (#108); this class is the
 * roster's vocabulary over it, so callers ask for a squad type rather
 * than for a definition and never learn how it is stored.
 */
export class DataSquadTypeCatalogue implements SquadTypeCatalogue {
  // ===========================================
  // Fields
  // ===========================================

  private readonly registry: Registry<SquadType>;

  // ===========================================
  // Construction
  // ===========================================

  /** Indexes the given types; throws if two share an id. */
  constructor(types: readonly SquadType[]) {
    this.registry = createRegistry("squad type", types);
  }

  // ===========================================
  // SquadTypeCatalogue
  // ===========================================

  /** Returns the type with the given id, or `undefined` if unknown. */
  getSquadType(id: SquadTypeId): SquadType | undefined {
    return this.registry.find(id);
  }

  /** Returns every type in the order they were supplied. */
  listSquadTypes(): readonly SquadType[] {
    return this.registry.values;
  }
}
