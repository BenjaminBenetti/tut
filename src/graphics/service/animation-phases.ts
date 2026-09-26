import { BROOD_WOKE } from "../../tactical/model/brood-woke-event";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { UnitId } from "../../tactical/model/unit";
import { UNIT_MOVED } from "../../tactical/model/unit-moved-event";
import { UNIT_SPOTTED } from "../../tactical/model/unit-spotted-event";

// ===========================================
// Types
// ===========================================

/**
 * A batch of events split around the moment the scene applies the new
 * state, because not everything can be animated at the same point.
 */
export interface AnimationPhases {
  /** Played first, on the objects the scene already has. */
  readonly before: readonly TacticalEvent[];
  /** Played after the scene has caught up, for objects that did not exist before it. */
  readonly after: readonly TacticalEvent[];
}

// ===========================================
// Phasing
// ===========================================

/**
 * Splits a batch around placement (#585).
 *
 * The scene draws only what the player perceives (ADR 0006 §2.4), so an
 * enemy coming into view has **no object at all** until the scene builder
 * has placed it. A `UnitSpotted` reveal enqueued with the rest of the
 * batch would resolve `unitObject` to `undefined` and animate nothing —
 * looking implemented and doing nothing, which is why it was left out of
 * #551 rather than stubbed.
 *
 * ```
 *   [moved, attacked, spotted, died]
 *        │
 *        ├─ before: moved, attacked, died   played on what is already there
 *        └─ after:  spotted                 played once placement has run
 * ```
 *
 * The exception is an **arrival** (#1116): a unit the host has already
 * placed at the start of its walk because it moves during the batch and
 * is in view by the end of it. Its object exists before the first phase
 * plays, so its spot is moved ahead of its first move and plays there,
 * and the whole walk follows in view.
 *
 * ```
 *   arrivals = {b}
 *   [moved b, moved b, attacked, spotted b]
 *        │
 *        ├─ before: spotted b, moved b, moved b, attacked
 *        └─ after:  (nothing)
 * ```
 *
 * A **brood waking** (#1179) plays after placement too: the redraw is
 * what uncurls its sleepers, and a member first seen in the same step
 * exists only then, so its stir plays on the awake bugs the player can
 * now see rather than on curled ones about to pop upright.
 *
 * Order within each phase is otherwise preserved, so a move still plays
 * before the attack that followed it.
 *
 * @param events - The batch that just resolved.
 * @param arrivals - Units placed at their starting tile ahead of the batch.
 */
export function phaseEvents(
  events: readonly TacticalEvent[],
  arrivals: ReadonlySet<UnitId> = new Set(),
): AnimationPhases {
  const before: TacticalEvent[] = [];
  const after: TacticalEvent[] = [];
  /** Arrivals whose first move has been passed. */
  const announced = new Set<UnitId>();
  /** Spots pulled ahead of a move, so they are not played twice. */
  const pulled = new Set<TacticalEvent>();
  for (const event of events) {
    if (event.type === BROOD_WOKE) {
      after.push(event);
      continue;
    }
    if (event.type === UNIT_SPOTTED) {
      if (!arrivals.has(event.payload.unitId)) {
        after.push(event);
      } else if (!pulled.has(event)) {
        // A spot that came before the first move, or a later re-spot:
        // the object exists, so it plays in stream order.
        announced.add(event.payload.unitId);
        before.push(event);
      }
      continue;
    }
    if (event.type === UNIT_MOVED) {
      const { unitId } = event.payload;
      if (arrivals.has(unitId) && !announced.has(unitId)) {
        announced.add(unitId);
        const spot = firstSpotOf(events, unitId);
        if (spot !== undefined) {
          pulled.add(spot);
          before.push(spot);
        }
      }
    }
    before.push(event);
  }
  return { before, after };
}

/** The first spot of `unitId` in the batch, if the batch announces it. */
function firstSpotOf(
  events: readonly TacticalEvent[],
  unitId: UnitId,
): TacticalEvent | undefined {
  return events.find(
    (event) => event.type === UNIT_SPOTTED && event.payload.unitId === unitId,
  );
}
