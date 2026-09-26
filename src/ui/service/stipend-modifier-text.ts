import type { StipendModifier } from "../../overworld/model/stipend-modifier";
import {
  EVACUATION_LOST_SOURCE,
  EVACUATION_SAVED_SOURCE,
} from "../../overworld/service/missions/evacuation-consequence";
import { stipendFactor } from "../../overworld/service/stipend-modifier-service";

// ===========================================
// Types
// ===========================================

/** The top bar's one-badge reading of the active stipend modifiers. */
export interface StipendModifierSummary {
  /** Badge text: the net change and the days to the next change, `+50% · 10 d`. */
  readonly text: string;
  /** The net change alone, `+50%`: what a narrow bar keeps of the text. */
  readonly percent: string;
  /** The rest of the text, the days to the next change: ` · 10 d`. */
  readonly days: string;
  /** Tooltip: one line per modifier, what it does, for how long, and why. */
  readonly title: string;
  /** Green while the stipend is up, amber while it is down. */
  readonly tone: "ok" | "warn";
}

// ===========================================
// Constants
// ===========================================

/** Why a modifier was granted, by its `source`; one without is an event's. */
const SOURCE_REASONS: Readonly<Record<string, string>> = {
  [EVACUATION_SAVED_SOURCE]: "a city evacuated",
  [EVACUATION_LOST_SOURCE]: "a city abandoned",
};

/** The reason given for a modifier with no known source. */
const EVENT_REASON = "an event";

// ===========================================
// Text
// ===========================================

/**
 * A stipend factor as a signed whole percentage change, with a true
 * minus sign: `1.5 ─► +50%`, `0.9 ─► −10%`, `1.35 ─► +35%`, `1 ─► +0%`.
 */
export function stipendPercentText(factor: number): string {
  const percent = Math.round((factor - 1) * 100);
  return percent < 0
    ? `−${String(Math.abs(percent))}%`
    : `+${String(percent)}%`;
}

/**
 * The active stipend modifiers in one small badge (campaign arc §6.4):
 * their net effect on each payment and how many days until the first of
 * them runs out, which is when the figure next changes; the tooltip
 * lists each one. Undefined with none, so the badge hides.
 *
 * ```
 *   [×1.5 for 10 (evacuation-saved)]              ──► "+50% · 10 d"  ok
 *   [×1.5 for 6, ×0.9 for 10 (evacuation-lost)]   ──► "+35% · 6 d"   ok
 *   [×0.9 for 3 (evacuation-lost)]                ──► "−10% · 3 d"   warn
 * ```
 *
 * @param modifiers - The overworld's `stipendModifiers`.
 */
export function stipendModifierSummary(
  modifiers: readonly StipendModifier[] | undefined,
): StipendModifierSummary | undefined {
  if (modifiers === undefined || modifiers.length === 0) {
    return undefined;
  }
  const net = stipendFactor(modifiers);
  const nextChange = Math.min(...modifiers.map((m) => m.daysLeft));
  const lines = modifiers.map(
    (m) =>
      `Stipend ${stipendPercentText(m.factor)} for ${daysText(m.daysLeft)}: ${reasonFor(m)}`,
  );
  const percent = stipendPercentText(net);
  const days = ` · ${String(nextChange)} d`;
  return {
    text: `${percent}${days}`,
    percent,
    days,
    title: lines.join("\n"),
    tone: net >= 1 ? "ok" : "warn",
  };
}

// ===========================================
// Helpers
// ===========================================

/** `1 more day`, `10 more days`. */
function daysText(days: number): string {
  return days === 1 ? "1 more day" : `${String(days)} more days`;
}

/** Why `modifier` was granted, in words. */
function reasonFor(modifier: StipendModifier): string {
  return modifier.source === undefined
    ? EVENT_REASON
    : (SOURCE_REASONS[modifier.source] ?? EVENT_REASON);
}
