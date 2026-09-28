import type { ActId } from "../../content/model/act-id";
import { ACT_IDS } from "../../content/model/act-id";
import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import { MISSION_TYPE_IDS } from "../../content/model/mission-type-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import { STORY_MISSION_IDS } from "../../content/model/story-mission-id";
import type { DomainEvent } from "../../core/model/domain-event";
import { ACT_ADVANCED } from "../../overworld/model/act-advanced-event";
import type { ActAdvancedPayload } from "../../overworld/model/act-advanced-event";
import { advanceDay } from "../../overworld/model/advance-day-command";
import { buildDeployable } from "../../overworld/model/build-deployable-command";
import { buildMech } from "../../overworld/model/build-mech-command";
import { CAMPAIGN_FLAG_SET } from "../../overworld/model/campaign-flag-set-event";
import type { CampaignFlagSetPayload } from "../../overworld/model/campaign-flag-set-event";
import { DEPLOYABLE_BUILT } from "../../overworld/model/deployable-built-event";
import { AUTO_RESOLVE_TUNING } from "../../overworld/data/auto-resolve-tuning";
import { GAME_ENDED } from "../../overworld/model/game-ended-event";
import { HIVE_FORMED } from "../../overworld/model/hive-formed-event";
import { launchMission } from "../../overworld/model/launch-mission-command";
import type { Mission } from "../../overworld/model/mission";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { MISSION_OFFERED } from "../../overworld/model/mission-offered-event";
import type { MissionOfferedPayload } from "../../overworld/model/mission-offered-event";
import type { MissionResult } from "../../overworld/model/mission-result";
import { MISSION_RESOLVED } from "../../overworld/model/mission-resolved-event";
import type { MissionResolvedPayload } from "../../overworld/model/mission-resolved-event";
import { unlockTech } from "../../overworld/model/unlock-tech-command";
import type { StoryMissionRules } from "../../overworld/model/story-mission-rule";
import type { StoryDeps } from "../../overworld/service/story-service";
import { actExists } from "../../overworld/service/story-service";
import { STORY_MISSION_RULES } from "../../overworld/service/story/story-mission-rules";
import { STORY_SPINE } from "../../overworld/data/story-spine";
import { regionInfestation } from "../../overworld/service/threat-service";
import { MECH_BUILT, MECH_DESTROYED } from "../../roster/model/roster-event";
import type { GameState } from "../../save/model/game-state";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { SITREP_TUNING } from "../../tactical/data/sitrep-tuning";
import { TECH_UNLOCKED } from "../../tech/model/tech-event";
import type { TechUnlockedPayload } from "../../tech/model/tech-event";
import type {
  TechNode,
  TechNodeId,
  TechNodeKind,
} from "../../tech/model/tech-node";
import { TECH_NODE_KINDS } from "../../tech/model/tech-node";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";
import type { ModelledResultContext } from "./modelled-mission-results.test-helper";
import type {
  CampaignSweepTuning,
  ModelledPlayer,
} from "./modelled-player.test-helper";
import {
  chooseOffer,
  deploymentFor,
  isIntelFunded,
  ModelledMissionResolver,
  nextResearch,
  playsOn,
  resultContextFor,
} from "./modelled-player.test-helper";

// ===========================================
// Types
// ===========================================

/** How a swept campaign ended: an outcome, or still open at the day cap. */
export type CampaignEnd = "victory" | "defeat" | "open";

/** Where the campaign stood at a moment: missions played, days elapsed, threat. */
export interface CampaignMark {
  readonly missions: number;
  readonly days: number;
  readonly threat: number;
}

/** Where the campaign stood right after its `missions`-th mission, with the tech points in by then. */
export interface SeriesPoint extends CampaignMark {
  /** Tech points that had come in by then, from every source. */
  readonly tpEarned: number;
}

/** What one story mission did over a campaign. */
export interface StoryTrack {
  /** Days elapsed when it was first pinned, if ever. */
  readonly pinnedDays?: number;
  /** When it was first won, if ever. */
  readonly won?: CampaignMark;
  /**
   * How many times it was played and not won (an extraction counts). A
   * story mission offered more than once under one id (the three Great
   * Hives) counts every play that was not won, before or after its first
   * win.
   */
  readonly losses: number;
  /** Tech points its plays brought home. */
  readonly tp: number;
}

/**
 * What one mission type's ordinary offers did over a campaign: how often
 * it was offered, played and won, and the tech points it brought home
 * (harvests included). Story missions are counted in their `StoryTrack`
 * instead, so a type built on another (Uplink on Defend Installation, a
 * Great Hive on Hive Assault) does not hide that type's own offers. The
 * model's honesty check: a type never offered or never played is a gap
 * in the model, not a finding about the game.
 */
export interface TypeTrack {
  readonly offered: number;
  readonly played: number;
  readonly won: number;
  readonly tp: number;
}

/**
 * One modelled campaign, played to its end or the day cap (campaign arc
 * §12). Days are counted from the campaign's first day.
 */
export interface CampaignRecord {
  readonly player: ModelledPlayer["id"];
  readonly seed: number;
  readonly end: CampaignEnd;
  /** What ended it (`threat` or `story`); absent while open. */
  readonly cause?: string;
  /** Days played. */
  readonly days: number;
  readonly missions: number;
  readonly won: number;
  readonly extracted: number;
  readonly lost: number;
  /** When each act began; act-1 at the start. Absent for an act never reached. */
  readonly acts: Readonly<Partial<Record<ActId, CampaignMark>>>;
  /** Every story mission's track, built or not. */
  readonly stories: Readonly<Record<StoryMissionId, StoryTrack>>;
  /** When each Intel-funded node (`intel`, `story`) was researched. */
  readonly research: Readonly<Record<TechNodeId, CampaignMark>>;
  /** Days elapsed when each flag was first set. */
  readonly flagDays: Readonly<Partial<Record<CampaignFlagId, number>>>;
  /** Tech points that came in over the campaign, from every source. */
  readonly tpEarned: number;
  /** Tech points spent, by node kind. */
  readonly tpSpent: Readonly<Record<TechNodeKind, number>>;
  /** Nodes researched, by kind. */
  readonly nodes: Readonly<Record<TechNodeKind, number>>;
  /** Missions played when the last part node was researched, if it was. */
  readonly partsDoneMissions?: number;
  /** When the victory or defeat came, if it did. */
  readonly ended?: CampaignMark;
  readonly peakThreat: number;
  readonly endThreat: number;
  readonly hivesFormed: number;
  /** Every mission type's offers, plays, wins and tech points. */
  readonly types: Readonly<Record<MissionTypeId, TypeTrack>>;
  /** Mechs destroyed on missions (`MechDestroyed`). */
  readonly mechsLost: number;
  /** Mechs built to replace them (`MechBuilt`). */
  readonly mechsBuilt: number;
  /** Installations built (`DeployableBuilt`). */
  readonly installations: number;
  /** One point per mission played, in order: `series[n - 1]` is right after mission `n`. */
  readonly series: readonly SeriesPoint[];
  /**
   * For each built story rule gated on flags (arc D2): days from the
   * gate opening (every `pinWhen` flag set, in the rule's act) to its
   * first pin. Absent when the gate never opened, or the campaign ended
   * before a tick could pin it.
   */
  readonly gateLags: Readonly<Partial<Record<StoryMissionId, number>>>;
}

/** How many times a story mission was played: its losses, and its first win. */
export function storyPlays(track: StoryTrack): number {
  return track.losses + (track.won === undefined ? 0 : 1);
}

/**
 * Watches a campaign as `playCampaign` plays it: called once a day, after
 * the day's research and before its mission, with the missions played so
 * far. It reads the state; it never changes the campaign.
 */
export type CampaignObserver = (
  state: GameState,
  missionsPlayed: number,
) => void;

/**
 * Spends a modelled player's credits on one day, before its research,
 * and returns the state after. `commands` dispatch through the
 * campaign's tracker, so every purchase is recorded like any command.
 */
export type CreditSpender = (
  state: GameState,
  commands: SpendingCommands,
) => GameState;

/** How a `CreditSpender` buys, and what it may read of the campaign's start. */
export interface SpendingCommands {
  /** Dispatches a purchase the spender has checked; a refusal is a harness bug and throws. */
  readonly apply: (state: GameState, command: OverworldCommand) => GameState;
  /** Dispatches a purchase the game may refuse (the credits do not cover it): `undefined` then. */
  readonly attempt: TryCommand;
  /** The campaign's first state, as created. */
  readonly first: GameState;
}

/** What a sweep composes a game from: the story, the shipped one unless a test swaps it. */
export interface SweepGameOptions {
  readonly story?: StoryDeps;
}

// ===========================================
// Composition
// ===========================================

/** The clock every swept campaign is stamped with; nothing in the simulation reads it. */
export const SWEEP_NOW = "2026-09-26T00:00:00.000Z";

/**
 * The reward scale and sitrep pricing the modelled results pay on: the
 * ones the shipped resolvers pay on.
 */
export const SWEEP_RESULTS: Omit<ModelledResultContext, "harvested"> = {
  rewards: AUTO_RESOLVE_TUNING,
  salvage: SITREP_TUNING.salvageRich,
};

/**
 * The real game, composed over memory storage, whose every mission is
 * resolved by `player`'s modelled resolver. Everything else, the day
 * tick, the director, the launch handler, the consequence rules, the
 * story and the tech tree, is the shipped composition.
 */
export function composeSweepGame(
  player: ModelledPlayer,
  options: SweepGameOptions = {},
): GameComposition {
  return composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => SWEEP_NOW },
    newSeed: () => 1,
    onAutosaveFailure: (error) => {
      throw new Error(`autosave failed: ${error.kind}`);
    },
    resolver: new ModelledMissionResolver(
      player,
      resultContextFor(player, SWEEP_RESULTS),
    ),
    ...(options.story === undefined ? {} : { story: options.story }),
  });
}

/** The story the shipped game runs. */
export const SHIPPED_STORY: StoryDeps = {
  rules: STORY_MISSION_RULES,
  spine: STORY_SPINE,
};

/** The shipped story with some rules replaced: for sabotage checks and projections. */
export function storyWith(rules: StoryMissionRules): StoryDeps {
  return { rules: { ...STORY_MISSION_RULES, ...rules }, spine: STORY_SPINE };
}

/**
 * The last act `story` builds (arc §13: acts exist contiguously from
 * Act I), whose ending mission wins the campaign.
 */
export function lastActOf(story: StoryDeps): ActId {
  const built = ACT_IDS.filter((act) => actExists(act, story));
  const last = built[built.length - 1];
  if (last === undefined) {
    throw new Error("no act is built");
  }
  return last;
}

/**
 * A projection, not the game: the shipped story with the last built
 * act's ending stripped of its effects, so winning it neither advances
 * the act nor wins the campaign, and the campaign plays on until threat
 * ends it or the day cap. It shows where today's threat and income
 * would stand at the mission counts the arc wants later acts at.
 */
export function endlessStory(): StoryDeps {
  const ending = SHIPPED_STORY.spine[lastActOf(SHIPPED_STORY)].endedBy;
  const rule = SHIPPED_STORY.rules[ending];
  if (rule === undefined) {
    throw new Error(`${ending} is not built`);
  }
  return storyWith({ [ending]: { ...rule, onWon: [] } });
}

// ===========================================
// Playing
// ===========================================

/**
 * Plays one campaign of `player` on `seed` to its end or the day cap,
 * through the real dispatcher, and records it.
 *
 * ```
 *   every day, until an outcome or the day cap:
 *     spend     BuildDeployable (its one installation, while none stands),
 *               BuildMech (a lost mech, from the first saved template), when affordable
 *     research  nextResearch → UnlockTech, until the player waits
 *     play      on a play day, chooseOffer → LaunchMission (resolver, settle,
 *               consequences, story), with every squad and mech
 *     advance   AdvanceDay (upkeep … director … threat, outcome)
 * ```
 *
 * Commands go straight to `game.dispatcher`, no session or autosave, so
 * nothing but the simulation runs. A refused command is a harness bug
 * and throws. `rules` are the story rules `game` was composed with, for
 * timing their gates. `observe`, if given, sees each day's state once
 * its research is done (the calibration forces are read this way).
 */
export function playCampaign(
  game: GameComposition,
  player: ModelledPlayer,
  seed: number,
  tuning: Pick<CampaignSweepTuning, "dayCap">,
  rules: StoryMissionRules = STORY_MISSION_RULES,
  observe?: CampaignObserver,
): CampaignRecord {
  return playCampaignToEnd(game, player, seed, tuning, rules, observe).record;
}

/** A played campaign: its record, and the states it began and ended in. */
export interface PlayedCampaign {
  readonly record: CampaignRecord;
  /** The campaign's first state, as created, before its first day's spending. */
  readonly first: GameState;
  /** The campaign's last state: its whole ledger, roster and installations. */
  readonly state: GameState;
}

/**
 * `playCampaign`, returning the campaign's last state beside its record,
 * for a probe that reads what the record does not keep (the ledger, the
 * graveyard). With the default `spend` it plays exactly what
 * `playCampaign` plays; an opt-in player's spender replaces the spend
 * step and nothing else.
 */
export function playCampaignToEnd(
  game: GameComposition,
  player: ModelledPlayer,
  seed: number,
  tuning: Pick<CampaignSweepTuning, "dayCap">,
  rules: StoryMissionRules = STORY_MISSION_RULES,
  observe?: CampaignObserver,
  spend: CreditSpender = sweepSpender(player),
): PlayedCampaign {
  const tracker = new CampaignTracker(game, player, seed, rules);
  const ctx = resultContextFor(player, SWEEP_RESULTS);
  let state = game.createCampaign({ seed, createdAt: SWEEP_NOW });
  tracker.start(state);
  const commands: SpendingCommands = {
    apply: (current, command) => tracker.apply(current, command),
    attempt: (current, command) => tracker.tryApply(current, command),
    first: state,
  };
  while (
    state.overworld.outcome === undefined &&
    state.overworld.day - tracker.startDay < tuning.dayCap
  ) {
    state = spend(state, commands);
    state = research(game, player, state, tracker);
    observe?.(state, tracker.missionsPlayed);
    if (playsOn(player, state.overworld.day, tracker.startDay)) {
      const offer = chooseOffer(state.overworld.missions, ctx);
      if (offer !== undefined) {
        state = tracker.apply(
          state,
          launchMission(offer.id, deploymentFor(offer, state.roster)),
          offer,
        );
      }
    }
    state = tracker.apply(state, advanceDay());
  }
  return { record: tracker.finish(state), first: commands.first, state };
}

// ===========================================
// Report
// ===========================================

/** The TSV header for `campaignRow`, given the tree's Intel-funded nodes. */
export function campaignHeader(intelNodes: readonly TechNode[]): string[] {
  return [
    "player",
    "seed",
    "outcome",
    "cause",
    "days",
    "missions",
    "won",
    "extracted",
    "lost",
    ...ACT_IDS.flatMap((act) => [
      `${act}_missions`,
      `${act}_days`,
      `${act}_threat`,
    ]),
    ...STORY_MISSION_IDS.flatMap((id) => [
      `${id}_pinned_days`,
      `${id}_won_missions`,
      `${id}_won_days`,
      `${id}_losses`,
    ]),
    ...intelNodes.flatMap((node) => [
      `${node.id}_missions`,
      `${node.id}_threat`,
    ]),
    "end_missions",
    "end_days",
    "end_threat",
    "peak_threat",
    "tp_earned",
    "tp_spent",
    ...TECH_NODE_KINDS.map((kind) => `tp_${kind}`),
    ...TECH_NODE_KINDS.map((kind) => `nodes_${kind}`),
    "parts_done_missions",
    "hives_formed",
    "platform_failures",
    "last_hope",
    "live_specimen_gate_lag",
    ...MISSION_TYPE_IDS.flatMap((id) => [
      `${id}_offered`,
      `${id}_played`,
      `${id}_won`,
      `${id}_tp`,
    ]),
    "mechs_lost",
    "mechs_built",
    "installations",
  ];
}

/** One campaign as a TSV row, in `campaignHeader`'s order; blank where nothing happened. */
export function campaignRow(
  record: CampaignRecord,
  intelNodes: readonly TechNode[],
): string[] {
  const spent = TECH_NODE_KINDS.reduce(
    (sum, kind) => sum + record.tpSpent[kind],
    0,
  );
  return [
    record.player,
    String(record.seed),
    record.end,
    record.cause ?? "",
    String(record.days),
    String(record.missions),
    String(record.won),
    String(record.extracted),
    String(record.lost),
    ...ACT_IDS.flatMap((act) => markCells(record.acts[act])),
    ...STORY_MISSION_IDS.flatMap((id) => {
      const story = record.stories[id];
      return [
        cell(story.pinnedDays),
        cell(story.won?.missions),
        cell(story.won?.days),
        String(story.losses),
      ];
    }),
    ...intelNodes.flatMap((node) => {
      const mark = record.research[node.id];
      return [
        cell(mark?.missions),
        mark === undefined ? "" : decimal(mark.threat),
      ];
    }),
    ...markCells(record.ended),
    decimal(record.peakThreat),
    String(record.tpEarned),
    String(spent),
    ...TECH_NODE_KINDS.map((kind) => String(record.tpSpent[kind])),
    ...TECH_NODE_KINDS.map((kind) => String(record.nodes[kind])),
    cell(record.partsDoneMissions),
    String(record.hivesFormed),
    String(record.stories["spore-platform"].losses),
    record.research[LAST_HOPE_NODE] === undefined ? "no" : "yes",
    cell(record.gateLags["live-specimen"]),
    ...MISSION_TYPE_IDS.flatMap((id) => {
      const track = record.types[id];
      return [track.offered, track.played, track.won, track.tp].map(String);
    }),
    String(record.mechsLost),
    String(record.mechsBuilt),
    String(record.installations),
  ];
}

/** Rows and a header as TSV text, newline-terminated. */
export function toTsv(
  header: readonly string[],
  rows: readonly string[][],
): string {
  return [header, ...rows].map((row) => row.join("\t")).join("\n") + "\n";
}

/** The tree's Intel-funded nodes (`intel`, `story`), in tree order: the report's research columns. */
export function intelNodesOf(nodes: readonly TechNode[]): readonly TechNode[] {
  return nodes.filter(isIntelFunded);
}

// ===========================================
// Summary
// ===========================================

/** One summary line: a metric's spread over one player's campaigns. */
export interface SummaryLine {
  readonly player: string;
  readonly metric: string;
  /** Campaigns the metric was defined for. */
  readonly n: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly mean: number;
}

/** The summary TSV's header. */
export const SUMMARY_HEADER: readonly string[] = [
  "player",
  "metric",
  "n",
  "q1",
  "median",
  "q3",
  "mean",
];

/**
 * The per-player summary the sweep reports (campaign arc §12): outcome
 * shares, each act's start and each story win in missions, days and
 * threat, research timings, tech-point income, spending by kind, and
 * each mission type's offers, plays, wins and tech points.
 * An outcome share is the mean of a 0/1 metric.
 */
export function summarise(
  player: string,
  records: readonly CampaignRecord[],
  intelNodes: readonly TechNode[],
): SummaryLine[] {
  const lines: SummaryLine[] = [];
  const add = (
    metric: string,
    pick: (record: CampaignRecord) => number | undefined,
  ): void => {
    const values = records
      .map(pick)
      .filter((value): value is number => value !== undefined);
    lines.push(spread(player, metric, values));
  };
  for (const end of ["victory", "defeat", "open"] as const) {
    add(`share.${end}`, (record) => (record.end === end ? 1 : 0));
  }
  add("missions", (record) => record.missions);
  add("days", (record) => record.days);
  for (const end of ["victory", "defeat"] as const) {
    add(`${end}.missions`, (record) =>
      record.end === end ? record.ended?.missions : undefined,
    );
    add(`${end}.days`, (record) =>
      record.end === end ? record.ended?.days : undefined,
    );
    add(`${end}.threat`, (record) =>
      record.end === end ? record.ended?.threat : undefined,
    );
  }
  for (const act of ACT_IDS.slice(1)) {
    add(`${act}.missions`, (record) => record.acts[act]?.missions);
    add(`${act}.days`, (record) => record.acts[act]?.days);
    add(`${act}.threat`, (record) => record.acts[act]?.threat);
  }
  for (const id of STORY_MISSION_IDS) {
    add(`${id}.pinned.days`, (record) => record.stories[id].pinnedDays);
    add(`${id}.played`, (record) =>
      storyPlays(record.stories[id]) > 0 ? 1 : 0,
    );
    add(`${id}.won.missions`, (record) => record.stories[id].won?.missions);
    add(`${id}.won.days`, (record) => record.stories[id].won?.days);
    add(`${id}.won.threat`, (record) => record.stories[id].won?.threat);
    add(`${id}.tp`, (record) => record.stories[id].tp);
  }
  for (const node of intelNodes) {
    add(`${node.id}.missions`, (record) => record.research[node.id]?.missions);
    add(`${node.id}.days`, (record) => record.research[node.id]?.days);
    add(`${node.id}.threat`, (record) => record.research[node.id]?.threat);
  }
  for (const n of SERIES_MILESTONES) {
    add(`m${n}.days`, (record) => record.series[n - 1]?.days);
    add(`m${n}.threat`, (record) => record.series[n - 1]?.threat);
    add(`m${n}.tp`, (record) => record.series[n - 1]?.tpEarned);
  }
  add("threat.peak", (record) => record.peakThreat);
  add("threat.end", (record) => record.endThreat);
  add("tp.earned", (record) => record.tpEarned);
  add("tp.per_mission", (record) =>
    record.missions === 0 ? undefined : record.tpEarned / record.missions,
  );
  for (const kind of TECH_NODE_KINDS) {
    add(`tp.spent.${kind}`, (record) => record.tpSpent[kind]);
    add(`nodes.${kind}`, (record) => record.nodes[kind]);
  }
  add("parts_done.missions", (record) => record.partsDoneMissions);
  add("hives_formed", (record) => record.hivesFormed);
  for (const id of MISSION_TYPE_IDS) {
    add(`type.${id}.offered`, (record) => record.types[id].offered);
    add(`type.${id}.played`, (record) => record.types[id].played);
    add(`type.${id}.won`, (record) => record.types[id].won);
    add(`type.${id}.tp`, (record) => record.types[id].tp);
  }
  add("mechs_lost", (record) => record.mechsLost);
  add("mechs_built", (record) => record.mechsBuilt);
  add("installations", (record) => record.installations);
  return lines;
}

/**
 * What the whole tree costs, by kind, as summary lines under the player
 * `tree`: `n` is the node count and every statistic the total cost.
 */
export function treeCost(nodes: readonly TechNode[]): SummaryLine[] {
  const lines = TECH_NODE_KINDS.map((kind) => {
    const ofKind = nodes.filter((node) => node.kind === kind);
    const total = ofKind.reduce((sum, node) => sum + node.cost, 0);
    return fixed("tree", `cost.${kind}`, ofKind.length, total);
  });
  const all = nodes.reduce((sum, node) => sum + node.cost, 0);
  return [...lines, fixed("tree", "cost.all", nodes.length, all)];
}

/** Summary lines as TSV rows, to two decimals. */
export function summaryRows(lines: readonly SummaryLine[]): string[][] {
  return lines.map((line) => [
    line.player,
    line.metric,
    String(line.n),
    decimal(line.q1),
    decimal(line.median),
    decimal(line.q3),
    decimal(line.mean),
  ]);
}

/**
 * The `p` quantile of sorted `values` by linear interpolation between
 * order statistics (Hyndman and Fan type 7, the R and NumPy default).
 * NaN when there are none.
 */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}

// ===========================================
// Constants
// ===========================================

/**
 * The mission counts the summary reads the series at: the arc's act
 * targets (§3: Act I ends about 12, Act II about 32, Act III about 47,
 * the finale about 50) and the #1171 parts-by-35 mark.
 */
export const SERIES_MILESTONES: readonly number[] = [
  12, 20, 32, 35, 40, 47, 50,
];

/** The node D7's first platform failure reveals (Last Hope). */
const LAST_HOPE_NODE: TechNodeId = "tech.last-hope";

// ===========================================
// Tracker
// ===========================================

/**
 * Follows one campaign command by command and records what the report
 * needs, from the events each command applied and the state after it.
 */
class CampaignTracker {
  // ===========================================
  // Fields
  // ===========================================

  startDay = 0;
  private startPool = 0;
  private missions = 0;
  private won = 0;
  private extracted = 0;
  private lost = 0;
  private hivesFormed = 0;
  private mechsLost = 0;
  private mechsBuilt = 0;
  private installations = 0;
  private peakThreat = 0;
  private partsDone: number | undefined;
  private ended: CampaignMark | undefined;
  private readonly acts: Partial<Record<ActId, CampaignMark>> = {};
  private readonly series: SeriesPoint[] = [];
  private readonly stories: Record<StoryMissionId, StoryTrack>;
  private readonly research: Record<TechNodeId, CampaignMark> = {};
  private readonly flagDays: Partial<Record<CampaignFlagId, number>> = {};
  private readonly spent: Record<TechNodeKind, number>;
  private readonly bought: Record<TechNodeKind, number>;
  private readonly types: Record<MissionTypeId, TypeTrack>;
  private readonly nodes: readonly TechNode[];

  // ===========================================
  // Construction
  // ===========================================

  /** A tracker for `player`'s campaign on `seed`, under the story `rules`. */
  constructor(
    private readonly game: GameComposition,
    private readonly player: ModelledPlayer,
    private readonly seed: number,
    private readonly rules: StoryMissionRules,
  ) {
    this.nodes = game.content.tech.listNodes();
    this.stories = Object.fromEntries(
      STORY_MISSION_IDS.map((id) => [id, { losses: 0, tp: 0 }]),
    ) as Record<StoryMissionId, StoryTrack>;
    this.spent = byKind(0);
    this.bought = byKind(0);
    this.types = Object.fromEntries(
      MISSION_TYPE_IDS.map((id) => [
        id,
        { offered: 0, played: 0, won: 0, tp: 0 },
      ]),
    ) as Record<MissionTypeId, TypeTrack>;
  }

  // ===========================================
  // Public
  // ===========================================

  /** Missions resolved so far. */
  get missionsPlayed(): number {
    return this.missions;
  }

  /** Notes the fresh campaign: its first day, act, pool and threat. */
  start(state: GameState): void {
    this.startDay = state.overworld.day;
    this.startPool = state.economy.techPoints;
    this.peakThreat = state.overworld.threat;
    this.acts[state.overworld.progress.act] = this.mark(state);
    for (const flag of state.overworld.progress.flags) {
      this.flagDays[flag] = 0;
    }
  }

  /**
   * Dispatches `command` and records what it applied. `offer` is the
   * mission a launch played, if the command is one.
   */
  apply(
    state: GameState,
    command: OverworldCommand,
    offer?: Mission,
  ): GameState {
    const applied = this.game.dispatcher.process(state, command);
    if (!applied.ok) {
      throw new Error(
        `${this.player.id} seed ${this.seed} day ${state.overworld.day}: ` +
          `${command.type} refused: ${JSON.stringify(applied.error)}`,
      );
    }
    const next = applied.value.state;
    for (const event of applied.value.events) {
      this.observe(event, next, offer);
    }
    this.peakThreat = Math.max(this.peakThreat, next.overworld.threat);
    return next;
  }

  /**
   * Dispatches `command` like `apply`, but a refusal (a purchase the
   * credits do not cover) is an answer rather than a harness bug: it
   * returns `undefined` and records nothing.
   */
  tryApply(state: GameState, command: OverworldCommand): GameState | undefined {
    const applied = this.game.dispatcher.process(state, command);
    if (!applied.ok) {
      return undefined;
    }
    const next = applied.value.state;
    for (const event of applied.value.events) {
      this.observe(event, next, undefined);
    }
    return next;
  }

  /** The finished record, from the campaign's last state. */
  finish(state: GameState): CampaignRecord {
    const outcome = state.overworld.outcome;
    const end: CampaignEnd =
      outcome === undefined
        ? "open"
        : outcome.kind === "defeat"
          ? "defeat"
          : "victory";
    return {
      player: this.player.id,
      seed: this.seed,
      end,
      ...(outcome?.cause === undefined ? {} : { cause: outcome.cause }),
      days: state.overworld.day - this.startDay,
      missions: this.missions,
      won: this.won,
      extracted: this.extracted,
      lost: this.lost,
      acts: { ...this.acts },
      stories: { ...this.stories },
      research: { ...this.research },
      flagDays: { ...this.flagDays },
      tpEarned: this.earned(state),
      tpSpent: { ...this.spent },
      nodes: { ...this.bought },
      ...(this.partsDone === undefined
        ? {}
        : { partsDoneMissions: this.partsDone }),
      ...(this.ended === undefined ? {} : { ended: this.ended }),
      peakThreat: this.peakThreat,
      endThreat: state.overworld.threat,
      hivesFormed: this.hivesFormed,
      types: { ...this.types },
      mechsLost: this.mechsLost,
      mechsBuilt: this.mechsBuilt,
      installations: this.installations,
      series: [...this.series],
      gateLags: this.gateLags(state),
    };
  }

  // ===========================================
  // Private
  // ===========================================

  /**
   * Records one applied event against the state it left. Typed as any
   * domain event: the dispatcher's events include the tech handler's
   * `tech:unlocked`, which the overworld event map does not list.
   */
  private observe(
    event: DomainEvent,
    state: GameState,
    offer: Mission | undefined,
  ): void {
    switch (event.type) {
      case MISSION_RESOLVED:
        this.resolved(
          (event.payload as MissionResolvedPayload).result,
          state,
          offer,
        );
        return;
      case ACT_ADVANCED:
        this.acts[(event.payload as ActAdvancedPayload).to] = this.mark(state);
        return;
      case CAMPAIGN_FLAG_SET: {
        const { flag } = event.payload as CampaignFlagSetPayload;
        this.flagDays[flag] ??= this.days(state);
        return;
      }
      case MISSION_OFFERED: {
        const { mission } = event.payload as MissionOfferedPayload;
        if (mission.storyId === undefined) {
          this.countType(mission.typeId, { offered: 1 });
        } else {
          const track = this.stories[mission.storyId];
          if (track.pinnedDays === undefined) {
            this.stories[mission.storyId] = {
              ...track,
              pinnedDays: this.days(state),
            };
          }
        }
        return;
      }
      case TECH_UNLOCKED:
        this.unlocked(event.payload as TechUnlockedPayload, state);
        return;
      case HIVE_FORMED:
        this.hivesFormed += 1;
        return;
      case MECH_DESTROYED:
        this.mechsLost += 1;
        return;
      case MECH_BUILT:
        this.mechsBuilt += 1;
        return;
      case DEPLOYABLE_BUILT:
        this.installations += 1;
        return;
      case GAME_ENDED:
        this.ended ??= this.mark(state);
        return;
    }
  }

  /**
   * Counts a resolved mission against its outcome and its type and, for
   * a story mission, its win or loss. A play is a story win when it was
   * won and the story recorded it (`storyWon`), so a win the story drops
   * reads as a loss here; every other play is a loss. Both are read per
   * play, not from `storyWon` alone: a Great Hive's three plays share one
   * story id, so a loss after the first win is still a loss.
   */
  private resolved(
    result: MissionResult,
    state: GameState,
    offer: Mission | undefined,
  ): void {
    const { outcome } = result;
    this.missions += 1;
    if (outcome === "won") this.won += 1;
    else if (outcome === "extracted") this.extracted += 1;
    else this.lost += 1;
    this.series.push({ ...this.mark(state), tpEarned: this.earned(state) });
    if (offer === undefined) {
      return;
    }
    const storyId = offer.storyId;
    if (storyId === undefined) {
      this.countType(offer.typeId, {
        played: 1,
        won: outcome === "won" ? 1 : 0,
        tp: result.techPointsAwarded,
      });
      return;
    }
    const track = this.stories[storyId];
    const paid = { ...track, tp: track.tp + result.techPointsAwarded };
    const storyWon =
      outcome === "won" &&
      (state.overworld.progress.storyWon ?? []).includes(storyId);
    this.stories[storyId] = !storyWon
      ? { ...paid, losses: track.losses + 1 }
      : track.won === undefined
        ? { ...paid, won: this.mark(state) }
        : paid;
  }

  /** Counts a researched node's cost by kind and times the Intel-funded ones. */
  private unlocked(payload: TechUnlockedPayload, state: GameState): void {
    const node = this.nodes.find(
      (candidate) => candidate.id === payload.nodeId,
    );
    if (node === undefined) {
      return;
    }
    this.spent[node.kind] += payload.cost;
    this.bought[node.kind] += 1;
    if (isIntelFunded(node)) {
      this.research[node.id] = this.mark(state);
    }
    if (
      this.partsDone === undefined &&
      this.nodes
        .filter((candidate) => candidate.kind === "part")
        .every((part) => state.tech.unlocked.includes(part.id))
    ) {
      this.partsDone = this.missions;
    }
  }

  /**
   * Days from each flag-gated story rule's gate opening to its first
   * pin (arc D2). The gate opens when every `pinWhen` flag is set and
   * the campaign is in the rule's act. A gate the campaign ended on
   * before a tick ran has no lag; one that never pinned while the
   * campaign ran on counts to the end.
   */
  private gateLags(state: GameState): Partial<Record<StoryMissionId, number>> {
    const lags: Partial<Record<StoryMissionId, number>> = {};
    const endDays = state.overworld.day - this.startDay;
    for (const id of STORY_MISSION_IDS) {
      const rule = this.rules[id];
      if (rule === undefined || rule.pinWhen.length === 0) {
        continue;
      }
      const opens = [
        this.acts[rule.act]?.days,
        ...rule.pinWhen.map((flag) => this.flagDays[flag]),
      ];
      if (opens.some((days) => days === undefined)) {
        continue;
      }
      const gate = Math.max(...(opens as number[]));
      const pinned = this.stories[id].pinnedDays;
      if (pinned !== undefined && pinned >= gate) {
        lags[id] = pinned - gate;
      } else if (endDays > gate) {
        lags[id] = endDays - gate;
      }
    }
    return lags;
  }

  /** Adds `counts` to mission type `typeId`'s track. */
  private countType(typeId: MissionTypeId, counts: Partial<TypeTrack>): void {
    const track = this.types[typeId];
    this.types[typeId] = {
      offered: track.offered + (counts.offered ?? 0),
      played: track.played + (counts.played ?? 0),
      won: track.won + (counts.won ?? 0),
      tp: track.tp + (counts.tp ?? 0),
    };
  }

  /** Tech points in by `state`, from every source: the pool, plus what was spent, less the start. */
  private earned(state: GameState): number {
    const spent = TECH_NODE_KINDS.reduce(
      (sum, kind) => sum + this.spent[kind],
      0,
    );
    return state.economy.techPoints + spent - this.startPool;
  }

  /** Where the campaign stands in `state`. */
  private mark(state: GameState): CampaignMark {
    return {
      missions: this.missions,
      days: this.days(state),
      threat: state.overworld.threat,
    };
  }

  /** Days elapsed in `state`. */
  private days(state: GameState): number {
    return state.overworld.day - this.startDay;
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * A purchase attempt: the state after `command`, or `undefined` when the
 * game refused it (the credits do not cover it).
 */
export type TryCommand = (
  state: GameState,
  command: OverworldCommand,
) => GameState | undefined;

/**
 * Spends credits the way a modelled player does (see `ModelledPlayer`):
 * its one installation, in the most infested region, while none stands;
 * then a replacement for each mech lost below `startMechs`, from the
 * first saved template. Each is bought only when `attempt` succeeds, so a
 * purchase the credits do not cover waits for a later day.
 *
 * ```
 *   installation set, none standing ──► BuildDeployable(installation, most infested region)
 *   while mechs < startMechs         ──► BuildMech(savedLoadouts[0]), until one is refused
 * ```
 */
export function spendCredits(
  player: ModelledPlayer,
  state: GameState,
  startMechs: number,
  attempt: TryCommand,
): GameState {
  let current = state;
  if (
    player.installation !== undefined &&
    current.overworld.deployables.length === 0
  ) {
    const region = mostInfestedRegion(current);
    current =
      attempt(current, buildDeployable(player.installation, region)) ?? current;
  }
  const template = current.roster.savedLoadouts[0];
  while (template !== undefined && current.roster.mechs.length < startMechs) {
    const built = attempt(
      current,
      buildMech(
        template.name,
        `${template.name} ${current.roster.mechs.length + 1}`,
      ),
    );
    if (built === undefined) {
      break;
    }
    current = built;
  }
  return current;
}

/**
 * The sweep's spender: `spendCredits` for `player`, rebuilding lost
 * mechs up to the mechs the campaign started with.
 *
 * @param player - The modelled player whose installation it builds.
 * @returns The spender every sweep player uses.
 */
export function sweepSpender(player: ModelledPlayer): CreditSpender {
  return (state, commands) =>
    spendCredits(
      player,
      state,
      commands.first.roster.mechs.length,
      commands.attempt,
    );
}

/** The region with the highest mean infestation, map order on a tie. */
export function mostInfestedRegion(state: GameState): string {
  const { map } = state.overworld;
  let best = map.regions[0];
  for (const region of map.regions) {
    if (
      best === undefined ||
      regionInfestation(map, region.id) > regionInfestation(map, best.id)
    ) {
      best = region;
    }
  }
  if (best === undefined) {
    throw new Error("the map has no region");
  }
  return best.id;
}

/**
 * Buys every node the player's research policy picks, one at a time,
 * until it waits.
 */
function research(
  game: GameComposition,
  player: ModelledPlayer,
  state: GameState,
  tracker: CampaignTracker,
): GameState {
  const nodes = game.content.tech.listNodes();
  let current = state;
  for (;;) {
    const node = nextResearch(
      {
        nodes,
        tech: current.tech,
        economy: current.economy,
        conditions: game.techConditionsOf(current),
      },
      player.intelShare,
    );
    if (node === undefined) {
      return current;
    }
    current = tracker.apply(current, unlockTech(node.id));
  }
}

/** A record of zeros (or `value`) for every node kind. */
function byKind(value: number): Record<TechNodeKind, number> {
  return Object.fromEntries(
    TECH_NODE_KINDS.map((kind) => [kind, value]),
  ) as Record<TechNodeKind, number>;
}

/** A mark's three cells, blank when absent; threat to two decimals. */
function markCells(mark: CampaignMark | undefined): string[] {
  return [
    cell(mark?.missions),
    cell(mark?.days),
    mark === undefined ? "" : decimal(mark.threat),
  ];
}

/** A number's cell, blank when absent. */
function cell(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/** Two decimals, or blank for NaN. */
function decimal(value: number): string {
  return Number.isNaN(value) ? "" : value.toFixed(2);
}

/** The spread of `values` as one summary line. */
function spread(
  player: string,
  metric: string,
  values: readonly number[],
): SummaryLine {
  const sorted = [...values].sort((a, b) => a - b);
  const mean =
    sorted.length === 0
      ? Number.NaN
      : sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    player,
    metric,
    n: sorted.length,
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    mean,
  };
}

/** A summary line whose every statistic is `value`. */
function fixed(
  player: string,
  metric: string,
  n: number,
  value: number,
): SummaryLine {
  return {
    player,
    metric,
    n,
    q1: value,
    median: value,
    q3: value,
    mean: value,
  };
}
