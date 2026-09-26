import type {
  HookRequirement,
  MapArchetype,
  MapDimensions,
} from "./map-recipe";

// ===========================================
// Archetype recipe defaults
// ===========================================

/**
 * The board and hooks an archetype is built for when nothing more
 * specific asks (#1179): the preview harness falls back on them, so a
 * hive cavern opens on its long 64 × 144 board with a hive core rather
 * than on a settlement preset with a settlement's hooks.
 */
export interface ArchetypeRecipeDefaults {
  readonly size: MapDimensions;
  readonly hooks: readonly HookRequirement[];
}

/** Defaults per archetype; an archetype absent here uses the caller's own. */
export type ArchetypeRecipeDefaultsTable = Readonly<
  Partial<Record<MapArchetype, ArchetypeRecipeDefaults>>
>;
