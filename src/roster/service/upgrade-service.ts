import { err, ok } from "../../core/model/result";
import type { TransactionService } from "../../economy/model/transaction-service";
import type { Mech, MechId } from "../model/mech";
import { loadoutPartIds } from "../model/mech-loadout";
import type { PartId } from "../model/mech-part";
import type { PartCatalogue } from "../model/part-catalogue";
import { PART_UPGRADED } from "../model/roster-event";
import type { UpgradeTuning } from "../model/upgrade-tuning";
import { upgradeCost } from "./part-stat-service";
import type { RosterResult, RosterSlices } from "./roster-service";

// ===========================================
// Types
// ===========================================

/** What upgrading needs injected. */
export interface UpgradeServiceDeps {
  readonly parts: PartCatalogue;
  readonly upgrades: UpgradeTuning;
  readonly transactions: TransactionService;
}

// ===========================================
// Public Functions
// ===========================================

/**
 * Raises one fitted part on a mech by a level, charging `upgradeCost` as
 * a `purchase` against the mech's id (GDD §5.7). Rejects an unknown
 * mech, a part the mech does not carry, a part missing from the
 * catalogue, a part already at `maxLevel`, or an unaffordable upgrade,
 * without touching either slice. Levels live on the mech's own loadout
 * copy, so the saved template is unaffected.
 *
 * ```
 *   mechId, partId ──► fitted? ──► level < max? ──► affordable? ──► upgrades[partId] + 1
 * ```
 */
export function upgradePart(
  slices: RosterSlices,
  mechId: MechId,
  partId: PartId,
  day: number,
  deps: UpgradeServiceDeps,
): RosterResult {
  const mech = slices.roster.mechs.find((m) => m.id === mechId);
  if (mech === undefined) {
    return err({ code: "unknown-mech", mechId });
  }
  if (!loadoutPartIds(mech.loadout).includes(partId)) {
    return err({ code: "part-not-fitted", mechId, partId });
  }
  const part = deps.parts.getPart(partId);
  if (part === undefined) {
    return err({ code: "unknown-part", partId });
  }
  const level = mech.loadout.upgrades?.[partId] ?? 0;
  if (level >= deps.upgrades.maxLevel) {
    return err({ code: "max-upgrade-level", mechId, partId, level });
  }
  const next = level + 1;
  const cost = upgradeCost(part, next, deps.upgrades);
  const paid = deps.transactions.spend(
    slices.economy,
    cost,
    "purchase",
    mechId,
    day,
  );
  if (!paid.ok) {
    return err({
      code: "insufficient-credits",
      required: paid.error.required,
      available: paid.error.available,
    });
  }
  const upgraded: Mech = {
    ...mech,
    loadout: {
      ...mech.loadout,
      upgrades: { ...mech.loadout.upgrades, [partId]: next },
    },
  };
  return ok({
    roster: {
      ...slices.roster,
      mechs: slices.roster.mechs.map((m) => (m.id === mechId ? upgraded : m)),
    },
    economy: paid.value.state,
    events: [
      ...paid.value.events,
      {
        type: PART_UPGRADED,
        payload: { mechId, partId, from: level, to: next, cost },
      },
    ],
  });
}
