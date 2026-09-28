import type { ActId } from "../../content/model/act-id";
import { ACT_IDS } from "../../content/model/act-id";
import type { DeployableTypeCatalogue } from "../../overworld/model/deployable-type-catalogue";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import type { MissionResult } from "../../overworld/model/mission-result";
import type { GameState } from "../../save/model/game-state";
import type { BandAccounts, MoneyAccount } from "./campaign-ledger.test-helper";
import {
  accountLedger,
  bandOfDay,
  INCOME_LINES,
  MONEY_LINES,
  SPENDING_LINES,
  totalOf,
} from "./campaign-ledger.test-helper";
import type { CampaignDay } from "./calibration-force-probe.test-helper";
import {
  dayOf,
  FORCE_POINTS,
  sampleAt,
} from "./calibration-force-probe.test-helper";
import type {
  CampaignRecord,
  SweepGameOptions,
} from "./campaign-sweep.test-helper";
import {
  composeSweepGame,
  playCampaignToEnd,
  quantile,
  SHIPPED_STORY,
} from "./campaign-sweep.test-helper";
import type { ModelledPlayer } from "./modelled-player.test-helper";
import { CAMPAIGN_SWEEP_TUNING } from "./modelled-player.test-helper";
import type { SpendingRules } from "./realistic-spender.test-helper";
import {
  realisticSpender,
  SHIPPED_DEPLOYABLES,
  spendingMarketOf,
  upkeepPerDay,
} from "./realistic-spender.test-helper";

// ===========================================
// The campaign economy probe (#1179, GDD §5.5)
// ===========================================
//
// Where a modelled player's credits come from and where they go, act
// band by act band, and what its bank, roster and installations stand at
// on each band's calibration point (the force probe's, so the Average
// player's banks are the ones the calibration forces were filled from):
//
//   seed ──► playCampaignToEnd(player), observed every day after research
//        ──► every day: the bank, the roster, the installations and their upkeep;
//            per act, the units fielded summed over its days, and its days at the
//            cap and with nobody on the roster
//        ──► every new lastMissionResult: soldiers lost, squads wiped, mechs lost,
//            in the band of the day it was played
//        ──► the last state's ledger ──► accountLedger ──► one account per act band
//        ──► each band's point (act midpoint, finale arrival) ──► that day's snapshot
//
// It reads and changes nothing: the campaign is `playCampaign`'s.

/** One campaign day, after research: the force probe's day, plus the roster and installations. */
export interface EconomyDay extends CampaignDay {
  /** Squads on the roster. */
  readonly squads: number;
  /** Mechs on the roster. */
  readonly mechs: number;
  /** Living soldiers over every squad. */
  readonly soldiers: number;
  /** Installations standing, online or not. */
  readonly installations: number;
  /** Installations online. */
  readonly online: number;
  /** What every installation standing charges a day at its level. */
  readonly upkeepPerDay: number;
}

/**
 * The force one band's days fielded: each day's roster, read once its
 * spending is done and before its mission.
 */
export interface BandForce {
  /** Days read in the act. */
  readonly days: number;
  /** Units on the roster, summed over those days. */
  readonly unitDays: number;
  /** Days with the deployment cap on the roster. */
  readonly fullDays: number;
  /** Days with nobody on the roster, on which the player plays nothing. */
  readonly groundedDays: number;
}

/** What one band's missions cost the roster. */
export interface BandLosses {
  readonly soldiersLost: number;
  readonly squadsWiped: number;
  readonly mechsLost: number;
}

/** One seed's economy in one act band. */
export interface BandEconomy {
  readonly band: ActId;
  /** The band's point, if the campaign reached it. */
  readonly point?: EconomyDay;
  /** Every credit that moved on a day in the act. */
  readonly account: MoneyAccount;
  /** Missions resolved in the act; 0 for an act never reached. */
  readonly missions: number;
  /** Days spent in the act; 0 for an act never reached. */
  readonly days: number;
  readonly losses: BandLosses;
  readonly force: BandForce;
}

/** One seed's campaign and its economy. */
export interface SeedEconomy {
  readonly seed: number;
  readonly record: CampaignRecord;
  readonly bands: Readonly<Record<ActId, BandEconomy>>;
  /** The campaign's last day. */
  readonly end: EconomyDay;
}

/** What a probe composes and plays: the sweep's story, and an opt-in player's spending. */
export interface EconomyProbeOptions extends SweepGameOptions {
  /** How the player spends; the sweep's `spendCredits` when absent. */
  readonly spending?: SpendingRules;
}

/** The seeds the probe plays: 1 to 24, the force probe's. */
export const ECONOMY_PROBE_SEEDS: readonly number[] = Array.from(
  { length: 24 },
  (_, index) => index + 1,
);

// ===========================================
// Probing
// ===========================================

/**
 * Plays `player` on every seed of `seeds` through the sweep's game and
 * accounts each campaign, band by band (see the header).
 *
 * @param player - The modelled player.
 * @param seeds - Campaign seeds.
 * @param options - The story the game is composed with (the shipped one
 *   by default), and the opt-in player's spending, if it has one.
 * @returns One economy per seed, in seed order.
 */
export function probeEconomy(
  player: ModelledPlayer,
  seeds: readonly number[] = ECONOMY_PROBE_SEEDS,
  options: EconomyProbeOptions = {},
): readonly SeedEconomy[] {
  const story = options.story ?? SHIPPED_STORY;
  return seeds.map((seed) => {
    const game = composeSweepGame(player, { story });
    const spend =
      options.spending === undefined
        ? undefined
        : realisticSpender(options.spending, spendingMarketOf(game.content));
    const days: EconomyDay[] = [];
    const played: { result: MissionResult; day: number }[] = [];
    const storyMissions = new Set<string>();
    let startDay: number | undefined;
    const note = (state: GameState, day: number): void => {
      const result = state.overworld.lastMissionResult;
      if (
        result !== undefined &&
        !played.some((each) => each.result.missionId === result.missionId)
      ) {
        played.push({ result, day });
      }
    };
    const { record, first, state } = playCampaignToEnd(
      game,
      player,
      seed,
      CAMPAIGN_SWEEP_TUNING,
      story.rules,
      (current, missions) => {
        startDay ??= current.overworld.day;
        note(current, current.overworld.day - 1);
        for (const mission of current.overworld.missions) {
          if (mission.storyId !== undefined) storyMissions.add(mission.id);
        }
        days.push(
          economyDayOf(current, seed, missions, startDay, SHIPPED_DEPLOYABLES),
        );
      },
      spend,
    );
    const firstDay = first.overworld.day;
    note(state, state.overworld.day - 1);
    const bandOf = bandOfDay(record.acts, firstDay);
    const accounts = accountLedger(state.economy.ledger, {
      bandOf,
      storyMissions,
      startingMechs: new Set(first.roster.mechs.map((mech) => mech.id)),
    });
    return {
      seed,
      record,
      bands: bandsOf(record, days, accounts, played, bandOf),
      end: economyDayOf(
        state,
        seed,
        record.missions,
        firstDay,
        SHIPPED_DEPLOYABLES,
      ),
    };
  });
}

/**
 * One day's `EconomyDay`: the force probe's `dayOf`, plus the roster's
 * size and the installations' count, online count and daily upkeep.
 *
 * @param state - The day's state.
 * @param seed - The campaign's seed.
 * @param missions - Missions played before the day's.
 * @param startDay - The campaign's first day.
 * @param catalogue - Prices each installation's upkeep.
 * @returns The day.
 */
export function economyDayOf(
  state: GameState,
  seed: number,
  missions: number,
  startDay: number,
  catalogue: DeployableTypeCatalogue,
): EconomyDay {
  const { squads, mechs } = state.roster;
  const { deployables } = state.overworld;
  return {
    ...dayOf(state, seed, missions, startDay),
    squads: squads.length,
    mechs: mechs.length,
    soldiers: squads.reduce((sum, squad) => sum + squad.strength, 0),
    installations: deployables.length,
    online: deployables.filter((each) => each.online).length,
    upkeepPerDay: upkeepPerDay(deployables, catalogue),
  };
}

// ===========================================
// Report
// ===========================================

/** One summary line: a metric's spread over a player's seeds in one band. */
export interface EconomyLine {
  readonly player: string;
  readonly band: ActId | "campaign";
  readonly metric: string;
  /** Seeds the metric was defined for. */
  readonly n: number;
  readonly min: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly max: number;
  readonly mean: number;
}

/** The point metrics, read on a band's point day. */
export const POINT_METRICS = [
  "missions",
  "days",
  "threat",
  "bank",
  "squads",
  "mechs",
  "units",
  "soldiers",
  "installations",
  "online",
  "upkeep_per_day",
] as const;

/** The act metrics, over the whole act. */
export const ACT_METRICS = [
  "missions",
  "days",
  "soldiers_lost",
  "squads_wiped",
  "mechs_lost",
  "force_days",
  "unit_days",
  "full_days",
  "grounded_days",
  "income",
  "spending",
  "net",
  ...MONEY_LINES,
] as const;

/** The per-seed band TSV's header. */
export function economyBandsHeader(): string[] {
  return [
    "player",
    "seed",
    "band",
    "reached",
    ...POINT_METRICS.map((metric) => `point_${metric}`),
    ...ACT_METRICS.map((metric) => `act_${metric}`),
  ];
}

/**
 * One seed's band as a TSV row, in `economyBandsHeader`'s order; the
 * point cells are blank when the band's point was never reached.
 */
export function economyBandRow(
  player: string,
  economy: SeedEconomy,
  band: ActId,
): string[] {
  const at = economy.bands[band];
  const point = at.point;
  return [
    player,
    String(economy.seed),
    band,
    point === undefined ? "0" : "1",
    ...POINT_METRICS.map((metric) =>
      point === undefined ? "" : formatted(pointMetric(point, metric)),
    ),
    ...ACT_METRICS.map((metric) => formatted(actMetric(at, metric))),
  ];
}

/**
 * The spread of every point and act metric over `economies`, band by
 * band, then the act metrics summed over the whole campaign.
 */
export function summariseEconomy(
  player: string,
  economies: readonly SeedEconomy[],
): EconomyLine[] {
  const lines: EconomyLine[] = [];
  for (const band of ACT_IDS) {
    for (const metric of POINT_METRICS) {
      const values = economies.flatMap((economy) => {
        const point = economy.bands[band].point;
        return point === undefined ? [] : [pointMetric(point, metric)];
      });
      lines.push(spreadOf(player, band, `point.${metric}`, values));
    }
    for (const metric of ACT_METRICS) {
      const values = economies
        .filter((economy) => economy.bands[band].days > 0)
        .map((economy) => actMetric(economy.bands[band], metric));
      lines.push(spreadOf(player, band, `act.${metric}`, values));
    }
  }
  for (const metric of ACT_METRICS) {
    const values = economies.map((economy) =>
      ACT_IDS.reduce(
        (sum, band) => sum + actMetric(economy.bands[band], metric),
        0,
      ),
    );
    lines.push(spreadOf(player, "campaign", `act.${metric}`, values));
  }
  return lines;
}

/** The summary TSV's header. */
export const ECONOMY_SUMMARY_HEADER: readonly string[] = [
  "player",
  "band",
  "metric",
  "n",
  "min",
  "q1",
  "median",
  "q3",
  "max",
  "mean",
];

/** Summary lines as TSV rows, to one decimal. */
export function economySummaryRows(lines: readonly EconomyLine[]): string[][] {
  return lines.map((line) => [
    line.player,
    line.band,
    line.metric,
    String(line.n),
    ...[line.min, line.q1, line.median, line.q3, line.max, line.mean].map(
      (value) => (Number.isNaN(value) ? "" : value.toFixed(1)),
    ),
  ]);
}

// ===========================================
// Helpers
// ===========================================

/**
 * Each band's economy: its point, its account, and the missions, days
 * and losses of its act, from the record's act marks.
 */
function bandsOf(
  record: CampaignRecord,
  days: readonly EconomyDay[],
  accounts: BandAccounts,
  played: readonly { result: MissionResult; day: number }[],
  bandOf: (day: number) => ActId | undefined,
): Record<ActId, BandEconomy> {
  const bands = {} as Record<ActId, BandEconomy>;
  ACT_IDS.forEach((band, index) => {
    const began = record.acts[band];
    const next = ACT_IDS.slice(index + 1)
      .map((act) => record.acts[act])
      .find((mark) => mark !== undefined);
    const sample = sampleAt(days, FORCE_POINTS[band]);
    const point =
      sample === undefined
        ? undefined
        : days.find((day) => day.days === sample.days);
    const losses = played
      .filter((each) => bandOf(each.day) === band)
      .reduce<BandLosses>(
        (sum, { result }) => ({
          soldiersLost:
            sum.soldiersLost +
            result.squadCasualties.reduce((n, each) => n + each.losses, 0),
          squadsWiped: sum.squadsWiped + result.squadsWiped.length,
          mechsLost: sum.mechsLost + result.mechsDestroyed.length,
        }),
        { soldiersLost: 0, squadsWiped: 0, mechsLost: 0 },
      );
    bands[band] = {
      band,
      ...(point === undefined ? {} : { point }),
      account: accounts[band],
      missions:
        began === undefined
          ? 0
          : (next?.missions ?? record.missions) - began.missions,
      days: began === undefined ? 0 : (next?.days ?? record.days) - began.days,
      losses,
      force: forceOf(days.filter((day) => day.act === band)),
    };
  });
  return bands;
}

/** The force `days` fielded (`BandForce`). */
function forceOf(days: readonly EconomyDay[]): BandForce {
  const units = days.map((day) => day.squads + day.mechs);
  return {
    days: days.length,
    unitDays: units.reduce((sum, count) => sum + count, 0),
    fullDays: units.filter((count) => count >= MAX_DEPLOYED_UNITS).length,
    groundedDays: units.filter((count) => count === 0).length,
  };
}

/** One point metric of a day. */
function pointMetric(
  day: EconomyDay,
  metric: (typeof POINT_METRICS)[number],
): number {
  switch (metric) {
    case "bank":
      return day.credits;
    case "units":
      return day.squads + day.mechs;
    case "upkeep_per_day":
      return day.upkeepPerDay;
    default:
      return day[metric];
  }
}

/** One act metric of a band. */
function actMetric(
  band: BandEconomy,
  metric: (typeof ACT_METRICS)[number],
): number {
  switch (metric) {
    case "missions":
      return band.missions;
    case "days":
      return band.days;
    case "soldiers_lost":
      return band.losses.soldiersLost;
    case "squads_wiped":
      return band.losses.squadsWiped;
    case "mechs_lost":
      return band.losses.mechsLost;
    case "force_days":
      return band.force.days;
    case "unit_days":
      return band.force.unitDays;
    case "full_days":
      return band.force.fullDays;
    case "grounded_days":
      return band.force.groundedDays;
    case "income":
      return totalOf(band.account, INCOME_LINES);
    case "spending":
      return totalOf(band.account, SPENDING_LINES);
    case "net":
      return (
        totalOf(band.account, INCOME_LINES) -
        totalOf(band.account, SPENDING_LINES)
      );
    default:
      return band.account[metric];
  }
}

/** A metric's spread as one summary line. */
function spreadOf(
  player: string,
  band: ActId | "campaign",
  metric: string,
  values: readonly number[],
): EconomyLine {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    player,
    band,
    metric,
    n: sorted.length,
    min: sorted[0] ?? Number.NaN,
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1] ?? Number.NaN,
    mean:
      sorted.length === 0
        ? Number.NaN
        : sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  };
}

/** A whole number as is, anything else to one decimal. */
function formatted(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
