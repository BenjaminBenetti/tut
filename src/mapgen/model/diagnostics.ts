import type { TileCoord } from "./tile-coord";

// ===========================================
// Diagnostics
// ===========================================

/** A free-text note a pass left behind, optionally pinned to a tile. */
export interface DiagnosticNote {
  readonly pass: string;
  readonly message: string;
  readonly at?: TileCoord;
}

/** How long one pass took. */
export interface PassTiming {
  readonly pass: string;
  readonly durationMs: number;
}

/** What a pass sees: a sink already bound to its id. */
export interface DiagnosticSink {
  /**
   * Records a note for the preview and the property sweep, e.g. a repair
   * the connectivity pass made or a lot the building pass rejected.
   */
  note(message: string, at?: TileCoord): void;
}

/** Everything collected over one pipeline run. Plain data. */
export interface GenerationDiagnostics {
  readonly notes: readonly DiagnosticNote[];
  readonly timings: readonly PassTiming[];
}
