import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { EconomyState } from "../../economy/model/economy-state";
import type { TransactionKind } from "../../economy/model/transaction";
import type { TransactionService } from "../../economy/model/transaction-service";
import type { Mech } from "../model/mech";
import { MECH_ID_PREFIX } from "../model/mech";
import type { MechLoadout } from "../model/mech-loadout";
import type { MechRatingTuning } from "../model/mech-rating-tuning";
import type { MechStatSheet } from "../model/mech-stat-sheet";
import type { PartCatalogue } from "../model/part-catalogue";
import type { RosterError } from "../model/roster-error";
import type { RosterApplied } from "../model/roster-event";
import {
  LOADOUT_DELETED,
  LOADOUT_SAVED,
  MECH_BUILT,
  SQUAD_HIRED,
  SQUAD_REINFORCED,
} from "../model/roster-event";
import type { RosterState } from "../model/roster-state";
import type { Squad, SquadId } from "../model/squad";
import { SQUAD_ID_PREFIX } from "../model/squad";
import type { SquadTypeId } from "../model/squad-type";
import type { SquadTypeCatalogue } from "../model/squad-type-catalogue";
import { validateLoadout } from "./loadout-validation-service";
import { createMech } from "./mech-factory";
import { createSquad } from "./squad-factory";

// ===========================================
// Types
// ===========================================

/** What roster commands need injected; nothing here reads the clock or `Math.random`. */
export interface RosterServiceDeps {
  readonly squadTypes: SquadTypeCatalogue;
  readonly parts: PartCatalogue;
  readonly rating: MechRatingTuning;
  /** The one door credits move through; must share `ids` so ledger ids stay unique. */
  readonly transactions: TransactionService;
  /** Issues squad and mech ids. */
  readonly ids: IdGenerator;
}

/** The two slices every roster command reads and returns. */
export interface RosterSlices {
  readonly roster: RosterState;
  readonly economy: EconomyState;
}

/** A roster command's outcome: the new slices and events, or a typed rejection with nothing changed. */
export type RosterResult = Result<RosterApplied, RosterError>;

// ===========================================
// Hire
// ===========================================

/**
 * Hires a fresh, full-strength squad of `typeId` named `name`, charging
 * the type's `hireCost` as a `purchase` against the new squad's id
 * (GDD §5.7). Rejects an unknown type, an empty name or an unaffordable
 * hire without drawing an id or touching either slice.
 */
export function hireSquad(
  slices: RosterSlices,
  typeId: SquadTypeId,
  name: string,
  day: number,
  deps: RosterServiceDeps,
): RosterResult {
  const type = deps.squadTypes.getSquadType(typeId);
  if (type === undefined) {
    return err({ code: "unknown-squad-type", typeId });
  }
  const nameError = checkName(name);
  if (nameError !== undefined) {
    return err(nameError);
  }
  if (!deps.transactions.canAfford(slices.economy, type.hireCost)) {
    return insufficient(slices.economy, type.hireCost);
  }
  const squad = createSquad(type, deps.ids.nextId(SQUAD_ID_PREFIX), name);
  const paid = spend(
    slices.economy,
    type.hireCost,
    "purchase",
    squad.id,
    day,
    deps,
  );
  if (!paid.ok) {
    return paid;
  }
  return ok({
    roster: { ...slices.roster, squads: [...slices.roster.squads, squad] },
    economy: paid.value.economy,
    events: [
      ...paid.value.events,
      { type: SQUAD_HIRED, payload: { squad, cost: type.hireCost } },
    ],
  });
}

// ===========================================
// Reinforce
// ===========================================

/**
 * Adds `soldiers` to a depleted squad at the type's per-soldier rate,
 * recorded as a `reinforcement` against the squad's id. `soldiers` must
 * be a positive whole number no greater than what the squad is missing;
 * a full squad therefore rejects every request.
 */
export function reinforceSquad(
  slices: RosterSlices,
  squadId: SquadId,
  soldiers: number,
  day: number,
  deps: RosterServiceDeps,
): RosterResult {
  const squad = slices.roster.squads.find((s) => s.id === squadId);
  if (squad === undefined) {
    return err({ code: "unknown-squad", squadId });
  }
  const missing = squad.maxStrength - squad.strength;
  if (!Number.isInteger(soldiers) || soldiers < 1 || soldiers > missing) {
    return err({
      code: "invalid-reinforcement",
      squadId,
      requested: soldiers,
      missing,
    });
  }
  const type = deps.squadTypes.getSquadType(squad.typeId);
  if (type === undefined) {
    return err({ code: "unknown-squad-type", typeId: squad.typeId });
  }
  const cost = type.reinforceCostPerSoldier * soldiers;
  const paid = spend(
    slices.economy,
    cost,
    "reinforcement",
    squad.id,
    day,
    deps,
  );
  if (!paid.ok) {
    return paid;
  }
  const reinforced: Squad = { ...squad, strength: squad.strength + soldiers };
  return ok({
    roster: {
      ...slices.roster,
      squads: slices.roster.squads.map((s) =>
        s.id === squadId ? reinforced : s,
      ),
    },
    economy: paid.value.economy,
    events: [
      ...paid.value.events,
      {
        type: SQUAD_REINFORCED,
        payload: {
          squadId,
          from: squad.strength,
          to: reinforced.strength,
          cost,
        },
      },
    ],
  });
}

// ===========================================
// Loadouts
// ===========================================

/**
 * Saves a loadout template under its name, replacing any template of
 * the same name (GDD §5.8: validate, then save). The loadout must pass
 * validation so every saved template is buildable; nothing is charged.
 * Mechs already built from an older template keep their own copy.
 */
export function saveLoadout(
  slices: RosterSlices,
  loadout: MechLoadout,
  deps: RosterServiceDeps,
): RosterResult {
  const nameError = checkName(loadout.name);
  if (nameError !== undefined) {
    return err(nameError);
  }
  const validated = validateLoadout(loadout, deps.parts, deps.rating);
  if (!validated.ok) {
    return err({
      code: "invalid-loadout",
      name: loadout.name,
      errors: validated.error,
    });
  }
  const existing = slices.roster.savedLoadouts.findIndex(
    (l) => l.name === loadout.name,
  );
  const savedLoadouts =
    existing === -1
      ? [...slices.roster.savedLoadouts, loadout]
      : slices.roster.savedLoadouts.map((l, i) =>
          i === existing ? loadout : l,
        );
  return ok({
    roster: { ...slices.roster, savedLoadouts },
    economy: slices.economy,
    events: [
      { type: LOADOUT_SAVED, payload: { loadout, replaced: existing !== -1 } },
    ],
  });
}

/** Removes the saved template named `name`; rejects a name that is not saved. */
export function deleteLoadout(
  slices: RosterSlices,
  name: string,
): RosterResult {
  if (!slices.roster.savedLoadouts.some((l) => l.name === name)) {
    return err({ code: "unknown-loadout", name });
  }
  return ok({
    roster: {
      ...slices.roster,
      savedLoadouts: slices.roster.savedLoadouts.filter((l) => l.name !== name),
    },
    economy: slices.economy,
    events: [{ type: LOADOUT_DELETED, payload: { name } }],
  });
}

// ===========================================
// Build
// ===========================================

/**
 * Builds a mech named `mechName` from the saved template `loadoutName`,
 * charging the stat sheet's `totalCost` as a `purchase` against the new
 * mech's id (GDD §5.8). The template is re-validated at build time so a
 * catalogue change since it was saved cannot produce an unbuildable
 * mech. Rejects without drawing an id or touching either slice.
 *
 * ```
 *   loadoutName ──► saved? ──► valid? ──► affordable? ──► mech + MechBuilt
 *                     │           │            │
 *              unknown-loadout  invalid-loadout  insufficient-credits
 * ```
 */
export function buildMech(
  slices: RosterSlices,
  loadoutName: string,
  mechName: string,
  day: number,
  deps: RosterServiceDeps,
): RosterResult {
  const loadout = slices.roster.savedLoadouts.find(
    (l) => l.name === loadoutName,
  );
  if (loadout === undefined) {
    return err({ code: "unknown-loadout", name: loadoutName });
  }
  const nameError = checkName(mechName);
  if (nameError !== undefined) {
    return err(nameError);
  }
  const validated = validateLoadout(loadout, deps.parts, deps.rating);
  if (!validated.ok) {
    return err({
      code: "invalid-loadout",
      name: loadoutName,
      errors: validated.error,
    });
  }
  const statSheet: MechStatSheet = validated.value;
  if (!deps.transactions.canAfford(slices.economy, statSheet.totalCost)) {
    return insufficient(slices.economy, statSheet.totalCost);
  }
  const mech: Mech = createMech(
    loadout,
    deps.ids.nextId(MECH_ID_PREFIX),
    mechName,
  );
  const paid = spend(
    slices.economy,
    statSheet.totalCost,
    "purchase",
    mech.id,
    day,
    deps,
  );
  if (!paid.ok) {
    return paid;
  }
  return ok({
    roster: { ...slices.roster, mechs: [...slices.roster.mechs, mech] },
    economy: paid.value.economy,
    events: [
      ...paid.value.events,
      {
        type: MECH_BUILT,
        payload: { mech, statSheet, cost: statSheet.totalCost },
      },
    ],
  });
}

// ===========================================
// Private Functions
// ===========================================

/** Rejects an empty or whitespace-only name. */
function checkName(name: string): RosterError | undefined {
  return name.trim() === "" ? { code: "invalid-name", name } : undefined;
}

/** An `insufficient-credits` rejection for `required` against the current balance. */
function insufficient(economy: EconomyState, required: number): RosterResult {
  return err({
    code: "insufficient-credits",
    required,
    available: economy.credits,
  });
}

/**
 * Charges `amount` through the transaction service, folding the
 * economy's error into a `RosterError`. Returns the paid economy and its
 * `CreditsChanged` event.
 */
function spend(
  economy: EconomyState,
  amount: number,
  kind: TransactionKind,
  ref: string,
  day: number,
  deps: RosterServiceDeps,
): Result<Pick<RosterApplied, "economy" | "events">, RosterError> {
  const paid = deps.transactions.spend(economy, amount, kind, ref, day);
  if (!paid.ok) {
    return err({
      code: "insufficient-credits",
      required: paid.error.required,
      available: paid.error.available,
    });
  }
  return ok({ economy: paid.value.state, events: paid.value.events });
}
