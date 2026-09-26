import type { SitrepId } from "../../../content/model/sitrep-id";
import type { Rng } from "../../../core/model/rng";
import type { Mission } from "../../model/mission";
import type { MissionOfferDecorator } from "../../model/mission-offer-decorator";
import type { NamedAlpha } from "../../model/named-alpha";
import type { Nemesis } from "../../model/nemesis";
import type { NemesisLore } from "../../model/nemesis-lore";
import type { OverworldState } from "../../model/overworld-state";
import { findCity } from "../earth-map-query-service";
import { alphaNemeses } from "../nemesis-service";

// ===========================================
// Constants
// ===========================================

/** The sitrep that crowns a named alpha (campaign arc §11). */
export const ALPHA_PRESENT_SITREP: SitrepId = "alpha-present";

// ===========================================
// The named alpha on the offer
// ===========================================

/**
 * Freezes the named alpha on an Alpha Present offer (campaign arc §8,
 * §11), so the briefing names the bug the map will crown. A living alpha
 * nemesis of the offer's region comes back first, the oldest one no
 * other offer on the board already carries: same name, its scar, its
 * level and its species. Otherwise a name is drawn from the lore on
 * `rng`, skipping names a living nemesis or an offer already carries
 * while any are left, at level 0.
 *
 * ```
 *   no alpha-present, or alpha already set ──► unchanged
 *   alpha nemesis in the city's region, not on the board
 *       ──► { name, level, nemesisId, speciesId, scar }
 *   otherwise ──► { name: rng.pick(unused alpha names), level: 0 }
 * ```
 *
 * Pure: a fresh name is one draw from `rng`, the decorator's own fork.
 *
 * @param mission - The offer, sitreps already rolled.
 * @param state - The overworld the offer is made on.
 * @param rng - This decorator's stream for this offer.
 * @param lore - The names a fresh alpha may take.
 * @returns The offer, with `alpha` when it carries Alpha Present.
 */
export function withNamedAlpha(
  mission: Mission,
  state: OverworldState,
  rng: Rng,
  lore: Pick<NemesisLore, "alphaNames">,
): Mission {
  if (
    mission.alpha !== undefined ||
    !(mission.sitreps ?? []).includes(ALPHA_PRESENT_SITREP)
  ) {
    return mission;
  }
  const returning = returningAlpha(mission, state);
  return {
    ...mission,
    alpha:
      returning === undefined
        ? freshAlpha(state, rng, lore)
        : nemesisAlpha(returning),
  };
}

/**
 * The named-alpha roll as an offer decorator, appended after the sitrep
 * roll it reads.
 *
 * @param lore - The names a fresh alpha may take.
 * @returns The decorator, id `"alpha"`.
 */
export function createNamedAlphaDecorator(
  lore: Pick<NemesisLore, "alphaNames">,
): MissionOfferDecorator {
  return {
    id: "alpha",
    decorate: (mission, state, ctx) =>
      withNamedAlpha(mission, state, ctx.rng, lore),
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The alpha nemesis that comes back on `mission`: the oldest one living
 * in its city's region that no offer on the board carries.
 */
function returningAlpha(
  mission: Mission,
  state: OverworldState,
): Nemesis | undefined {
  const city = findCity(state.map, mission.cityId);
  if (city === undefined) {
    return undefined;
  }
  const carried = new Set(
    state.missions.flatMap((offer) =>
      offer.alpha?.nemesisId === undefined ? [] : [offer.alpha.nemesisId],
    ),
  );
  return alphaNemeses(state.progress).find(
    (nemesis) => nemesis.regionId === city.regionId && !carried.has(nemesis.id),
  );
}

/** The named alpha a nemesis comes back as. */
function nemesisAlpha(nemesis: Nemesis): NamedAlpha {
  return {
    name: nemesis.name,
    level: nemesis.level,
    nemesisId: nemesis.id,
    speciesId: nemesis.speciesId,
    scar: nemesis.scar,
  };
}

/** An alpha met for the first time, named from the unused alpha names. */
function freshAlpha(
  state: OverworldState,
  rng: Rng,
  lore: Pick<NemesisLore, "alphaNames">,
): NamedAlpha {
  const taken = new Set([
    ...state.progress.nemeses.map((nemesis) => nemesis.name),
    ...state.missions.flatMap((offer) =>
      offer.alpha === undefined ? [] : [offer.alpha.name],
    ),
  ]);
  const unused = lore.alphaNames.filter((name) => !taken.has(name));
  return {
    name: rng.pick(unused.length > 0 ? unused : lore.alphaNames),
    level: 0,
  };
}
