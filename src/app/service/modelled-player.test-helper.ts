import type { Rng } from "../../core/model/rng";
import type { EconomyState } from "../../economy/model/economy-state";
import type { Deployment } from "../../overworld/model/deployment";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import type { Mission } from "../../overworld/model/mission";
import type {
  MissionOutcome,
  MissionResult,
} from "../../overworld/model/mission-result";
import type { MissionResolutionState } from "../../overworld/model/mission-resolution-state";
import type { MissionResolver } from "../../overworld/model/mission-resolver";
import type { RosterState } from "../../roster/model/roster-state";
import type { TechConditions } from "../../tech/model/tech-conditions";
import type { TechNode, TechNodeKind } from "../../tech/model/tech-node";
import type { TechState } from "../../tech/model/tech-state";
import { techNodeStatus } from "../../tech/service/tech-status-service";
import type { ModelledResultContext } from "./modelled-mission-results.test-helper";
import { modelledResult } from "./modelled-mission-results.test-helper";

// ===========================================
// Types
// ===========================================

/** The four modelled players of campaign arc §12. */
export type ModelledPlayerId = "average" | "strong" | "story-only" | "idle";

/** Every modelled player, in the order the sweep reports them. */
export const MODELLED_PLAYER_IDS: readonly ModelledPlayerId[] = [
  "average",
  "strong",
  "story-only",
  "idle",
];

/**
 * How a modelled player's missions end. `lost` is whatever `won` and
 * `extracted` leave, so the three always sum to one.
 */
export interface OutcomeShares {
  readonly won: number;
  readonly extracted: number;
}

/**
 * When a modelled player plays: on the first `playDays` days of every
 * `cycleDays`, counted from the campaign's first day, one mission a day.
 */
export interface PlayCadence {
  readonly playDays: number;
  readonly cycleDays: number;
}

/** One modelled player (campaign arc §12). */
export interface ModelledPlayer {
  readonly id: ModelledPlayerId;
  /** How its missions end, one draw per mission. */
  readonly outcomes: OutcomeShares;
  /** Which days it plays a mission on; `playDays: 0` plays nothing. */
  readonly cadence: PlayCadence;
  /**
   * The share of every tech point earned it sets aside for Intel (the
   * `intel` and `story` nodes); the rest goes to parts, autopsies and
   * infantry. 1 researches Intel only.
   */
  readonly intelShare: number;
  /** Whether its squads strip every tech carcass on the map (#1171). */
  readonly harvests: boolean;
}

/** Everything the campaign sweep is tuned by, in one object. */
export interface CampaignSweepTuning {
  readonly players: Readonly<Record<ModelledPlayerId, ModelledPlayer>>;
  /**
   * The last day a campaign is played to. A campaign still open then is
   * reported `open`: it stalled or ran long, and the pins say which.
   */
  readonly dayCap: number;
  /** Campaigns per player in the committed sweep. */
  readonly seeds: number;
  /** The first campaign seed; campaign `i` is seeded `firstSeed + i`. */
  readonly firstSeed: number;
}

// ===========================================
// Tuning
// ===========================================

/**
 * The real game's rhythm (campaign arc §3): each mission costs at least
 * a day, because the debrief's Continue dispatches `AdvanceDay`, and a
 * campaign averages about 0.75 missions a day. Three play days in every
 * four gives exactly 0.75 and never two missions on one day. Every
 * active player keeps the same rhythm, so the players differ only in
 * how they fight and what they research.
 */
const PLAY_CADENCE: PlayCadence = { playDays: 3, cycleDays: 4 };

/**
 * The campaign sweep's tuning (campaign arc §12).
 *
 * ```
 *   player      won / extracted / lost   Intel share   plays
 *   average     70 / 10 / 20             0.5           3 days in 4
 *   strong      95 /  2 /  3             0.8           3 days in 4
 *   story-only  70 / 10 / 20             1.0           3 days in 4
 *   idle        –                        –             never
 * ```
 *
 * The Strong player's 5% that is not a win splits 2 extracted, 3 lost.
 * The day cap is well past the arc's 65–70 day campaign and past the
 * Idle player's defeat, so only a stalled campaign reaches it.
 */
export const CAMPAIGN_SWEEP_TUNING: CampaignSweepTuning = {
  players: {
    average: {
      id: "average",
      outcomes: { won: 0.7, extracted: 0.1 },
      cadence: PLAY_CADENCE,
      intelShare: 0.5,
      harvests: true,
    },
    strong: {
      id: "strong",
      outcomes: { won: 0.95, extracted: 0.02 },
      cadence: PLAY_CADENCE,
      intelShare: 0.8,
      harvests: true,
    },
    "story-only": {
      id: "story-only",
      outcomes: { won: 0.7, extracted: 0.1 },
      cadence: PLAY_CADENCE,
      intelShare: 1,
      harvests: true,
    },
    idle: {
      id: "idle",
      outcomes: { won: 0, extracted: 0 },
      cadence: { playDays: 0, cycleDays: 1 },
      intelShare: 0,
      harvests: false,
    },
  },
  dayCap: 400,
  seeds: 60,
  firstSeed: 1,
};

// ===========================================
// The resolver
// ===========================================

/**
 * The mission resolver a modelled player fights with: one draw from the
 * launch handler's `mission:<id>` stream picks the outcome by the
 * player's shares, and the per-type builder table fills in the result.
 * Injected through `composeGame({ resolver })`, so the result reaches
 * the campaign through the real launch handler.
 *
 * ```
 *   u = rng.next()
 *   u < won            ──► won
 *   u < won+extracted  ──► extracted
 *   otherwise          ──► lost
 *        └──► modelledResult(mission, outcome, ctx)
 * ```
 *
 * One draw per mission, so two players on the same seed who launch the
 * same mission id draw the same `u` (common random numbers).
 */
export class ModelledMissionResolver implements MissionResolver {
  // ===========================================
  // Construction
  // ===========================================

  /** A resolver for `player`, paying on `results`' scale. */
  constructor(
    private readonly player: ModelledPlayer,
    private readonly results: ModelledResultContext,
  ) {}

  // ===========================================
  // MissionResolver
  // ===========================================

  /** The modelled result of `mission`: an outcome by the player's shares, built by its type's row. */
  resolve(
    mission: Mission,
    _deployment: Deployment,
    _state: MissionResolutionState,
    rng: Rng,
  ): MissionResult {
    return modelledResult(
      mission,
      rollOutcome(this.player.outcomes, rng.next()),
      this.results,
    );
  }
}

/**
 * The outcome a draw `u` in `[0, 1)` lands on under `shares`.
 *
 * ```
 *   0 ─── won ───┬─ extracted ─┬──── lost ──── 1
 * ```
 */
export function rollOutcome(shares: OutcomeShares, u: number): MissionOutcome {
  if (u < shares.won) {
    return "won";
  }
  return u < shares.won + shares.extracted ? "extracted" : "lost";
}

/** The results context a player's resolver pays on: the shared scale and its harvest habit. */
export function resultContextFor(
  player: ModelledPlayer,
  base: Omit<ModelledResultContext, "harvested">,
): ModelledResultContext {
  return { ...base, harvested: player.harvests };
}

// ===========================================
// Playing
// ===========================================

/** Whether `player` plays a mission on `day` of a campaign that began on `startDay`. */
export function playsOn(
  player: ModelledPlayer,
  day: number,
  startDay: number,
): boolean {
  const { playDays, cycleDays } = player.cadence;
  return playDays > 0 && (day - startDay) % cycleDays < playDays;
}

/**
 * The offer a modelled player takes from `missions`, or `undefined` on
 * an empty board.
 *
 * ```
 *   a pinned story offer   ──► always first (the spine is the point of the campaign)
 *   otherwise              ──► the best-paying: most tech points a win brings home
 *                              (carcasses included), then most credits (an evacuation's
 *                              per-group pay included), then board order
 * ```
 *
 * Several story offers at once rank among themselves the same way.
 */
export function chooseOffer(
  missions: readonly Mission[],
  ctx: ModelledResultContext,
): Mission | undefined {
  const story = missions.filter((mission) => mission.storyId !== undefined);
  return bestPaying(story.length > 0 ? story : missions, ctx);
}

/**
 * The deployment a modelled player sends: every squad, then every mech,
 * up to the deployment cap. The modelled result ignores who went; the
 * launch handler only checks the deployment is legal.
 */
export function deploymentFor(
  mission: Mission,
  roster: Pick<RosterState, "squads" | "mechs">,
): Deployment {
  const squadIds = roster.squads
    .slice(0, MAX_DEPLOYED_UNITS)
    .map((squad) => squad.id);
  const mechIds = roster.mechs
    .slice(0, MAX_DEPLOYED_UNITS - squadIds.length)
    .map((mech) => mech.id);
  return { missionId: mission.id, squadIds, mechIds };
}

// ===========================================
// Research
// ===========================================

/** What the research policy reads: the tree, what is bought, the pool, and the flags. */
export interface ResearchView {
  readonly nodes: readonly TechNode[];
  readonly tech: TechState;
  readonly economy: Pick<EconomyState, "techPoints">;
  readonly conditions: TechConditions;
}

/** The kinds a player's Intel share pays for; everything else is the other fund. */
export const INTEL_FUND_KINDS: readonly TechNodeKind[] = ["intel", "story"];

/**
 * The next node a modelled player buys, or `undefined` when it waits.
 * An envelope model: of every tech point earned so far, `intelShare`
 * is the Intel fund and the rest the other fund, and each fund pays
 * only for its own kinds.
 *
 * ```
 *   earned     = pool + cost of every node bought
 *   intel fund = earned × share − spent on Intel
 *                (+ the other fund, when no other node is open)
 *   other fund = earned × (1 − share) − spent on other nodes
 *
 *   for intel, then other:
 *     node = the cheapest open node of the fund's kinds (tree order on a tie)
 *     buy it when both the fund and the pool cover its cost
 * ```
 *
 * Open means revealed and its prerequisites bought (`available` or
 * `unaffordable`); a hidden node appears only when the real reveal rules
 * say so. Meeting an unaffordable node means waiting for it: the fund
 * never skips to a cheaper node of the other fund. An Intel fund with
 * nothing open banks, so the next Intel project is bought soon after it
 * appears; an other fund with nothing left to buy flows to Intel.
 */
export function nextResearch(
  view: ResearchView,
  intelShare: number,
): TechNode | undefined {
  const spentIntel = spentOn(view, true);
  const spentOther = spentOn(view, false);
  const earned = view.economy.techPoints + spentIntel + spentOther;
  const otherFund = earned * (1 - intelShare) - spentOther;
  const other = cheapestOpen(view, false);
  const intelFund =
    earned * intelShare - spentIntel + (other === undefined ? otherFund : 0);
  const intel = cheapestOpen(view, true);
  if (intel !== undefined && affords(view, intel, intelFund)) {
    return intel;
  }
  if (other !== undefined && affords(view, other, otherFund)) {
    return other;
  }
  return undefined;
}

/** Whether `node` is paid for by the Intel fund. */
export function isIntelFunded(node: TechNode): boolean {
  return INTEL_FUND_KINDS.includes(node.kind);
}

// ===========================================
// Helpers
// ===========================================

/** The best-paying of `missions` for a modelled win, board order on a tie. */
function bestPaying(
  missions: readonly Mission[],
  ctx: ModelledResultContext,
): Mission | undefined {
  let best: Mission | undefined;
  let bestPay: readonly [number, number] = [-1, -1];
  for (const mission of missions) {
    const pay = payOf(mission, ctx);
    if (pay[0] > bestPay[0] || (pay[0] === bestPay[0] && pay[1] > bestPay[1])) {
      best = mission;
      bestPay = pay;
    }
  }
  return best;
}

/** What a modelled win of `mission` pays: tech points, then credits. */
function payOf(
  mission: Mission,
  ctx: ModelledResultContext,
): readonly [number, number] {
  const won = modelledResult(mission, "won", ctx);
  const perGroup =
    mission.evacuation === undefined
      ? 0
      : mission.evacuation.groups * mission.evacuation.creditsPerGroup;
  return [won.techPointsAwarded, won.creditsAwarded + perGroup];
}

/** Tech points spent so far on the Intel fund's kinds (`intel`) or the other fund's. */
function spentOn(view: ResearchView, intel: boolean): number {
  let spent = 0;
  for (const node of view.nodes) {
    if (isIntelFunded(node) === intel && view.tech.unlocked.includes(node.id)) {
      spent += node.cost;
    }
  }
  return spent;
}

/** The cheapest open node of a fund's kinds, tree order on a tie. */
function cheapestOpen(
  view: ResearchView,
  intel: boolean,
): TechNode | undefined {
  let found: TechNode | undefined;
  for (const node of view.nodes) {
    if (isIntelFunded(node) !== intel || !isOpen(view, node)) {
      continue;
    }
    if (found === undefined || node.cost < found.cost) {
      found = node;
    }
  }
  return found;
}

/** Whether `node` is revealed, not bought, and has its prerequisites. */
function isOpen(view: ResearchView, node: TechNode): boolean {
  const status = techNodeStatus(node, view.tech, view.economy, view.conditions);
  return status === "available" || status === "unaffordable";
}

/** Whether both `fund` and the pool cover `node`. */
function affords(view: ResearchView, node: TechNode, fund: number): boolean {
  return fund >= node.cost && view.economy.techPoints >= node.cost;
}
