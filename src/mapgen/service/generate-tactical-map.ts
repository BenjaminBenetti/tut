import type { Rng } from "../../core/model/rng";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import type { GenerationDiagnostics } from "../model/diagnostics";
import type { MapRecipe } from "../model/map-recipe";
import type { MapGenRegistries } from "../model/registries";
import type { TacticalMap } from "../model/tactical-map";
import { createDefaultRegistries } from "./default-registries";
import { freezeDraft } from "./draft-freezer";
import type { Violation } from "./map-validator";
import { validateTacticalMap } from "./map-validator";
import type { PipelineOptions } from "./pipeline-map-generator";
import { createPipeline } from "./settlement-pipeline";

// ===========================================
// Types
// ===========================================

/** Injection points; every field has a production default. */
export interface GenerateOptions extends PipelineOptions {
  /** Data registries; defaults to the shipped data. */
  readonly registries?: MapGenRegistries;
  /** Root RNG; defaults to mulberry32 seeded from `hashSeed(recipe.seed)`. */
  readonly rng?: Rng;
}

/** A generated map with what the passes reported along the way. */
export interface GeneratedMap {
  readonly map: TacticalMap;
  readonly diagnostics: GenerationDiagnostics;
}

/** Thrown when a generated map breaks an invariant: a generator bug. */
export class MapGenerationError extends Error {
  readonly violations: readonly Violation[];

  /** Lists the first few violations in the message. */
  constructor(recipe: MapRecipe, violations: readonly Violation[]) {
    const shown = violations
      .slice(0, 8)
      .map((v) => `${v.invariant}: ${v.message}`)
      .join("; ");
    super(
      `Map for seed "${recipe.seed}" (${recipe.params.biome}/${recipe.params.settlement}) ` +
        `breaks ${violations.length} invariant(s): ${shown}`,
    );
    this.name = "MapGenerationError";
    this.violations = violations;
  }
}

// ===========================================
// Entry points
// ===========================================

/**
 * The one function other domains call (ADR 0004 §4.7, §7.3): resolves
 * the recipe, runs the archetype's pipeline on a root RNG derived from
 * the seed, freezes the draft and validates it. Deterministic: the same
 * recipe always yields a deep-equal map. Throws `MapGenerationError`
 * rather than returning an invalid map.
 *
 * ```
 *   MapRecipe ─► hashSeed ─► Rng ─► pipeline ─► draft ─► freeze ─► validate ─► TacticalMap
 * ```
 */
export function generateTacticalMap(
  recipe: MapRecipe,
  options: GenerateOptions = {},
): TacticalMap {
  return generateTacticalMapWithDiagnostics(recipe, options).map;
}

/**
 * Same as `generateTacticalMap`, also returning the passes' notes and
 * timings for the preview harness and the property sweep.
 */
export function generateTacticalMapWithDiagnostics(
  recipe: MapRecipe,
  options: GenerateOptions = {},
): GeneratedMap {
  const registries = options.registries ?? createDefaultRegistries();
  const rng = options.rng ?? new Mulberry32Rng(hashSeed(recipe.seed));
  const pipeline = createPipeline(recipe.params.archetype, registries, options);
  const result = pipeline.run(recipe.params, rng);
  const map = freezeDraft(result.draft, recipe, registries);
  const violations = validateTacticalMap(map, registries);
  if (violations.length > 0) {
    throw new MapGenerationError(recipe, violations);
  }
  return { map, diagnostics: result.diagnostics };
}
