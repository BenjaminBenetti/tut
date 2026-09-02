import type { Identified, Registry } from "../model/registry";

// ===========================================
// DefinitionRegistry
// ===========================================

/**
 * Immutable map-backed `Registry`. Built once from a definition list;
 * duplicate ids are a data error and throw at construction.
 */
export class DefinitionRegistry<T extends Identified> implements Registry<T> {
  // ===========================================
  // Fields
  // ===========================================

  readonly ids: readonly string[];
  readonly values: readonly T[];
  private readonly label: string;
  private readonly byId: ReadonlyMap<string, T>;

  // ===========================================
  // Construction
  // ===========================================

  /**
   * Creates a registry named `label` (used in error messages, e.g.
   * `surface`) over the given definitions.
   */
  constructor(label: string, definitions: readonly T[]) {
    const byId = new Map<string, T>();
    for (const definition of definitions) {
      if (byId.has(definition.id)) {
        throw new Error(`Duplicate ${label} id "${definition.id}"`);
      }
      byId.set(definition.id, definition);
    }
    this.label = label;
    this.byId = byId;
    this.ids = [...byId.keys()];
    this.values = [...byId.values()];
  }

  // ===========================================
  // Registry
  // ===========================================

  /** Returns the definition or throws naming the registry and id. */
  get(id: string): T {
    const definition = this.byId.get(id);
    if (definition === undefined) {
      throw new Error(`Unknown ${this.label} id "${id}"`);
    }
    return definition;
  }

  /** Returns the definition or `undefined`. */
  find(id: string): T | undefined {
    return this.byId.get(id);
  }

  /** True when the id is registered. */
  has(id: string): boolean {
    return this.byId.has(id);
  }
}

/**
 * Convenience factory so callers depend on the `Registry` interface rather
 * than the class.
 */
export function createRegistry<T extends Identified>(
  label: string,
  definitions: readonly T[],
): Registry<T> {
  return new DefinitionRegistry(label, definitions);
}
