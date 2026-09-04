import type { Registry } from "../../core/model/registry";
import { createRegistry } from "../../core/service/definition-registry";
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

  private readonly types: Registry<DeployableType>;

  // ===========================================
  // Construction
  // ===========================================

  /** Indexes the given types; throws if two share an id. */
  constructor(types: readonly DeployableType[]) {
    this.types = createRegistry("deployable type", types);
  }

  // ===========================================
  // DeployableTypeCatalogue
  // ===========================================

  /** Returns the type with the given id, or `undefined` if unknown. */
  getDeployableType(id: DeployableTypeId): DeployableType | undefined {
    return this.types.find(id);
  }

  /** Returns every type in the order they were supplied. */
  listDeployableTypes(): readonly DeployableType[] {
    return this.types.values;
  }
}
