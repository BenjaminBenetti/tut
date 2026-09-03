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
 * at zero are dropped. Returns undefined when nothing remains so the
 * state omits the field, as a fresh campaign does.
 */
export function tickStipendModifiers(
  modifiers: readonly StipendModifier[] | undefined,
): readonly StipendModifier[] | undefined {
  const next = (modifiers ?? [])
    .map((m) => ({ factor: m.factor, daysLeft: m.daysLeft - 1 }))
    .filter((m) => m.daysLeft > 0);
  return next.length === 0 ? undefined : next;
}
