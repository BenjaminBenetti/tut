import type { ActId } from "../../content/model/act-id";
import { ACT_IDS } from "../../content/model/act-id";
import type { Transaction } from "../../economy/model/transaction";
import { DEPLOYABLE_ID_PREFIX } from "../../overworld/service/deployable-service";
import { MECH_ID_PREFIX } from "../../roster/model/mech";
import { SQUAD_ID_PREFIX } from "../../roster/model/squad";
import type { CampaignMark } from "./campaign-sweep.test-helper";

// ===========================================
// Accounting a campaign's credits (#1179, GDD §5.5)
// ===========================================
//
// Where a modelled campaign's credits came from and where they went,
// read off the economy ledger, which records every credit movement after
// the campaign starts (`credits = startingCredits + Σ ledger`). Each
// entry lands on one money line by its kind and the id it names, and in
// the act band its day fell in:
//
//   kind           ref                      line
//   reward         a story mission's id     story-reward
//   reward         any other mission        reward
//   salvage        the mission              salvage (mechs lost on a held field)
//   stipend        earth                    stipend (a bank's bonus is folded in)
//   event          +                        event-income
//   event          −                        event-cost
//   sale           +                        sale
//   purchase       squad-…                  squad-hire
//   purchase       mech-…, first against it mech-build
//   purchase       mech-…, after that       mech-upgrade (a part upgrade)
//   purchase       deployable-…, first      deployable-build
//   purchase       deployable-…, after      deployable-upgrade
//   reinforcement  squad-…                  reinforcement
//   repair         mech-…                   repair
//   upkeep         deployable-…             upkeep
//   anything else                           other
//
// A mech the campaign started with was never bought, so every purchase
// against it is an upgrade.

/** The lines credits come in on. */
export const INCOME_LINES = [
  "reward",
  "story-reward",
  "salvage",
  "stipend",
  "event-income",
  "sale",
] as const;

/** The lines credits go out on. */
export const SPENDING_LINES = [
  "squad-hire",
  "reinforcement",
  "mech-build",
  "mech-upgrade",
  "repair",
  "deployable-build",
  "deployable-upgrade",
  "upkeep",
  "event-cost",
  "other",
] as const;

/** A line credits come in on. */
export type IncomeLine = (typeof INCOME_LINES)[number];

/** A line credits go out on. */
export type SpendingLine = (typeof SPENDING_LINES)[number];

/** Any money line. */
export type MoneyLine = IncomeLine | SpendingLine;

/** Every money line, income first. */
export const MONEY_LINES: readonly MoneyLine[] = [
  ...INCOME_LINES,
  ...SPENDING_LINES,
];

/** Whole credits per money line, every amount positive (income in, spending out). */
export type MoneyAccount = Readonly<Record<MoneyLine, number>>;

/** One account per act band. */
export type BandAccounts = Readonly<Record<ActId, MoneyAccount>>;

/** What classifying a ledger needs beyond the entries. */
export interface LedgerContext {
  /** The act band an entry's absolute day fell in; `undefined` drops it. */
  readonly bandOf: (day: number) => ActId | undefined;
  /** The ids of every story mission the campaign was offered. */
  readonly storyMissions: ReadonlySet<string>;
  /** The mechs the campaign started with, which were never bought. */
  readonly startingMechs: ReadonlySet<string>;
}

// ===========================================
// Accounting
// ===========================================

/**
 * Sums `ledger` into one account per act band, by the table above.
 * Entries are read oldest first, so the first purchase against a mech or
 * an installation is its build and any later one its upgrade.
 *
 * @param ledger - The campaign's ledger, oldest first.
 * @param ctx - The band of each day, the story missions and the starting mechs.
 * @returns Every band's account, zero where nothing moved.
 */
export function accountLedger(
  ledger: readonly Transaction[],
  ctx: LedgerContext,
): BandAccounts {
  const accounts = Object.fromEntries(
    ACT_IDS.map((act) => [act, emptyAccount()]),
  ) as Record<ActId, Record<MoneyLine, number>>;
  const bought = new Set<string>(ctx.startingMechs);
  for (const entry of ledger) {
    const line = moneyLineOf(entry, bought, ctx.storyMissions);
    if (entry.kind === "purchase") {
      bought.add(entry.ref);
    }
    const band = ctx.bandOf(entry.day);
    if (band !== undefined) {
      accounts[band][line] += Math.abs(entry.amount);
    }
  }
  return accounts;
}

/**
 * The money line of one ledger entry, by the table above.
 *
 * @param entry - The entry.
 * @param bought - Every ref a purchase named before this entry (and the starting mechs).
 * @param storyMissions - The ids of the campaign's story missions.
 * @returns Its line.
 */
export function moneyLineOf(
  entry: Transaction,
  bought: ReadonlySet<string>,
  storyMissions: ReadonlySet<string>,
): MoneyLine {
  switch (entry.kind) {
    case "reward":
      return storyMissions.has(entry.ref) ? "story-reward" : "reward";
    case "salvage":
      return "salvage";
    case "stipend":
      return "stipend";
    case "sale":
      return "sale";
    case "event":
      return entry.amount >= 0 ? "event-income" : "event-cost";
    case "upkeep":
      return "upkeep";
    case "repair":
      return "repair";
    case "reinforcement":
      return "reinforcement";
    case "purchase":
      return purchaseLine(entry.ref, bought.has(entry.ref));
  }
}

/**
 * The act band each absolute day falls in: the last act that had begun
 * by then, from a record's act marks (days counted from `startDay`).
 *
 * @param acts - When each act began, as a `CampaignRecord` keeps them.
 * @param startDay - The campaign's first absolute day.
 * @returns The band of an absolute day; `undefined` before the campaign.
 */
export function bandOfDay(
  acts: Readonly<Partial<Record<ActId, CampaignMark>>>,
  startDay: number,
): (day: number) => ActId | undefined {
  return (day) => {
    let band: ActId | undefined;
    for (const act of ACT_IDS) {
      const began = acts[act]?.days;
      if (began !== undefined && day - startDay >= began) {
        band = act;
      }
    }
    return band;
  };
}

/**
 * The total of `lines` in `account`.
 *
 * @param account - One band's account.
 * @param lines - The lines to add up.
 * @returns Their sum.
 */
export function totalOf(
  account: MoneyAccount,
  lines: readonly MoneyLine[],
): number {
  return lines.reduce((sum, line) => sum + account[line], 0);
}

// ===========================================
// Helpers
// ===========================================

/** A purchase's line by the prefix of the id it names, and whether that id was bought before. */
function purchaseLine(ref: string, before: boolean): SpendingLine {
  if (ref.startsWith(`${SQUAD_ID_PREFIX}-`)) {
    return "squad-hire";
  }
  if (ref.startsWith(`${MECH_ID_PREFIX}-`)) {
    return before ? "mech-upgrade" : "mech-build";
  }
  if (ref.startsWith(`${DEPLOYABLE_ID_PREFIX}-`)) {
    return before ? "deployable-upgrade" : "deployable-build";
  }
  return "other";
}

/** An account of zeros. */
function emptyAccount(): Record<MoneyLine, number> {
  return Object.fromEntries(MONEY_LINES.map((line) => [line, 0])) as Record<
    MoneyLine,
    number
  >;
}
