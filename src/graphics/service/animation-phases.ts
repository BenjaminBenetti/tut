import type { TacticalEvent } from "../../tactical/model/tactical-event";
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
 * Order within each phase is preserved, so a move still plays before the
 * attack that followed it.
 */
export function phaseEvents(events: readonly TacticalEvent[]): AnimationPhases {
  const before: TacticalEvent[] = [];
  const after: TacticalEvent[] = [];
  for (const event of events) {
    (event.type === UNIT_SPOTTED ? after : before).push(event);
  }
  return { before, after };
}
