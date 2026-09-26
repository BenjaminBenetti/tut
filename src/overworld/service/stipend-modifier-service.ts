import type { StipendModifier } from "../model/stipend-modifier";

// ===========================================
// Stipend modifiers
// ===========================================

/** Product of every active modifier's factor; `1` with none. */
export function stipendFactor(
  modifiers: readonly StipendModifier[] | undefined,
): number {
  let factor = 1;
  for (const modifier of modifiers ?? []) {
    factor *= modifier.factor;
  }
  return factor;
}

/**
 * The modifiers after one stipend payment: each loses a day and those
 * at zero are dropped. Everything else a modifier carries (its
 * `source`) is kept. Returns undefined when nothing remains so the
 * state omits the field, as a fresh campaign does.
 */
export function tickStipendModifiers(
  modifiers: readonly StipendModifier[] | undefined,
): readonly StipendModifier[] | undefined {
  const next = (modifiers ?? [])
    .map((m) => ({ ...m, daysLeft: m.daysLeft - 1 }))
    .filter((m) => m.daysLeft > 0);
  return next.length === 0 ? undefined : next;
}

/**
 * The modifiers with `modifier` queued. One with a `source` refreshes:
 * it replaces any active modifier of the same source, so two evacuations
 * won back to back give one ×1.5 window restarted at ten days, never
 * ×2.25. One without a source stacks, as an event's always has.
 * Modifiers of other sources are untouched, so a lapse's ×0.9 and a
 * win's ×1.5 multiply while both run.
 *
 * ```
 *   [evac-saved 1.5 ×3, event 0.5 ×2] + evac-saved 1.5 ×10
 *     ──► [event 0.5 ×2, evac-saved 1.5 ×10]
 *   [event 0.5 ×2] + event 0.8 ×4
 *     ──► [event 0.5 ×2, event 0.8 ×4]
 * ```
 *
 * @param modifiers - The active modifiers; absent reads as none.
 * @param modifier - The window to add.
 * @returns A new list; the input is not changed.
 */
export function queueStipendModifier(
  modifiers: readonly StipendModifier[] | undefined,
  modifier: StipendModifier,
): readonly StipendModifier[] {
  const kept =
    modifier.source === undefined
      ? (modifiers ?? [])
      : (modifiers ?? []).filter((m) => m.source !== modifier.source);
  return [...kept, modifier];
}
