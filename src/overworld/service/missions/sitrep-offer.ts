import type { SitrepId } from "../../../content/model/sitrep-id";
import { SITREP_IDS } from "../../../content/model/sitrep-id";
import type { Rng } from "../../../core/model/rng";
import type { ActDefinition } from "../../model/act-definition";
import type { CampaignProgress } from "../../model/campaign-progress";
import type { Mission } from "../../model/mission";
import type { SitrepCatalogue } from "../../model/sitrep-definition";

// ===========================================
// Queries
// ===========================================

/**
 * The campaign mission number an offer made now would be played as:
 * one more than the missions already played, whatever the act. Sitrep
 * debuts (`SitrepDefinition.debutMission`) are read against it.
 */
export function offeredMissionNumber(progress: CampaignProgress): number {
  return progress.missionsPlayed + 1;
}

/**
 * The sitreps an offer made now may carry, in `SITREP_IDS` order: those
 * whose debut the offered mission number has reached and whose weight is
 * positive. Empty before the first debut (mission 10).
 */
export function debutedSitreps(
  progress: CampaignProgress,
  catalogue: SitrepCatalogue,
): readonly SitrepId[] {
  const number = offeredMissionNumber(progress);
  return SITREP_IDS.filter(
    (id) => catalogue[id].debutMission <= number && catalogue[id].weight > 0,
  );
}

// ===========================================
// Sitreps on the offer
// ===========================================

/**
 * Rolls the offer's sitreps and freezes them on it (campaign arc §11,
 * ADR 0013 §2.2), so the briefing, the map and the mission can never
 * disagree about what the player is walking into.
 *
 * ```
 *   storyId set, or sitreps already set ──► unchanged
 *   pool = debuted sitreps (missionsPlayed + 1 ≥ debutMission)
 *   for each of act.sitrepSlots slots:
 *     rng.chance(act.sitrepChance)? ──► rng.pickWeighted(pool − picked, weight)
 *   none picked ──► unchanged (no field)   else ──► mission.sitreps = picked
 * ```
 *
 * Every slot draws its chance, and a filled slot one weighted pick,
 * from `rng` in slot order, so the roll is a pure function of the
 * stream it is handed: the director hands each decorator its own fork
 * (`decorate:sitreps:<missionId>`), so the roll shifts nothing else. A
 * sitrep is never drawn twice for one offer; a slot with nothing left
 * to draw stays empty. Story offers carry none; every other offer,
 * pinned or triggered (a defence), may. An offer that already carries
 * sitreps (a rule that authored its own) keeps them. Pure; returns a
 * copy and never mutates the input.
 *
 * @param mission - The new offer.
 * @param progress - The campaign's progress when the offer is made.
 * @param act - The act the offer is made in: its slots and chance.
 * @param rng - This decorator's stream for this offer.
 * @param catalogue - Every sitrep's debut, weight and side.
 * @returns The offer, with `sitreps` when at least one was rolled.
 */
export function withSitreps(
  mission: Mission,
  progress: CampaignProgress,
  act: ActDefinition,
  rng: Rng,
  catalogue: SitrepCatalogue,
): Mission {
  if (mission.storyId !== undefined || mission.sitreps !== undefined) {
    return mission;
  }
  const pool = debutedSitreps(progress, catalogue);
  if (pool.length === 0) {
    return mission;
  }
  const picked: SitrepId[] = [];
  for (let slot = 0; slot < act.sitrepSlots; slot++) {
    if (!rng.chance(act.sitrepChance)) {
      continue;
    }
    const left = pool.filter((id) => !picked.includes(id));
    if (left.length === 0) {
      break;
    }
    picked.push(rng.pickWeighted(left, (id) => catalogue[id].weight));
  }
  return picked.length === 0 ? mission : { ...mission, sitreps: picked };
}
