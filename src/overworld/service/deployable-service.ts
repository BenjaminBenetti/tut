import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { EconomyState } from "../../economy/model/economy-state";
import type { TransactionService } from "../../economy/model/transaction-service";
import type { CampaignEvent } from "../model/campaign-event";
import type { CampaignState } from "../model/campaign-state";
import type { Deployable, DeployableId } from "../model/deployable";
import type { DeployableBuiltEvent } from "../model/deployable-built-event";
import { DEPLOYABLE_BUILT } from "../model/deployable-built-event";
import type { DeployableError } from "../model/deployable-error";
import type { DeployableRemovedEvent } from "../model/deployable-removed-event";
import { DEPLOYABLE_REMOVED } from "../model/deployable-removed-event";
import type { DeployableTypeId } from "../model/deployable-type";
import type { DeployableTypeCatalogue } from "../model/deployable-type-catalogue";
import type { OverworldState } from "../model/overworld-state";
import type { RegionId } from "../model/region";
import { findRegion } from "./earth-map-query-service";

// ===========================================
// Types
// ===========================================

/** Prefix the id generator uses for installations, e.g. `"deployable-3"`. */
export const DEPLOYABLE_ID_PREFIX = "deployable";

/** What building an installation needs injected. */
export interface DeployableServiceDeps {
  readonly catalogue: DeployableTypeCatalogue;
  /** The one door credits move through (GDD §5.5). */
  readonly transactions: TransactionService;
  /** Draws the new installation's id. */
  readonly ids: IdGenerator;
}

/** The slices a deployable command replaces, plus what happened. */
export interface DeployableApplied {
  readonly overworld: OverworldState;
  readonly economy: EconomyState;
  readonly events: readonly CampaignEvent[];
}

/** Outcome of a deployable command: new slices, or why it was refused. */
export type DeployableResult = Result<DeployableApplied, DeployableError>;

// ===========================================
// Build
// ===========================================

/**
 * Buys an installation for a region (GDD §5.6): checks the type, the
 * region and the per-type cap for that region, charges `buildCost`
 * through the transaction service as a `purchase` against the new id,
 * and appends the installation online with `builtDay = day`. Pure over
 * its inputs; on any error the state is returned untouched.
 *
 * ```
 *   type?  ──no──► unknown-deployable-type
 *   region? ──no──► unknown-region
 *   count(type in region) < maxPerRegion? ──no──► region-cap-reached
 *   spend(buildCost) ──err──► insufficient-credits
 *        │ok
 *        ▼
 *   deployables + { id, typeId, regionId, builtDay: day, online: true }
 *   events: [CreditsChanged, DeployableBuilt]
 * ```
 *
 * The id is drawn before the spend so the ledger entry can reference it;
 * on a refused spend the dispatcher discards the draw with the rest.
 */
export function buildDeployable(
  state: CampaignState,
  typeId: DeployableTypeId,
  regionId: RegionId,
  day: number,
  deps: DeployableServiceDeps,
): DeployableResult {
  const type = deps.catalogue.getDeployableType(typeId);
  if (type === undefined) {
    return err({ code: "unknown-deployable-type", typeId });
  }
  if (findRegion(state.overworld.map, regionId) === undefined) {
    return err({ code: "unknown-region", regionId });
  }
  const held = state.overworld.deployables.filter(
    (d) => d.typeId === typeId && d.regionId === regionId,
  ).length;
  if (held >= type.maxPerRegion) {
    return err({
      code: "region-cap-reached",
      typeId,
      regionId,
      cap: type.maxPerRegion,
    });
  }

  const id = deps.ids.nextId(DEPLOYABLE_ID_PREFIX);
  const paid = deps.transactions.spend(
    state.economy,
    type.buildCost,
    "purchase",
    id,
    day,
  );
  if (!paid.ok) {
    return err({
      code: "insufficient-credits",
      required: paid.error.required,
      available: paid.error.available,
    });
  }

  const deployable: Deployable = {
    id,
    typeId,
    regionId,
    builtDay: day,
    online: true,
  };
  const built: DeployableBuiltEvent = {
    type: DEPLOYABLE_BUILT,
    payload: { deployable, cost: type.buildCost },
  };
  return ok({
    overworld: {
      ...state.overworld,
      deployables: [...state.overworld.deployables, deployable],
    },
    economy: paid.value.state,
    events: [...paid.value.events, built],
  });
}

// ===========================================
// Decommission
// ===========================================

/**
 * Removes an installation from its region (GDD §5.6). Nothing is
 * refunded and no ledger entry is written; upkeep simply stops. Pure
 * over its inputs.
 */
export function decommissionDeployable(
  state: CampaignState,
  deployableId: DeployableId,
): DeployableResult {
  const target = state.overworld.deployables.find((d) => d.id === deployableId);
  if (target === undefined) {
    return err({ code: "unknown-deployable", deployableId });
  }
  const removed: DeployableRemovedEvent = {
    type: DEPLOYABLE_REMOVED,
    payload: {
      deployableId: target.id,
      typeId: target.typeId,
      regionId: target.regionId,
    },
  };
  return ok({
    overworld: {
      ...state.overworld,
      deployables: state.overworld.deployables.filter((d) => d !== target),
    },
    economy: state.economy,
    events: [removed],
  });
}
