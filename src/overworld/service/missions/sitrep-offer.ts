import type { MissionType } from "../../../content/model/mission-type";
import type { SitrepId } from "../../../content/model/sitrep-id";
import { SITREP_IDS } from "../../../content/model/sitrep-id";
import type { Rng } from "../../../core/model/rng";
import type { ActDefinition } from "../../model/act-definition";
import type { CampaignProgress } from "../../model/campaign-progress";
import type { Mission } from "../../model/mission";
import type {
  SitrepCatalogue,
  SitrepDefinition,
} from "../../model/sitrep-definition";

// ===========================================
// Types
// ===========================================

/** The part of a mission type the eligibility check reads: its map hooks. */
export type SitrepHost = Pick<MissionType, "requiredHooks">;

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

/**
 * Whether a sitrep would act on a mission of this type: every hook kind
 * it names in `requiredHooks` is one the type requires at least one of
 * at every difficulty (`count ≥ 1`). A sitrep that names none fits every
 * type.
 *
 * ```
 *   dust-off-window  needs extraction   clearance ✓  defence ✓
 *   swarm-tide       needs edge-spawn   clearance ✓  defence ✓
 *   hardened-clutch. needs egg-spawner  clearance ✓  defence ✗ (no nests)
 * ```
 *
 * It reads the type's own `requiredHooks`, the hooks every map of the
 * type is generated with. A type whose map rule adds one of these kinds
 * as an extra hook should list it among its `requiredHooks` too, or the
 * sitrep that needs it is never offered there.
 *
 * @param definition - The sitrep's definition; only `requiredHooks` is read.
 * @param host - The offer's mission type; only `requiredHooks` is read.
 */
export function sitrepFits(
  definition: Pick<SitrepDefinition, "requiredHooks">,
  host: SitrepHost,
): boolean {
  return (definition.requiredHooks ?? []).every((kind) =>
    host.requiredHooks.some((hook) => hook.kind === kind && hook.count >= 1),
  );
}

/**
 * The sitreps an offer of this type made now may carry, in `SITREP_IDS`
 * order: the debuted ones (`debutedSitreps`) that fit the type
 * (`sitrepFits`). Without a type every debuted sitrep is eligible, as it
 * was before any sitrep needed a hook.
 *
 * @param progress - The campaign's progress when the offer is made.
 * @param catalogue - Every sitrep's debut, hooks, weight and side.
 * @param host - The offer's mission type, when the caller knows it.
 */
export function eligibleSitreps(
  progress: CampaignProgress,
  catalogue: SitrepCatalogue,
  host?: SitrepHost,
): readonly SitrepId[] {
  const debuted = debutedSitreps(progress, catalogue);
  return host === undefined
    ? debuted
    : debuted.filter((id) => sitrepFits(catalogue[id], host));
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
 *          that fit the offer's type (its hooks: nests, edges, a drop ship)
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
 * The pool is drawn over only what fits the offer's type, so an offer
 * never carries a sitrep that could not act on its map (a defence has
 * no egg spawners for Hardened Clutches). Before mission 16 every
 * debuted sitrep fits every type, so the pool, and every draw, is what
 * it was before the check existed.
 *
 * @param mission - The new offer.
 * @param progress - The campaign's progress when the offer is made.
 * @param act - The act the offer is made in: its slots and chance.
 * @param rng - This decorator's stream for this offer.
 * @param catalogue - Every sitrep's debut, hooks, weight and side.
 * @param host - The offer's mission type; the shipped decorator passes
 *   it. Left out, every debuted sitrep is eligible.
 * @returns The offer, with `sitreps` when at least one was rolled.
 */
export function withSitreps(
  mission: Mission,
  progress: CampaignProgress,
  act: ActDefinition,
  rng: Rng,
  catalogue: SitrepCatalogue,
  host?: SitrepHost,
): Mission {
  if (mission.storyId !== undefined || mission.sitreps !== undefined) {
    return mission;
  }
  const pool = eligibleSitreps(progress, catalogue, host);
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
