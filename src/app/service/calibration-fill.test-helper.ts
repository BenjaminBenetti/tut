import type { SquadType, SquadTypeId } from "../../roster/model/squad-type";
import type { SquadTypeAvailability } from "../../roster/model/squad-type-availability";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";

// ===========================================
// Filling a band's deployment (#1179, campaign arc §12)
// ===========================================
//
// Every band deploys a full eight. Units cost no upkeep, a squad hires
// for 500–900 and a new game starts with 5,000, so a real player fields
// the cap long before Act III. The campaign sweep's modelled player
// never hires (it spends only on its battery and on rebuilding a
// wrecked mech), so its bank at a band's point is money a player would
// have turned into units. The fill spends that median bank on rookies
// (0 xp), one rule for every band:
//
//   open slots = the cap − the starting roster (8 − 5 = 3)
//
//   1. refit mechs, one slot kept for a medic:
//        buy one while it leaves a slot for the medic and the bank
//        still covers the cheapest hire for every slot after it
//   2. a medic, if the bank covers it and the cheapest hire for every
//      slot after it
//   3. any slot left: the best-rated squad the bank covers on the same
//      terms (catalogue order breaks a tie); a slot nothing covers
//      stays empty
//
// Mechs first because a refit mech outrates any squad two to five
// times over; one slot for a medic because the roster already fields
// four squads and nothing in it heals them, and because missions ask
// for squads' kit (capture nets, medkits, scanners), so a force of
// mechs alone is not the game the design plays (GDD §5.7). It is the
// rule the Act III force was built on since #1179 began: a medic and
// two refit mechs. Only types the band's research lets it hire count,
// at their `hireCost`; a mech costs the bay's full price for the
// band's refit, with no salvaged parts in stock.

/** The support type the fill keeps a slot for. */
export const FILL_SUPPORT_TYPE: SquadTypeId = "medic";

/** What a band can buy with its bank. */
export interface FillMarket {
  /** What the bay charges for one mech on the band's refit. */
  readonly mechCost: number;
  /** Every squad type the band may hire, in catalogue order. */
  readonly squadTypes: readonly SquadType[];
}

/** What the fill bought, and the bank on either side of it. */
export interface DeploymentFill {
  /** Refit mechs bought. */
  readonly mechs: number;
  /** Squad types hired, in the order bought. */
  readonly squads: readonly SquadTypeId[];
  /** The bank the fill spent from. */
  readonly bankBefore: number;
  /** What was left of it. */
  readonly bankAfter: number;
}

// ===========================================
// The rule
// ===========================================

/**
 * Fills `open` deployment slots from `bank` by the rule above: refit
 * mechs into all but one slot while the bank covers them, a medic, then
 * the best-rated squad the bank covers for any slot left.
 *
 * @param bank - The band's median bank at its point.
 * @param open - Slots between the starting roster and the cap.
 * @param market - The refit mech's price and the hireable squad types.
 * @returns What was bought and the bank after.
 */
export function fillDeployment(
  bank: number,
  open: number,
  market: FillMarket,
): DeploymentFill {
  const cheapest = Math.min(...market.squadTypes.map((type) => type.hireCost));
  const squads: SquadTypeId[] = [];
  let mechs = 0;
  let left = bank;
  const bought = (): number => mechs + squads.length;
  const covers = (cost: number): boolean => {
    const after = open - bought() - 1;
    return left - cost >= (after > 0 ? cheapest * after : 0);
  };
  while (bought() < open - 1 && covers(market.mechCost)) {
    mechs++;
    left -= market.mechCost;
  }
  const support = market.squadTypes.find(
    (type) => type.id === FILL_SUPPORT_TYPE,
  );
  if (support !== undefined && bought() < open && covers(support.hireCost)) {
    squads.push(support.id);
    left -= support.hireCost;
  }
  const ranked = [...market.squadTypes].sort(
    (a, b) => b.combatRating - a.combatRating,
  );
  while (bought() < open) {
    const pick = ranked.find((type) => covers(type.hireCost));
    if (pick === undefined) break;
    squads.push(pick.id);
    left -= pick.hireCost;
  }
  return { mechs, squads, bankBefore: bank, bankAfter: left };
}

/**
 * The market a band shops in: its refit at `mechCost`, and every squad
 * type of `catalogue` its research lets it hire.
 *
 * @param catalogue - The shipped squad types.
 * @param availability - Which of them the band's research lets it hire.
 * @param mechCost - What the bay charges for the band's refit.
 * @returns The fill's market.
 */
export function fillMarket(
  catalogue: SquadTypeCatalogue,
  availability: SquadTypeAvailability,
  mechCost: number,
): FillMarket {
  return {
    mechCost,
    squadTypes: catalogue
      .listSquadTypes()
      .filter((type) => availability.isAvailable(type.id)),
  };
}

/**
 * A fill in one line for the probe's report, e.g. `2 mechs at 4400 +
 * medic: bank 34988 → 25588`.
 *
 * @param fill - What the fill bought.
 * @param market - What it bought from.
 * @returns The line.
 */
export function fillLine(fill: DeploymentFill, market: FillMarket): string {
  const parts = [
    ...(fill.mechs > 0
      ? [`${String(fill.mechs)} mechs at ${String(market.mechCost)}`]
      : []),
    ...fill.squads,
  ];
  const bought = parts.length > 0 ? parts.join(" + ") : "nothing";
  return `${bought}: bank ${String(fill.bankBefore)} → ${String(fill.bankAfter)}`;
}
