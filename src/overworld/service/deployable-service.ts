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
import {
  MIN_DEPLOYABLE_LEVEL,
  nextDeployableLevel,
} from "../model/deployable-level";
import type { DeployableRemovedEvent } from "../model/deployable-removed-event";
import { DEPLOYABLE_REMOVED } from "../model/deployable-removed-event";
import type { DeployableTypeId } from "../model/deployable-type";
import { levelSpec } from "../model/deployable-type";
import type { DeployableTypeCatalogue } from "../model/deployable-type-catalogue";
import type { DeployableUpgradedEvent } from "../model/deployable-upgraded-event";
import { DEPLOYABLE_UPGRADED } from "../model/deployable-upgraded-event";
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

/** What upgrading an installation needs injected: no ids, the installation has one. */
export type DeployableUpgradeDeps = Omit<DeployableServiceDeps, "ids">;

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
 * region and the per-type cap for that region, charges the level 1
 * `buildCost` through the transaction service as a `purchase` against
 * the new id, and appends the installation online at level 1 with
 * `builtDay = day`. Pure over its inputs; on any error the state is
 * returned untouched.
 *
 * ```
 *   type?  ──no──► unknown-deployable-type
 *   region? ──no──► unknown-region
 *   count(type in region) < maxPerRegion? ──no──► region-cap-reached
 *   spend(levels[1].buildCost) ──err──► insufficient-credits
 *        │ok
 *        ▼
 *   deployables + { id, typeId, regionId, level: 1, builtDay: day, online: true }
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

  const cost = levelSpec(type, MIN_DEPLOYABLE_LEVEL).buildCost;
  const id = deps.ids.nextId(DEPLOYABLE_ID_PREFIX);
  const paid = deps.transactions.spend(
    state.economy,
    cost,
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
    level: MIN_DEPLOYABLE_LEVEL,
    builtDay: day,
    online: true,
  };
  const built: DeployableBuiltEvent = {
    type: DEPLOYABLE_BUILT,
    payload: { deployable, cost },
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
// Upgrade
// ===========================================

/**
 * Raises an installation one level (GDD §5.6): checks it exists, is not
 * already at `MAX_DEPLOYABLE_LEVEL`, charges the next level's `buildCost`
 * as a `purchase` against the installation's id and rewrites it at the
 * new level. Its online flag is untouched: an offline installation can
 * be upgraded, and comes back when its (now higher) upkeep is paid.
 * Pure over its inputs; on any error the state is returned untouched.
 *
 * ```
 *   deployable? ──no──► unknown-deployable
 *   next level? ──no──► max-level-reached
 *   spend(levels[next].buildCost) ──err──► insufficient-credits
 *        │ok
 *        ▼
 *   deployable' = { ...deployable, level: next }
 *   events: [CreditsChanged, DeployableUpgraded { from, to, cost }]
 * ```
 *
 * @throws {Error} if the installation references a type the catalogue
 *   does not know: a content or save bug, not a game state.
 */
export function upgradeDeployable(
  state: CampaignState,
  deployableId: DeployableId,
  day: number,
  deps: DeployableUpgradeDeps,
): DeployableResult {
  const target = state.overworld.deployables.find((d) => d.id === deployableId);
  if (target === undefined) {
    return err({ code: "unknown-deployable", deployableId });
  }
  const type = deps.catalogue.getDeployableType(target.typeId);
  if (type === undefined) {
    throw new Error(
      `Deployable "${target.id}" has unknown type "${target.typeId}"`,
    );
  }
  const to = nextDeployableLevel(target.level);
  if (to === undefined) {
    return err({
      code: "max-level-reached",
      deployableId,
      level: target.level,
    });
  }

  const cost = levelSpec(type, to).buildCost;
  const paid = deps.transactions.spend(
    state.economy,
    cost,
    "purchase",
    target.id,
    day,
  );
  if (!paid.ok) {
    return err({
      code: "insufficient-credits",
      required: paid.error.required,
      available: paid.error.available,
    });
  }

  const upgraded: Deployable = { ...target, level: to };
  const event: DeployableUpgradedEvent = {
    type: DEPLOYABLE_UPGRADED,
    payload: { deployable: upgraded, from: target.level, to, cost },
  };
  return ok({
    overworld: {
      ...state.overworld,
      deployables: state.overworld.deployables.map((d) =>
        d === target ? upgraded : d,
      ),
    },
    economy: paid.value.state,
    events: [...paid.value.events, event],
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
