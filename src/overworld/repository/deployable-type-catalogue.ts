import type {
  DeployableType,
  DeployableTypeId,
} from "../model/deployable-type";
import type { DeployableTypeCatalogue } from "../model/deployable-type-catalogue";

// ===========================================
// DataDeployableTypeCatalogue
// ===========================================

/**
 * `DeployableTypeCatalogue` backed by an in-memory list of types, normally
 * the values of `DEPLOYABLE_TYPES` from `overworld/data/deployable-types.ts`.
 * Duplicate ids are a content bug and are rejected at construction.
 */
export class DataDeployableTypeCatalogue implements DeployableTypeCatalogue {
  // ===========================================
  // Fields
  // ===========================================

  private readonly byId: ReadonlyMap<DeployableTypeId, DeployableType>;
  private readonly ordered: readonly DeployableType[];

  // ===========================================
  // Construction
  // ===========================================

  /** Indexes the given types; throws if two share an id. */
  constructor(types: readonly DeployableType[]) {
    const byId = new Map<DeployableTypeId, DeployableType>();
    for (const type of types) {
      if (byId.has(type.id)) {
        throw new Error(`Duplicate deployable type id "${type.id}"`);
      }
      byId.set(type.id, type);
    }
    this.byId = byId;
    this.ordered = [...types];
  }

  // ===========================================
  // DeployableTypeCatalogue
  // ===========================================

  /** Returns the type with the given id, or `undefined` if unknown. */
  getDeployableType(id: DeployableTypeId): DeployableType | undefined {
    return this.byId.get(id);
  }

  /** Returns every type in the order they were supplied. */
  listDeployableTypes(): readonly DeployableType[] {
    return this.ordered;
  }
}
