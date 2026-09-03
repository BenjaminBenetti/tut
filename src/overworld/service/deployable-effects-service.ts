import type { Applied } from "../../core/model/domain-event";
import type { CreditsChangedEvent } from "../../economy/model/economy-event";
import type { EconomyState } from "../../economy/model/economy-state";
import type { TransactionService } from "../../economy/model/transaction-service";
import type { CampaignState } from "../model/campaign-state";
import type { CityId } from "../model/city";
import type { Deployable } from "../model/deployable";
import type { DeployableModifiers } from "../model/deployable-modifiers";
import type { DeployableType } from "../model/deployable-type";
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
import { getRegion } from "./earth-map-query-service";

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
 * Sums what every online deployable does into the modifier maps the rest
 * of the tick consumes (GDD §5.6). Offline installations contribute
 * nothing. Pure over its inputs.
 *
 * ```
 *   for each online deployable, type = catalogue[typeId]:
 *     suppression[city]      += type.effect.suppression   for each city in region
 *     deterrence[region]      = 1 − (1 − deterrence[region]) × (1 − type.effect.spreadDeterrence)
 *     intelBonus[region]     += type.effect.intelBonus
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
  const suppression: Record<CityId, number> = {};
  const spreadDeterrence: Record<RegionId, number> = {};
  const intelBonus: Record<RegionId, number> = {};

  for (const deployable of overworld.deployables) {
    if (!deployable.online) {
      continue;
    }
    const { effect } = typeOf(deployable, catalogue);
    const region = getRegion(overworld.map, deployable.regionId);

    if (effect.suppression !== undefined) {
      for (const cityId of region.cityIds) {
        suppression[cityId] = (suppression[cityId] ?? 0) + effect.suppression;
      }
    }
    if (effect.spreadDeterrence !== undefined) {
      const current = spreadDeterrence[region.id] ?? 0;
      spreadDeterrence[region.id] =
        1 - (1 - current) * (1 - effect.spreadDeterrence);
    }
    if (effect.intelBonus !== undefined) {
      intelBonus[region.id] = (intelBonus[region.id] ?? 0) + effect.intelBonus;
    }
  }

  return { suppression, spreadDeterrence, intelBonus };
}

// ===========================================
// Upkeep
// ===========================================

/**
 * Charges one day of upkeep for every deployable, in state order, through
 * the transaction service (GDD §5.6). An installation whose upkeep the
 * treasury cannot cover is skipped and goes offline; one that is offline
 * comes back the first day its upkeep can be paid. Credits never go
 * negative and unaffordable installations are never removed.
 *
 * ```
 *   for each deployable:
 *     spend(upkeep) ──ok──► online: true   (DeployableOnline if it was offline)
 *                   └─err─► online: false  (DeployableOffline if it was online)
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
      const type = typeOf(deployable, deps.catalogue);
      const paid = deps.transactions.spend(
        economy,
        type.upkeepPerDay,
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
function typeOf(
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
