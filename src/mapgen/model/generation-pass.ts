import type { Rng } from "../../core/model/rng";
import type { DiagnosticSink } from "./diagnostics";
import type { MapDraft } from "./map-draft";
import type { MapGenRegistries } from "./registries";
import type { ResolvedMapGenParams } from "./resolved-params";

// ===========================================
// Capabilities
// ===========================================

/**
 * What a pass needs on the draft before it runs and what it leaves behind
 * (ADR 0004 §7.2). The runner checks `requires ⊆ provided-so-far` before
 * running anything, so a mis-ordered pipeline fails at construction.
 */
export type DraftCapability =
  | "heightmap"
  | "water"
  | "roads"
  | "lots"
  | "buildings"
  | "interiors"
  | "props"
  | "ramps"
  | "hooks"
  | "connected";

// ===========================================
// Context and pass
// ===========================================

/** Everything a pass may read or mutate. */
export interface GenerationContext {
  /** Presets expanded, ids resolved. */
  readonly params: ResolvedMapGenParams;
  /** Already forked with the pass id; draws never disturb other passes. */
  readonly rng: Rng;
  /** Mutable working state shared by every pass. */
  readonly draft: MapDraft;
  readonly registries: MapGenRegistries;
  /** Notes for the preview harness and the property sweep. */
  readonly diagnostics: DiagnosticSink;
}

/**
 * One step of the pipeline. Stateless: all state lives on the draft, so a
 * pass instance can be shared between pipelines and runs.
 *
 * ```
 *   terrain ─► water ─► roads ─► lots ─► buildings ─► props ─► ramps ─► hooks ─► connectivity
 *   (each: rng = root.fork(pass.id))
 * ```
 */
export interface GenerationPass {
  /** Unique within a pipeline; also the RNG fork label. */
  readonly id: string;
  readonly requires: readonly DraftCapability[];
  readonly provides: readonly DraftCapability[];

  /**
   * Mutates the draft. Throws only on programmer error; a pass that cannot
   * satisfy its goal records a diagnostic and leaves the repair to later
   * passes.
   */
  run(context: GenerationContext): void;
}
