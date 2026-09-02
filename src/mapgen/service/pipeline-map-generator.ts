import type { IdGenerator } from "../../core/model/id-generator";
import type { Rng } from "../../core/model/rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { SurfaceIds } from "../data/surfaces";
import type { GenerationDiagnostics } from "../model/diagnostics";
import type { DraftCapability, GenerationPass } from "../model/generation-pass";
import { MapDraft } from "../model/map-draft";
import type { MapGenParams } from "../model/map-recipe";
import type { MapGenRegistries } from "../model/registries";
import type { ResolvedMapGenParams } from "../model/resolved-params";
import { DiagnosticsCollector } from "./diagnostics-collector";
import { resolveMapGenParams } from "./param-resolver";

// ===========================================
// Types
// ===========================================

/** What one run of the pipeline leaves behind. Freezing is #97's job. */
export interface PipelineResult {
  readonly params: ResolvedMapGenParams;
  readonly draft: MapDraft;
  readonly diagnostics: GenerationDiagnostics;
}

/** Injection points, mainly for tests. */
export interface PipelineOptions {
  /** Monotonic milliseconds for pass timings. Defaults to `performance.now`. */
  readonly clock?: () => number;
  /** Fresh id generator per run. Defaults to core's sequential generator. */
  readonly createIds?: () => IdGenerator;
}

// ===========================================
// PipelineMapGenerator
// ===========================================

/**
 * Runs an ordered list of passes over a fresh `MapDraft` (ADR 0004 §7.2).
 * Construction validates the pipeline: unique pass ids (equal ids would
 * share an RNG stream) and every `requires` satisfied by an earlier
 * `provides`. Each pass runs on `rng.fork(pass.id)`, so inserting or
 * reordering passes never perturbs another pass's draws.
 *
 * ```
 *   params ─► resolve ─► draft ─► pass₁(fork "p1") ─► pass₂(fork "p2") ─► … ─► result
 * ```
 */
export class PipelineMapGenerator {
  // ===========================================
  // Fields
  // ===========================================

  private readonly passes: readonly GenerationPass[];
  private readonly registries: MapGenRegistries;
  private readonly clock: () => number;
  private readonly createIds: () => IdGenerator;

  // ===========================================
  // Construction
  // ===========================================

  /**
   * Validates the pass list and keeps it. Throws, naming the pass and the
   * missing capability, when a pass would run before its inputs exist.
   */
  constructor(
    passes: readonly GenerationPass[],
    registries: MapGenRegistries,
    options: PipelineOptions = {},
  ) {
    validatePipeline(passes);
    this.passes = passes;
    this.registries = registries;
    this.clock = options.clock ?? ((): number => performance.now());
    this.createIds =
      options.createIds ?? ((): IdGenerator => new SequentialIdGenerator());
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Ids of the passes in run order. */
  get passIds(): readonly string[] {
    return this.passes.map((pass) => pass.id);
  }

  /**
   * Resolves the params, runs every pass in order on a fresh draft, and
   * returns the draft with diagnostics. `rng` is the root stream for the
   * recipe; only labelled forks of it are handed to passes.
   */
  run(params: MapGenParams, rng: Rng): PipelineResult {
    const resolved = resolveMapGenParams(params, this.registries);
    const draft = new MapDraft(
      resolved.width,
      resolved.depth,
      this.createIds(),
      SurfaceIds.GRASS,
    );
    const diagnostics = new DiagnosticsCollector();
    for (const pass of this.passes) {
      const started = this.clock();
      pass.run({
        params: resolved,
        rng: rng.fork(pass.id),
        draft,
        registries: this.registries,
        diagnostics: diagnostics.forPass(pass.id),
      });
      diagnostics.recordTiming(pass.id, this.clock() - started);
    }
    return { params: resolved, draft, diagnostics: diagnostics.snapshot() };
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Throws on duplicate ids or a `requires` that no earlier pass provides.
 */
export function validatePipeline(passes: readonly GenerationPass[]): void {
  const seen = new Set<string>();
  const provided = new Set<DraftCapability>();
  for (const pass of passes) {
    if (seen.has(pass.id)) {
      throw new Error(`Pipeline has two passes with id "${pass.id}"`);
    }
    seen.add(pass.id);
    for (const capability of pass.requires) {
      if (!provided.has(capability)) {
        throw new Error(
          `Pass "${pass.id}" requires "${capability}" but no earlier pass provides it`,
        );
      }
    }
    for (const capability of pass.provides) {
      provided.add(capability);
    }
  }
}
