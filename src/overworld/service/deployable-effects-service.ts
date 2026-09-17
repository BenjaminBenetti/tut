import type { Applied } from "../../core/model/domain-event";
import type { CreditsChangedEvent } from "../../economy/model/economy-event";
import type { EconomyState } from "../../economy/model/economy-state";
import type { TransactionService } from "../../economy/model/transaction-service";
import type { CampaignState } from "../model/campaign-state";
import type { CityId } from "../model/city";
import type { Deployable } from "../model/deployable";
import type { DeployableModifiers } from "../model/deployable-modifiers";
import type {
  DeployableLevelSpec,
  DeployableType,
} from "../model/deployable-type";
import { levelSpec } from "../model/deployable-type";
import type { DeployableTypeCatalogue } from "../model/deployable-type-catalogue";
import type {
  DeployableOfflineEvent,
  DeployableOnlineEvent,
} from "../model/overworld-domain-event";
import {
  DEPLOYABLE_OFFLINE,
  DEPLOYABLE_ONLINE,
} from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";
import type { RegionId } from "../model/region";
import { findCity, getRegion } from "./earth-map-query-service";

// ===========================================
// Types
// ===========================================

/** What the upkeep tick needs injected. */
export interface UpkeepDeps {
  readonly catalogue: DeployableTypeCatalogue;
  /** The one door credits move through (GDD §5.5). */
  readonly transactions: TransactionService;
}

/** Everything the upkeep tick can emit: status changes plus each ledger entry. */
export type UpkeepEvent =
  DeployableOfflineEvent | DeployableOnlineEvent | CreditsChangedEvent;

// ===========================================
// Modifiers
// ===========================================

/**
 * Sums what every online deployable does at its current level into the
 * modifier maps the rest of the tick consumes (GDD §5.6). Offline
 * installations contribute nothing. Pure over its inputs.
 *
 * ```
 *   for each online deployable, effect = catalogue[typeId].levels[level].effect:
 *     detectionFactor[region]  = min(detectionFactor[region], effect.detectionFactor)
 *     intelBonus[region]      += effect.intelBonus
 *     growthFactor[city]      *= effect.growthFactor        for each city in region
 *     deterrence[region]       = 1 − (1 − deterrence[region]) × (1 − effect.spreadDeterrence)
 *     garrisonTurrets[region] += effect.garrisonTurrets
 *     incomeBonus             += effect.incomeBonus
 * ```
 *
 * @throws {Error} if a deployable references a type the catalogue does
 *   not know or a region that is not on the map: a content or save bug,
 *   not a game state.
 */
export function computeModifiers(
  overworld: OverworldState,
  catalogue: DeployableTypeCatalogue,
): DeployableModifiers {
  const detectionFactor: Record<RegionId, number> = {};
  const intelBonus: Record<RegionId, number> = {};
  const growthFactor: Record<CityId, number> = {};
  const spreadDeterrence: Record<RegionId, number> = {};
  const garrisonTurrets: Record<RegionId, number> = {};
  let incomeBonus = 0;

  for (const deployable of overworld.deployables) {
    if (!deployable.online) {
      continue;
    }
    const { effect } = specOf(deployable, catalogue);
    const region = getRegion(overworld.map, deployable.regionId);

    if (effect.detectionFactor !== undefined) {
      detectionFactor[region.id] = Math.min(
        detectionFactor[region.id] ?? 1,
        effect.detectionFactor,
      );
    }
    if (effect.intelBonus !== undefined) {
      intelBonus[region.id] = (intelBonus[region.id] ?? 0) + effect.intelBonus;
    }
    if (effect.growthFactor !== undefined) {
      for (const cityId of region.cityIds) {
        growthFactor[cityId] =
          (growthFactor[cityId] ?? 1) * effect.growthFactor;
      }
    }
    if (effect.spreadDeterrence !== undefined) {
      const current = spreadDeterrence[region.id] ?? 0;
      spreadDeterrence[region.id] =
        1 - (1 - current) * (1 - effect.spreadDeterrence);
    }
    if (effect.garrisonTurrets !== undefined) {
      garrisonTurrets[region.id] =
        (garrisonTurrets[region.id] ?? 0) + effect.garrisonTurrets;
    }
    if (effect.incomeBonus !== undefined) {
      incomeBonus += effect.incomeBonus;
    }
  }

  return {
    detectionFactor,
    intelBonus,
    growthFactor,
    spreadDeterrence,
    garrisonTurrets,
    incomeBonus,
  };
}

/**
 * How many garrison turrets a mission fought at `cityId` starts with
 * (GDD §5.6): the `garrisonTurrets` modifier of the city's region, `0`
 * when the region has no online battery or the city is not on the map.
 * The launch path hands this to the tactical mission start.
 */
export function garrisonTurretsFor(
  overworld: OverworldState,
  catalogue: DeployableTypeCatalogue,
  cityId: CityId,
): number {
  const city = findCity(overworld.map, cityId);
  if (city === undefined) {
    return 0;
  }
  return (
    computeModifiers(overworld, catalogue).garrisonTurrets[city.regionId] ?? 0
  );
}

// ===========================================
// Upkeep
// ===========================================

/**
 * Charges one day of upkeep for every deployable, at its current level,
 * in state order, through the transaction service (GDD §5.6). An
 * installation whose upkeep the treasury cannot cover is skipped and
 * goes offline; one that is offline comes back the first day its upkeep
 * can be paid. Credits never go negative and unaffordable installations
 * are never removed.
 *
 * ```
 *   for each deployable:
 *     spend(levels[level].upkeepPerDay) ──ok──► online: true   (DeployableOnline if it was offline)
 *                                       └─err─► online: false  (DeployableOffline if it was online)
 * ```
 *
 * Earlier entries are paid first, so with a thin treasury the oldest
 * installations stay up. Unchanged deployables keep their identity; the
 * input state is never mutated.
 *
 * @throws {Error} if a deployable references an unknown type.
 */
export function chargeUpkeep<TState extends CampaignState>(
  state: TState,
  day: number,
  deps: UpkeepDeps,
): Applied<TState, UpkeepEvent> {
  const events: UpkeepEvent[] = [];
  let economy: EconomyState = state.economy;

  const deployables = state.overworld.deployables.map(
    (deployable): Deployable => {
      const spec = specOf(deployable, deps.catalogue);
      const paid = deps.transactions.spend(
        economy,
        spec.upkeepPerDay,
        "upkeep",
        deployable.id,
        day,
      );
      if (paid.ok) {
        economy = paid.value.state;
        events.push(...paid.value.events);
      }
      const online = paid.ok;
      if (online === deployable.online) {
        return deployable;
      }
      events.push({
        type: online ? DEPLOYABLE_ONLINE : DEPLOYABLE_OFFLINE,
        payload: {
          deployableId: deployable.id,
          typeId: deployable.typeId,
          regionId: deployable.regionId,
        },
      });
      return { ...deployable, online };
    },
  );

  if (events.length === 0) {
    return { state, events };
  }
  return {
    state: {
      ...state,
      overworld: { ...state.overworld, deployables },
      economy,
    },
    events,
  };
}

// ===========================================
// Helpers
// ===========================================

/** Resolves a deployable's type, throwing on a catalogue miss. */
export function typeOf(
  deployable: Deployable,
  catalogue: DeployableTypeCatalogue,
): DeployableType {
  const type = catalogue.getDeployableType(deployable.typeId);
  if (type === undefined) {
    throw new Error(
      `Deployable "${deployable.id}" has unknown type "${deployable.typeId}"`,
    );
  }
  return type;
}

/** The cost, upkeep and effect of a deployable at its current level. */
function specOf(
  deployable: Deployable,
  catalogue: DeployableTypeCatalogue,
): DeployableLevelSpec {
  return levelSpec(typeOf(deployable, catalogue), deployable.level);
}
