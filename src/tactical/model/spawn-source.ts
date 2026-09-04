import type { BugUnitSource } from "./bug-unit-source";

// ===========================================
// Spawn source
// ===========================================

/**
 * What spawning reads from a bug species: everything the unit factory
 * needs plus the weight egg spawners and edge waves roll on. A structural
 * subset of `BugSpecies` (#322, `bugs/model`), declared here so
 * `tactical` never imports `bugs` data; the composition root passes the
 * shipped species list and the records satisfy it as they are.
 */
export interface SpawnSource extends BugUnitSource {
  /** Relative chance of being hatched; non-positive means never. */
  readonly hatchWeight: number;
}
