import { BUG_SPECIES } from "../../bugs/data/species";
import { SOVEREIGN_TUNING } from "../../bugs/data/sovereign-tuning";
import { placeSovereign } from "../../bugs/service/sovereign-placement";
import type { CoreBoss } from "../../tactical/model/core-boss";

// ===========================================
// The core stage's boss
// ===========================================

/**
 * The boss the Spore Platform's core stage stands on the Sovereign's
 * dais (campaign arc §6.9, §9, #1179), handed to the core-stage setup as
 * `MissionSetupDeps.coreBoss`. The composition root builds it, because
 * the tactical setup reads no bug catalogue and imports no bug service.
 *
 * ```
 *   species  BUG_SPECIES.sovereign            her stat block
 *   escort   SOVEREIGN_TUNING.summon.escort   the species her share of the waves rolls,
 *                                             the ones her summons bring
 *   place    placeSovereign                   stands her on the dais's anchor, guarding
 *                                             the core, hp for the mission's difficulty
 * ```
 *
 * `placeSovereign`'s deps are a superset of `CoreBossPlacement`, so it
 * plugs into the seam unchanged: the core setup hands it the dais's
 * first tile, the platform core's middle tile as `core`, and the
 * mission's difficulty.
 */
export const PLATFORM_CORE_BOSS: CoreBoss | undefined = {
  species: BUG_SPECIES.sovereign,
  escort: SOVEREIGN_TUNING.summon.escort,
  place: placeSovereign,
};
