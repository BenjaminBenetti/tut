import { findGreatHive } from "../../../overworld/model/great-hive";
import { isGreatHiveAssault } from "../../../overworld/model/hive-assault-spec";
import type { MissionPresentation } from "../../model/mission-presentation";
import { greatHiveTargetText } from "../story/great-hive-presentation";

// ===========================================
// Decorator
// ===========================================

/**
 * `ordinary` — the Hive Assault's presentation — with a Great Hive
 * assault shown as one (campaign arc §6.9, #1179). A Great Hive offer is
 * a `hive-assault` carrying `hive.great`, so the type's rows would
 * describe an ordinary hive: its weekly growth, its one region, its ×2.
 * For a Great Hive they give way to the story's rows
 * (`great-hive-presentation.ts`), and the offer's note names the target.
 *
 * ```
 *                  ordinary hive                   Great Hive
 *   offer note     Hive level 2 · grows in 3 d     Great Hive: Europe
 *   briefing rows  level, liberates, multiplier    (none: the story's)
 *   glyph, tagline the type's                      the type's; the story's tagline is asked first
 * ```
 */
export function withGreatHiveOffer(
  ordinary: MissionPresentation,
): MissionPresentation {
  return {
    ...ordinary,

    /** The type's rows, or none for a Great Hive. */
    briefingRows(mission, ctx) {
      return isGreatHiveAssault(mission)
        ? []
        : ordinary.briefingRows(mission, ctx);
    },

    /** The type's note, or the Great Hive's name for one. */
    offerNote(mission, ctx) {
      if (!isGreatHiveAssault(mission)) {
        return ordinary.offerNote?.(mission, ctx);
      }
      const hiveId = mission.hive?.hiveId;
      const hive =
        hiveId === undefined
          ? undefined
          : findGreatHive(ctx.state.overworld, hiveId);
      return hive === undefined ? "Great Hive" : greatHiveTargetText(hive);
    },
  };
}
