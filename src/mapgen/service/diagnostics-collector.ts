import type {
  DiagnosticNote,
  DiagnosticSink,
  GenerationDiagnostics,
  PassTiming,
} from "../model/diagnostics";
import type { TileCoord } from "../model/tile-coord";

// ===========================================
// DiagnosticsCollector
// ===========================================

/**
 * Gathers notes and timings over one pipeline run and hands each pass a
 * sink bound to its id. `snapshot()` returns plain data for the result.
 */
export class DiagnosticsCollector {
  // ===========================================
  // Fields
  // ===========================================

  private readonly notes: DiagnosticNote[] = [];
  private readonly timings: PassTiming[] = [];

  // ===========================================
  // Public Methods
  // ===========================================

  /** A sink whose notes are attributed to the pass. */
  forPass(passId: string): DiagnosticSink {
    return {
      note: (message: string, at?: TileCoord): void => {
        this.notes.push(
          at === undefined
            ? { pass: passId, message }
            : { pass: passId, message, at: { x: at.x, y: at.y, z: at.z } },
        );
      },
    };
  }

  /** Records how long a pass took. */
  recordTiming(passId: string, durationMs: number): void {
    this.timings.push({ pass: passId, durationMs });
  }

  /** Copies everything collected so far into plain data. */
  snapshot(): GenerationDiagnostics {
    return { notes: [...this.notes], timings: [...this.timings] };
  }
}
