import { DIRECTIONS } from "../../core/model/direction";
import { manhattanDistance, stepGridPos } from "../../core/service/grid-math";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { TileCoord } from "../model/tile-coord";
import { buildGroundComponents } from "../service/ground-components";

// ===========================================
// Types
// ===========================================

/** Two adjacent exterior ground tiles one level apart. */
interface Step {
  readonly lower: TileCoord;
  readonly upper: TileCoord;
  /** True when either end is a road column; roads get ramps first. */
  readonly onRoad: boolean;
}

// ===========================================
// RampPass
// ===========================================

/**
 * Pass 7 of the settlement archetype (ADR 0004 §4.3, §7.3). Treats every
 * passable exterior ground tile as a node, joins nodes at the same level
 * and across existing ramps, then adds a ramp at one-level steps between
 * different components (road columns first) until nothing joinable is
 * left. Steps of two or more levels stay cliffs. Finally it adds extra
 * ramps along long plateau edges so no ramp is more than the settlement's
 * `rampSpacing` from any one-level step.
 *
 * ```
 *   level 1  ▓▓▓▓▓▓▓▓▓▓▓
 *   level 0  ░░░/░░░░/░░     / ramp every ≤ rampSpacing columns
 * ```
 */
export class RampPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "ramps";
  readonly requires: readonly DraftCapability[] = ["props"];
  readonly provides: readonly DraftCapability[] = ["ramps"];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Connects the exterior ground with ramps. */
  run(context: GenerationContext): void {
    const { draft, params, diagnostics } = context;
    const { nodes, components } = buildGroundComponents(draft);

    const steps = collectSteps(draft, nodes);
    let joined = 0;
    for (const step of steps) {
      const a = columnKey(draft, step.lower);
      const b = columnKey(draft, step.upper);
      if (components.find(a) !== components.find(b)) {
        addRamp(draft, step, diagnostics, "joins two areas");
        components.union(a, b);
        joined++;
      }
    }

    let spaced = 0;
    const spacing = params.settlement.rampSpacing;
    for (const step of steps) {
      if (!rampWithin(draft, step.lower, spacing)) {
        addRamp(draft, step, diagnostics, "spaces a plateau edge");
        spaced++;
      }
    }
    diagnostics.note(
      `${joined} ramps joined areas, ${spaced} added for spacing, ` +
        `${components.count()} exterior areas remain (water and cliffs)`,
    );
  }
}

// ===========================================
// Graph helpers
// ===========================================

/**
 * Every adjacent pair of nodes exactly one level apart, road columns
 * first, then scan order, so ramp choice is deterministic.
 */
function collectSteps(draft: MapDraft, nodes: ReadonlySet<number>): Step[] {
  const steps: Step[] = [];
  for (const key of nodes) {
    const x = key % draft.width;
    const z = Math.floor(key / draft.width);
    const here = draft.groundCoord(x, z);
    for (const direction of DIRECTIONS) {
      const next = stepGridPos(here, direction);
      if (!draft.inBounds(next.x, next.z)) {
        continue;
      }
      const nextKey = columnKey(draft, next);
      if (!nodes.has(nextKey)) {
        continue;
      }
      const there = draft.groundCoord(next.x, next.z);
      if (there.y - here.y === 1) {
        steps.push({
          lower: here,
          upper: there,
          onRoad: draft.isRoad(x, z) || draft.isRoad(next.x, next.z),
        });
      }
    }
  }
  return steps.sort((a, b) => Number(b.onRoad) - Number(a.onRoad));
}

/** True when a ramp endpoint lies within `distance` of the coordinate. */
function rampWithin(
  draft: MapDraft,
  coord: TileCoord,
  distance: number,
): boolean {
  return draft.connectors.some(
    (connector) =>
      connector.kind === "ramp" &&
      (manhattanDistance(connector.from, coord) <= distance ||
        manhattanDistance(connector.to, coord) <= distance),
  );
}

/** Adds the ramp and notes it for the preview. */
function addRamp(
  draft: MapDraft,
  step: Step,
  diagnostics: GenerationContext["diagnostics"],
  reason: string,
): void {
  const ramp = draft.addConnector("ramp", step.lower, step.upper);
  diagnostics.note(`${ramp.id} ${reason}`, step.lower);
}

/** Column key of an on-map coordinate; callers check bounds first. */
function columnKey(draft: MapDraft, coord: TileCoord): number {
  return coord.z * draft.width + coord.x;
}
