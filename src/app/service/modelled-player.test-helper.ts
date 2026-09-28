import type { DeployableTypeId } from "../../content/model/deployable-type-id";
import type { Rng } from "../../core/model/rng";
import type { EconomyState } from "../../economy/model/economy-state";
import { AUTO_RESOLVE_TUNING } from "../../overworld/data/auto-resolve-tuning";
import type { AutoResolveTuning } from "../../overworld/model/auto-resolve-tuning";
import type { Deployment } from "../../overworld/model/deployment";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import type { Mission } from "../../overworld/model/mission";
import type {
  MechDamageReport,
  MissionOutcome,
  MissionResult,
  SquadCasualties,
} from "../../overworld/model/mission-result";
import type { MissionResolutionState } from "../../overworld/model/mission-resolution-state";
import type { MissionResolver } from "../../overworld/model/mission-resolver";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
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
 * The opt-in players (#1179, C7): the Average player's fighting and
 * research with a player's spending, outside the committed sweep, so no
 * sweep pin reads them.
 *
 *   spender         spends like a player; loses only what the Average loses
 *   realistic       spends like a player; loses units on the auto-resolver's scale
 *   matrix-new      spends like a player; loses what the calibration matrix's
 *   matrix-expert   new or expert tactical player lost (matrix-losses.test-helper.ts)
 */
export type OptInPlayerId = FixedOptInPlayerId | MatrixPlayerId;

/** The opt-in players whose losses are fixed in code. */
export type FixedOptInPlayerId = "spender" | "realistic";

/** The opt-in players whose losses are read off a calibration matrix's runs when they play. */
export type MatrixPlayerId = "matrix-new" | "matrix-expert";

/**
 * The losses a modelled player's missions cost its roster, on the
 * auto-resolver's per-outcome scale (GDD §5.8): each living soldier of
 * each deployed squad falls with `casualtyChance`, and each deployed
 * mech is destroyed with `mechDestructionChance` or else takes
 * `mechDamage`.
 */
export type CasualtyScale = Pick<
  AutoResolveTuning,
  "casualtyChance" | "mechDestructionChance" | "mechDamage"
>;

/** What `rollCasualties` reports: the roster fields of a `MissionResult`. */
export type RolledCasualties = Pick<
  MissionResult,
  "squadCasualties" | "squadsWiped" | "mechDamage" | "mechsDestroyed"
>;

/**
 * Where a modelled player's roster losses come from (#1179, C7): one
 * mission's, drawn after its outcome from the mission's own stream, and
 * reported as the roster fields of its result, so the launch handler
 * applies them through the roster casualty path a played result takes.
 */
export interface LossModel {
  /**
   * The losses of `mission`, which ended `outcome`.
   *
   * @param outcome - How the mission ended (the modelled draw).
   * @param mission - The mission, for its type, story and act.
   * @param deployment - Who went.
   * @param state - The roster at launch.
   * @param rng - The mission's stream, after the outcome's draw.
   * @returns The roster fields of the result.
   */
  roll(
    outcome: MissionOutcome,
    mission: Mission,
    deployment: Deployment,
    state: Pick<MissionResolutionState, "squads" | "mechs">,
    rng: Rng,
  ): RolledCasualties;
}

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

/** One modelled player (campaign arc §12), or an opt-in one (#1179). */
export interface ModelledPlayer {
  readonly id: ModelledPlayerId | OptInPlayerId;
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
  /**
   * The share of its lost missions that destroy the first mech it
   * deployed, so Wreck Recovery (arc §6.6) is offered. A lost mech is
   * rebuilt from the first saved template once the credits cover it.
   * Ignored when `losses` is set.
   */
  readonly mechLoss: number;
  /**
   * The losses its missions cost the roster, every deployed unit's;
   * when absent, no soldier falls, no mech is damaged, and `mechLoss`
   * alone destroys a mech. Only the opt-in players that lose units set
   * it (`scaledLosses`, `matrixLosses`).
   */
  readonly losses?: LossModel;
  /**
   * The installation it builds once, in the most infested region, on
   * the campaign's first day, so the Defend Installation trigger (arc
   * §5) has something to defend; none when absent.
   */
  readonly installation?: DeployableTypeId;
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
 * The share of lost missions that destroy a mech: the auto-resolver's
 * chance for each deployed mech on a lost mission, the game's own scale
 * for it. The sweep deploys one mech, so this is the chance a loss
 * leaves a wreck.
 */
const MECH_LOSS_ON_A_LOSS = AUTO_RESOLVE_TUNING.mechDestructionChance.lost;

/**
 * The auto-resolver's losses, the game's own scale for a mission it
 * plays out of sight (GDD §5.8):
 *
 * ```
 *                          won     extracted   lost
 *   a soldier falls        8%      25%         50%
 *   a mech is destroyed    2%      10%         30%
 *   else a mech takes      5–20    15–40       30–70 damage
 * ```
 */
export const AUTO_RESOLVE_CASUALTIES: CasualtyScale = {
  casualtyChance: AUTO_RESOLVE_TUNING.casualtyChance,
  mechDestructionChance: AUTO_RESOLVE_TUNING.mechDestructionChance,
  mechDamage: AUTO_RESOLVE_TUNING.mechDamage,
};

/**
 * The installation every playing player builds on its first day. A
 * defensive battery's effect, garrison turrets, is tactical and outside
 * the model, so it changes the overworld only through the Defend
 * Installation offers it draws; the installations that do move the
 * overworld (a repellent's growth cut, a sensor array's detection and
 * board slots) are left out, which makes the modelled Earth a little
 * harder than a player who builds them sees.
 */
const MODELLED_INSTALLATION: DeployableTypeId = "defensive-battery";

/**
 * The campaign sweep's tuning (campaign arc §12).
 *
 * ```
 *   player      won / extracted / lost   Intel share   plays         mech lost on a loss   builds
 *   average     70 / 10 / 20             0.5           3 days in 4   30%                   a battery
 *   strong      95 /  2 /  3             0.8           3 days in 4   30%                   a battery
 *   story-only  70 / 10 / 20             1.0           3 days in 4   30%                   a battery
 *   idle        –                        –             never         –                     nothing
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
      mechLoss: MECH_LOSS_ON_A_LOSS,
      installation: MODELLED_INSTALLATION,
    },
    strong: {
      id: "strong",
      outcomes: { won: 0.95, extracted: 0.02 },
      cadence: PLAY_CADENCE,
      intelShare: 0.8,
      harvests: true,
      mechLoss: MECH_LOSS_ON_A_LOSS,
      installation: MODELLED_INSTALLATION,
    },
    "story-only": {
      id: "story-only",
      outcomes: { won: 0.7, extracted: 0.1 },
      cadence: PLAY_CADENCE,
      intelShare: 1,
      harvests: true,
      mechLoss: MECH_LOSS_ON_A_LOSS,
      installation: MODELLED_INSTALLATION,
    },
    idle: {
      id: "idle",
      outcomes: { won: 0, extracted: 0 },
      cadence: { playDays: 0, cycleDays: 1 },
      intelShare: 0,
      harvests: false,
      mechLoss: 0,
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
 *   losses set:            losses.roll(outcome) ──► every deployed unit's losses
 *   otherwise, lost, a mech deployed:
 *                          v = rng.next() < mechLoss ──► the first mech destroyed
 * ```
 *
 * The outcome is the stream's first draw, so two players on the same
 * seed who launch the same mission id draw the same `u` (common random
 * numbers); the losses' draws come after it.
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
    deployment: Deployment,
    state: MissionResolutionState,
    rng: Rng,
  ): MissionResult {
    const outcome = rollOutcome(this.player.outcomes, rng.next());
    const result = modelledResult(mission, outcome, this.results);
    const losses = this.player.losses;
    if (losses !== undefined) {
      return {
        ...result,
        ...losses.roll(outcome, mission, deployment, state, rng),
      };
    }
    const mechId = deployment.mechIds[0];
    if (
      outcome !== "lost" ||
      mechId === undefined ||
      rng.next() >= this.player.mechLoss
    ) {
      return result;
    }
    return { ...result, mechsDestroyed: [mechId] };
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

/**
 * Every deployed unit's losses on `scale`, drawn in the auto-resolver's
 * order (GDD §5.8):
 *
 * ```
 *   per squad, per living soldier:  chance(casualtyChance[outcome])  ──► a loss
 *                                   every soldier lost               ──► wiped
 *   per mech:  chance(mechDestructionChance[outcome])  ──► destroyed (the rest of its hull)
 *              else nextInt(mechDamage[outcome])        ──► damage, destroyed at the hull's end
 * ```
 *
 * A unit that lost nothing is left out, and every wiped squad and
 * destroyed mech also has its report, as `MissionResult` asks.
 *
 * @param outcome - How the mission ended.
 * @param deployment - Who went.
 * @param state - The roster at launch.
 * @param scale - The chances and damage per outcome.
 * @param rng - The mission's stream, after the outcome's draw.
 * @returns The roster fields of the result.
 */
export function rollCasualties(
  outcome: MissionOutcome,
  deployment: Deployment,
  state: Pick<MissionResolutionState, "squads" | "mechs">,
  scale: CasualtyScale,
  rng: Rng,
): RolledCasualties {
  const squadCasualties: SquadCasualties[] = [];
  const squadsWiped: string[] = [];
  for (const squad of deployedUnits(deployment.squadIds, state.squads)) {
    let losses = 0;
    for (let soldier = 0; soldier < squad.strength; soldier++) {
      if (rng.chance(scale.casualtyChance[outcome])) losses++;
    }
    if (losses === 0) continue;
    squadCasualties.push({ squadId: squad.id, losses });
    if (losses >= squad.strength) squadsWiped.push(squad.id);
  }
  const mechDamage: MechDamageReport[] = [];
  const mechsDestroyed: string[] = [];
  for (const mech of deployedUnits(deployment.mechIds, state.mechs)) {
    const remaining = MECH_MAX_DAMAGE - mech.damage;
    const range = scale.mechDamage[outcome];
    const damage = Math.min(
      remaining,
      rng.chance(scale.mechDestructionChance[outcome])
        ? remaining
        : rng.nextInt(range.min, range.max),
    );
    if (damage === 0) continue;
    mechDamage.push({ mechId: mech.id, damage });
    if (damage >= remaining) mechsDestroyed.push(mech.id);
  }
  return { squadCasualties, squadsWiped, mechDamage, mechsDestroyed };
}

/**
 * The loss model that rolls every deployed unit's losses on `scale`
 * (`rollCasualties`), whatever the mission.
 *
 * @param scale - The chances and damage per outcome.
 * @returns The loss model.
 */
export function scaledLosses(scale: CasualtyScale): LossModel {
  return {
    roll: (outcome, _mission, deployment, state, rng) =>
      rollCasualties(outcome, deployment, state, scale, rng),
  };
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
 * The kinds the other fund buys first when one is open, before the
 * cheapest node: an autopsy is the counter to a species the squads have
 * just met (campaign arc §10.2), so a player researches it when it
 * appears rather than after every cheaper part.
 */
export const OTHER_FUND_FIRST_KINDS: readonly TechNodeKind[] = ["autopsy"];

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
 *     node = the cheapest open node of the fund's kinds (tree order on a tie);
 *            for the other fund, the cheapest open autopsy first, if any
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
  const other =
    cheapestOpen(view, false, OTHER_FUND_FIRST_KINDS) ??
    cheapestOpen(view, false);
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

/**
 * The units `ids` names, in deployment order; an id not on the roster
 * is a harness bug.
 *
 * @param ids - The deployment's squad or mech ids.
 * @param roster - The roster's squads or mechs at launch.
 * @returns The deployed units.
 * @throws {Error} if an id is not on the roster.
 */
export function deployedUnits<T extends { readonly id: string }>(
  ids: readonly string[],
  roster: readonly T[],
): T[] {
  return ids.map((id) => {
    const unit = roster.find((each) => each.id === id);
    if (unit === undefined) throw new Error(`the deployment names ${id}`);
    return unit;
  });
}

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

/**
 * The cheapest open node of a fund's kinds, tree order on a tie; only
 * among `kinds` when they are given.
 */
function cheapestOpen(
  view: ResearchView,
  intel: boolean,
  kinds?: readonly TechNodeKind[],
): TechNode | undefined {
  let found: TechNode | undefined;
  for (const node of view.nodes) {
    if (
      isIntelFunded(node) !== intel ||
      (kinds !== undefined && !kinds.includes(node.kind)) ||
      !isOpen(view, node)
    ) {
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
