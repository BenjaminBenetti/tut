import type { Mission } from "../../overworld/model/mission";
import { formatWhole } from "./format";

// ===========================================
// Constants
// ===========================================

/** What an offer that never lapses shows in place of its days left. */
export const NO_COUNTDOWN_TEXT = "—";

/** The tooltip on that dash, saying why there is no count. */
export const NO_COUNTDOWN_TITLE = "Stays on offer until played";

// ===========================================
// Countdown
// ===========================================

/** The parts of an offer its countdown reads. */
type Expiring = Pick<Mission, "expiresDay" | "pinned">;

/**
 * An offer's days left, in the player's words, shared by the mission
 * list, the briefing and the deployment screen so the three agree. A
 * pinned offer (a story or hive mission, ADR 0013 §2.2) never lapses,
 * so it shows a dash rather than a count its `expiresDay` would make
 * up.
 *
 * ```
 *   pinned         ──► "—"
 *   expiresDay 9, day 6 ──► "3 d"
 * ```
 *
 * @param mission - The offer.
 * @param day - The campaign's current day.
 */
export function missionCountdownText(mission: Expiring, day: number): string {
  return mission.pinned === true
    ? NO_COUNTDOWN_TEXT
    : `${formatWhole(mission.expiresDay - day)} d`;
}

/**
 * The tooltip for an offer's countdown: why a pinned offer shows no
 * count, and nothing for one that lapses.
 */
export function missionCountdownTitle(mission: Expiring): string {
  return mission.pinned === true ? NO_COUNTDOWN_TITLE : "";
}

/**
 * Orders offers soonest lapse first, with every pinned offer after the
 * ones that lapse (it never does), and ties at 0 for the caller to
 * break.
 */
export function compareByExpiry(a: Expiring, b: Expiring): number {
  const aPinned = a.pinned === true;
  const bPinned = b.pinned === true;
  if (aPinned || bPinned) {
    return Number(aPinned) - Number(bPinned);
  }
  return a.expiresDay - b.expiresDay;
}
