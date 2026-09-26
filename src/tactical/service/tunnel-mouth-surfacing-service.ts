import { BUGS_SPAWNED } from "../model/bugs-spawned-event";
import type { BugUnitSource } from "../model/bug-unit-source";
import type { PhaseStep } from "../model/phase-step";
import type { TacticalEvent } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import { isSealed } from "../model/tunnel-mouth";
import type { TunnelTuning } from "../model/tunnel-tuning";
import { spawnBurrowerAt } from "./burrower-spawn-service";

// ===========================================
// Types
// ===========================================

/** What the tunnel mouths' surfacing needs injected. */
export interface TunnelSurfacingDeps {
  /**
   * The species that comes up the mouths: the burrower, from `bugs/data`
   * via the composition root, so `tactical` never imports bug data. It
   * must dig (`burrows`), or `spawnBurrowerAt` refuses it and nothing
   * comes up.
   */
  readonly species: BugUnitSource;
  /** When each mouth sends one. */
  readonly tuning: Pick<TunnelTuning, "firstSurfaceTurn" | "surfaceEvery">;
}

// ===========================================
// Schedule
// ===========================================

/**
 * Whether the mouth at `index` (hook order) sends a burrower up in the
 * bug phase of `turn`: from `firstSurfaceTurn + index`, every
 * `surfaceEvery` turns. A counted schedule, not a chance: the tuning's
 * doc says why, and with three mouths every third turn a turn apart,
 * one comes up a bug phase while all three are open.
 *
 * ```
 *   first 2, every 3:   mouth 0 ──► 2 5 8 …   mouth 1 ──► 3 6 9 …   mouth 2 ──► 4 7 10 …
 * ```
 *
 * @param turn - The turn whose bug phase is opening.
 * @param index - The mouth's place in `TacticalState.tunnelMouths`.
 * @param tuning - The first turn and the interval.
 */
export function surfacesOn(
  turn: number,
  index: number,
  tuning: TunnelSurfacingDeps["tuning"],
): boolean {
  const since = turn - tuning.firstSurfaceTurn - index;
  return since >= 0 && since % tuning.surfaceEvery === 0;
}

// ===========================================
// Phase step
// ===========================================

/**
 * Builds the phase step that brings burrowers up the open tunnel mouths
 * (campaign arc §6.7): the mission's pressure. As each bug phase opens,
 * every mouth not sealed whose turn it is (`surfacesOn`) puts one
 * burrower under the ground at its middle tile through
 * `spawnBurrowerAt`, or under the nearest free column within its search
 * radius. It arrives burrowed and spent, like every hatchling, and digs
 * toward the force from the next bug phase.
 *
 * ```
 *   player phase opens        ──► unchanged
 *   bugs phase opens, mouth i:
 *     sealed                  ──► nothing, ever again
 *     not its turn            ──► nothing
 *     its turn, ground free   ──► one burrower under it, BugsSpawned { source: "tunnel", sourceId: mouth }
 *     its turn, no free ground within the radius ──► nothing; the turn is not owed
 * ```
 *
 * A mouth with a charge burning on it is still open: burrowers keep
 * coming up it until the charge goes off, which is what the force
 * holds the ground through. Draws nothing; the ids come from `ctx.ids`.
 *
 * @param deps - The burrower species and the schedule.
 * @returns The step, for `createEndTurnHandler`'s list.
 */
export function createTunnelSurfacingStep(
  deps: TunnelSurfacingDeps,
): PhaseStep {
  return (mission, ctx) => {
    const mouths = mission.tunnelMouths ?? [];
    if (mission.phase !== "bugs" || mouths.length === 0) {
      return { state: mission, events: [] };
    }
    let state: TacticalState = mission;
    const events: TacticalEvent[] = [];
    mouths.forEach((mouth, index) => {
      if (isSealed(mouth) || !surfacesOn(mission.turn, index, deps.tuning)) {
        return;
      }
      const spawned = spawnBurrowerAt(state, mouth.pos, {
        ids: ctx.ids,
        species: deps.species,
      });
      if (!spawned.ok) {
        return;
      }
      state = spawned.value.state;
      events.push({
        type: BUGS_SPAWNED,
        payload: {
          unitIds: [spawned.value.unitId],
          source: "tunnel",
          sourceId: mouth.id,
        },
      });
    });
    return { state, events };
  };
}
