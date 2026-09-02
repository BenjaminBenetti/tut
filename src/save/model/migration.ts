/**
 * A single forward step in the save schema. Migrations operate on
 * untyped data because, by definition, the old shape no longer has a
 * type in the codebase. Each step must be pure and total for any
 * envelope of version `from`.
 */
export interface Migration {
  readonly from: number;
  readonly to: number;
  /** Returns the state reshaped to version `to`. Must not mutate its input. */
  apply(state: unknown): unknown;
}
