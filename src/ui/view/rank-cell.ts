import type { RankLadder, RankTuning } from "../../roster/model/rank";
import {
  rankIndexOf,
  rankOf,
  xpToNextRank,
} from "../../roster/service/rank-service";
import { attachRankTooltip } from "./rank-tooltip-view";
import { formatWhole } from "../service/format";

// ===========================================
// Constants
// ===========================================

/** What the cell reads when the ladder has no rungs at all. */
const NO_RANK = "—";

// ===========================================
// Rank cell
// ===========================================

/**
 * A table cell naming the rank `xp` has reached and how far the next
 * one is (#1130), shared by the squad and mech lists so a rank reads the
 * same in both.
 *
 * ```
 *   ┌──────────────────────────────┐
 *   │ Corporal  next in 30 xp      │   data-field="rank"
 *   └──────────────────────────────┘
 * ```
 *
 * Resting on the name opens the rank popover (#1134) when the tuning
 * is given; a ladder alone still names the rank.
 *
 * @param doc - Owning document.
 * @param xp - The unit's accumulated experience.
 * @param ladder - Ranks from lowest to highest.
 * @param tuning - The ladder with its rates, for the popover; optional.
 * @returns The cell, carrying `data-field="rank"` for tests.
 */
export function rankCell(
  doc: Document,
  xp: number,
  ladder: RankLadder,
  tuning?: RankTuning,
): HTMLTableCellElement {
  const cell = doc.createElement("td");
  cell.dataset.field = "rank";
  const name = doc.createElement("span");
  name.dataset.role = "rank-name";
  name.textContent = rankOf(xp, ladder)?.name ?? NO_RANK;
  if (tuning !== undefined && ladder.length > 0) {
    attachRankTooltip(name, rankIndexOf(xp, ladder), tuning);
  }
  cell.appendChild(name);
  const toNext = xpToNextRank(xp, ladder);
  if (toNext !== undefined) {
    const next = doc.createElement("span");
    next.className = "tut-dim";
    next.dataset.role = "next-rank";
    next.textContent = ` next in ${formatWhole(toNext)} xp`;
    cell.appendChild(next);
  }
  return cell;
}
