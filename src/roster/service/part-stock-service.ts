import type { MechLoadout } from "../model/mech-loadout";
import { loadoutPartIds } from "../model/mech-loadout";
import type { PartId } from "../model/mech-part";
import type { MechStatSheet } from "../model/mech-stat-sheet";
import type { PartCatalogue } from "../model/part-catalogue";
import type { PartStock } from "../model/part-stock";
import { EMPTY_PART_STOCK } from "../model/part-stock";
import type { RosterEvent } from "../model/roster-event";
import { PARTS_STOCKED } from "../model/roster-event";
import type { RosterState } from "../model/roster-state";

// ===========================================
// Types
// ===========================================

/** What stocking parts returns: the next roster and what happened. */
export interface PartsStocked {
  readonly roster: RosterState;
  readonly events: readonly RosterEvent[];
}

/**
 * What building a loadout costs once the stock is drawn on (arc §6.6).
 * The mech bay's Build button and `buildMech` both read it, so the price
 * the button shows is the price the command charges.
 *
 * ```
 *   fullCost = statSheet.totalCost
 *   salvaged = the loadout's parts the stock covers, loadout order
 *   cost     = fullCost − Σ salvaged part base cost, never below 0
 * ```
 */
export interface MechBuildQuote {
  /** Credits the build charges. */
  readonly cost: number;
  /** What it would cost with nothing in stock: the sheet's total. */
  readonly fullCost: number;
  /** The parts fitted from the stock, repeats kept, in loadout order. */
  readonly salvaged: readonly PartId[];
}

// ===========================================
// Stocking
// ===========================================

/**
 * Adds recovered parts to the stock, one count per id listed, and
 * announces them with `PartsStocked`. Nothing to stock hands the roster
 * back untouched with no event. Pure; never mutates `roster`.
 *
 * @param roster - The roster to stock.
 * @param parts - The parts recovered, repeats kept.
 * @param missionId - The mission that brought them home.
 */
export function stockParts(
  roster: RosterState,
  parts: readonly PartId[],
  missionId: string,
): PartsStocked {
  if (parts.length === 0) {
    return { roster, events: [] };
  }
  const stock: Record<PartId, number> = { ...stockOf(roster) };
  for (const id of parts) {
    stock[id] = (stock[id] ?? 0) + 1;
  }
  return {
    roster: { ...roster, partStock: stock },
    events: [{ type: PARTS_STOCKED, payload: { parts, missionId } }],
  };
}

// ===========================================
// Queries
// ===========================================

/** The roster's stock, empty when it has never held a part. */
export function stockOf(roster: RosterState): PartStock {
  return roster.partStock ?? EMPTY_PART_STOCK;
}

/** How many of `id` are in `stock`; 0 when none are. */
export function stockCount(stock: PartStock, id: PartId): number {
  return stock[id] ?? 0;
}

/** Every stocked part and its count, in the stock's key order; zero counts left out. */
export function stockedParts(
  stock: PartStock,
): readonly { readonly id: PartId; readonly count: number }[] {
  return Object.entries(stock)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count }));
}

/**
 * The loadout's parts the stock covers, in `loadoutPartIds` order: each
 * listed part takes one count, so a loadout fitting two of a part with
 * one in stock salvages one.
 *
 * @param loadout - The loadout to build.
 * @param stock - What is in stock.
 */
export function salvageableParts(
  loadout: MechLoadout,
  stock: PartStock,
): readonly PartId[] {
  const left: Record<PartId, number> = { ...stock };
  const salvaged: PartId[] = [];
  for (const id of loadoutPartIds(loadout)) {
    const count = left[id] ?? 0;
    if (count > 0) {
      salvaged.push(id);
      left[id] = count - 1;
    }
  }
  return salvaged;
}

/**
 * What building `loadout` costs today (see `MechBuildQuote`): the sheet's
 * total less the catalogue's base cost of each part the stock covers.
 * Upgrade costs are never salvaged: a recovered part comes home at base
 * level. A salvaged id the catalogue does not know saves nothing.
 *
 * @param loadout - The loadout to build; it must have validated to `statSheet`.
 * @param statSheet - The loadout's validated sheet.
 * @param stock - What is in stock.
 * @param parts - The catalogue that prices the salvaged parts.
 */
export function mechBuildQuote(
  loadout: MechLoadout,
  statSheet: MechStatSheet,
  stock: PartStock,
  parts: PartCatalogue,
): MechBuildQuote {
  const salvaged = salvageableParts(loadout, stock);
  const saved = salvaged.reduce(
    (sum, id) => sum + (parts.getPart(id)?.cost ?? 0),
    0,
  );
  return {
    cost: Math.max(0, statSheet.totalCost - saved),
    fullCost: statSheet.totalCost,
    salvaged,
  };
}

/**
 * The stock with one count of each listed part taken out. A part not in
 * stock is left alone, and a count reaching zero is dropped, so the stock
 * never lists a part it does not hold.
 *
 * @param stock - What is in stock.
 * @param parts - The parts to take, repeats kept.
 */
export function withdrawParts(
  stock: PartStock,
  parts: readonly PartId[],
): PartStock {
  const next: Record<PartId, number> = { ...stock };
  for (const id of parts) {
    const count = next[id] ?? 0;
    if (count <= 1) {
      delete next[id];
    } else {
      next[id] = count - 1;
    }
  }
  return next;
}
