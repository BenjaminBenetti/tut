import type { DeployableType, DeployableTypeId } from "./deployable-type";

/**
 * Read-only lookup of deployable types. Services (effects, upkeep, the
 * build command) depend on this interface rather than on the data module
 * so tests can supply a small fixture catalogue and content can be
 * swapped without touching logic (ADR 0003 §2.5).
 */
export interface DeployableTypeCatalogue {
  /** Returns the type with the given id, or `undefined` if unknown. */
  getDeployableType(id: DeployableTypeId): DeployableType | undefined;

  /** Returns every type in catalogue order. */
  listDeployableTypes(): readonly DeployableType[];
}
