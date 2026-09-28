import type { DeployableTypeId } from "../../content/model/deployable-type-id";
import { DEPLOYABLE_TYPE_IDS } from "../../content/model/deployable-type-id";
import { DEPLOYABLE_TYPES } from "../../overworld/data/deployable-types";
import { INFESTATION_TUNING } from "../../overworld/data/infestation-tuning";
import { buildDeployable } from "../../overworld/model/build-deployable-command";
import { buildMech } from "../../overworld/model/build-mech-command";
import type { Deployable } from "../../overworld/model/deployable";
import { MIN_DEPLOYABLE_LEVEL } from "../../overworld/model/deployable-level";
import type { DeployableType } from "../../overworld/model/deployable-type";
import { levelSpec } from "../../overworld/model/deployable-type";
import type { DeployableTypeCatalogue } from "../../overworld/model/deployable-type-catalogue";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import { hireSquad } from "../../overworld/model/hire-squad-command";
import { reinforceSquad } from "../../overworld/model/reinforce-squad-command";
import { repairMech } from "../../overworld/model/repair-mech-command";
import { saveLoadout } from "../../overworld/model/save-loadout-command";
import { DataDeployableTypeCatalogue } from "../../overworld/repository/deployable-type-catalogue";
import { regionInfestation } from "../../overworld/service/threat-service";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { RosterTuning } from "../../roster/model/roster-tuning";
import type { SquadTypeId } from "../../roster/model/squad-type";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import {
  mechBuildQuote,
  stockOf,
} from "../../roster/service/part-stock-service";
import { repairCost } from "../../roster/service/repair-service";
import type { GameState } from "../../save/model/game-state";
import type { TechCatalogue } from "../../tech/model/tech-catalogue";
import { createPartAvailability } from "../../tech/service/part-availability-service";
import { createSquadTypeAvailability } from "../../tech/service/squad-type-availability-service";
import { FILL_SUPPORT_TYPE } from "./calibration-fill.test-helper";
import type { RatingContent } from "./calibration-force-probe.test-helper";
import { refitLoadout } from "./calibration-force-probe.test-helper";
import type {
  CreditSpender,
  SpendingCommands,
} from "./campaign-sweep.test-helper";
import type { GameContent } from "./game-composition";
import type {
  ModelledPlayer,
  OptInPlayerId,
} from "./modelled-player.test-helper";
import {
  AUTO_RESOLVE_CASUALTIES,
  CAMPAIGN_SWEEP_TUNING,
} from "./modelled-player.test-helper";

// ===========================================
// A player's spending (#1179, C7; GDD §5.5–5.7)
// ===========================================
//
// The campaign sweep's players spend on two things: one installation and
// a rebuilt mech. A player spends on more: the units a mission cost, a
// full drop ship, and installations over the infested regions. This
// spender does, every day before research, through the game's own
// commands, in this order:
//
//   1. repair     every damaged mech, roster order            RepairMech
//   2. reinforce  every squad below strength, to full         ReinforceSquad
//   3. re-hire    every squad of the target the roster lacks  HireSquad (same type, its hire price)
//   4. mechs      up to the target, from the bay's refit      SaveLoadout, BuildMech
//   5. install    the most infested infested region without   BuildDeployable
//                 each defence, while a month of upkeep stays
//
//   target squads = the starting squads' types + one support squad (C2c's medic)
//   target mechs  = MAX_DEPLOYED_UNITS − target squads   (8 − 5 = 3)
//
// Units come before installations, and a want the bank cannot cover ends
// the day's spending: the spender saves for it rather than buying
// something cheaper further down. Every purchase is priced first, so the
// game never refuses one; a refusal is a harness bug and throws.
//
// C2c's fill rule (`fillDeployment`) spends one band's bank at once, and
// buys a mech only while the bank also covers the cheapest hire for every
// later slot. Run on a new campaign's 5,000 it buys one mech, a medic and
// a rocket squad, and on the 3,500 the Average holds after its battery a
// medic and two rocket squads and no mech; either way the slots it fills
// with squads stay squads. So this spender does not reuse the rule: it
// keeps C2c's composition (the starting four and a medic, the starting
// mech and two more) as its target and saves for it.

/** The rules the spender buys by. */
export interface SpendingRules {
  /** The squad type the fill adds to the starting squads. */
  readonly supportType: SquadTypeId;
  /**
   * Days of every installation's upkeep a unit purchase leaves in the
   * bank, so a unit bought today never takes an installation offline
   * tonight.
   */
  readonly unitReserveDays: number;
  /** The installations it defends the map with, in the order it builds them in a region. */
  readonly installations: readonly DeployableTypeId[];
  /** A region's mean infestation at which it counts as infested. */
  readonly infestedAt: number;
  /**
   * Days of every installation's upkeep, the new one's included, that
   * the bank must still cover after an installation is built.
   */
  readonly installationReserveDays: number;
  /** The name the bay's refit is saved under and every mech is built from. */
  readonly templateName: string;
}

/** What the spender prices purchases from: the shipped catalogues and tuning. */
export interface SpendingMarket extends RatingContent {
  readonly squadTypes: SquadTypeCatalogue;
  readonly tech: TechCatalogue;
  readonly rosterTuning: RosterTuning;
  readonly deployables: DeployableTypeCatalogue;
}

/** An opt-in player: how it fights and researches, and how it spends. */
export interface OptInPlayer {
  readonly player: ModelledPlayer;
  readonly spending: SpendingRules;
}

/** One step's outcome: the state after it, and whether it stopped to save for a want. */
interface StepResult {
  readonly state: GameState;
  readonly saving: boolean;
}

/** One step of the day's spending. */
type SpendingStep = (state: GameState, ctx: SpendingContext) => StepResult;

/** What every step reads. */
interface SpendingContext {
  readonly apply: SpendingCommands["apply"];
  readonly first: GameState;
  readonly rules: SpendingRules;
  readonly market: SpendingMarket;
}

// ===========================================
// Tuning
// ===========================================

/** The shipped deployable catalogue, which the composition does not expose. */
export const SHIPPED_DEPLOYABLES: DeployableTypeCatalogue =
  new DataDeployableTypeCatalogue(
    DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
  );

/**
 * A player's spending, by the rules in the header:
 *
 * - **Support: a medic**, C2c's fill (the roster's four squads have
 *   nothing that heals them).
 * - **A day of upkeep in reserve for units**: a unit never takes an
 *   installation offline.
 * - **Repellent, then a battery**, in each infested region: the two
 *   installations that defend a region (the repellent slows its
 *   infestation, the battery garrisons its missions). A sensor array
 *   (detection) and a bank (income) defend nothing, so it builds
 *   neither.
 * - **Infested at 15**, the region detection threshold: a region the
 *   player can see is infested.
 * - **A month of upkeep in reserve for installations**: it builds
 *   another only while the bank would still pay 30 days of every
 *   installation's upkeep, the new one's included.
 */
export const REALISTIC_SPENDING: SpendingRules = {
  supportType: FILL_SUPPORT_TYPE,
  unitReserveDays: 1,
  installations: ["repellent-dispersal", "defensive-battery"],
  infestedAt: INFESTATION_TUNING.regionDetectionThreshold,
  installationReserveDays: 30,
  templateName: "Field Refit",
};

/** The Average player's fighting, rhythm and research, without its one installation. */
const AVERAGE = CAMPAIGN_SWEEP_TUNING.players.average;

/**
 * The opt-in players (#1179, C7). Both fight, play and research exactly
 * like the Average player and spend by `REALISTIC_SPENDING`; they differ
 * only in what their missions cost the roster:
 *
 * ```
 *   spender     the Average's losses: none but the first mech, on 30% of losses
 *   realistic   the auto-resolver's: every deployed soldier and mech (AUTO_RESOLVE_CASUALTIES)
 * ```
 *
 * So `spender` against the Average is the spending alone, and
 * `realistic` against `spender` is what replacing a real mission's
 * losses costs on top.
 */
export const OPT_IN_PLAYERS: Readonly<Record<OptInPlayerId, OptInPlayer>> = {
  spender: {
    player: {
      id: "spender",
      outcomes: AVERAGE.outcomes,
      cadence: AVERAGE.cadence,
      intelShare: AVERAGE.intelShare,
      harvests: AVERAGE.harvests,
      mechLoss: AVERAGE.mechLoss,
    },
    spending: REALISTIC_SPENDING,
  },
  realistic: {
    player: {
      id: "realistic",
      outcomes: AVERAGE.outcomes,
      cadence: AVERAGE.cadence,
      intelShare: AVERAGE.intelShare,
      harvests: AVERAGE.harvests,
      mechLoss: AVERAGE.mechLoss,
      casualties: AUTO_RESOLVE_CASUALTIES,
    },
    spending: REALISTIC_SPENDING,
  },
};

// ===========================================
// The spender
// ===========================================

/**
 * A `CreditSpender` that spends by `rules`, for `playCampaignToEnd`.
 *
 * @param rules - What it buys and what it keeps in reserve.
 * @param market - The catalogues it prices from.
 * @returns The spender.
 */
export function realisticSpender(
  rules: SpendingRules,
  market: SpendingMarket,
): CreditSpender {
  return (state, commands) => spendLikeAPlayer(state, commands, rules, market);
}

/**
 * The market a composed game prices from: its content, and the shipped
 * deployable catalogue.
 *
 * @param content - The composition's catalogues and tuning.
 * @returns The market.
 */
export function spendingMarketOf(content: GameContent): SpendingMarket {
  return {
    squadTypes: content.squadTypes,
    parts: content.parts,
    rating: content.rating,
    upgrades: content.upgrades,
    tech: content.tech,
    rosterTuning: content.rosterTuning,
    deployables: SHIPPED_DEPLOYABLES,
  };
}

/**
 * One day's spending by `rules`: the five steps in the header, in
 * order, until one stops to save for a want the bank cannot cover.
 *
 * @param state - The day's state, before research.
 * @param commands - Dispatches each purchase; the campaign's first state.
 * @param rules - What it buys and what it keeps in reserve.
 * @param market - The catalogues it prices from.
 * @returns The state after the day's purchases.
 */
export function spendLikeAPlayer(
  state: GameState,
  commands: Pick<SpendingCommands, "apply" | "first">,
  rules: SpendingRules,
  market: SpendingMarket,
): GameState {
  const ctx: SpendingContext = {
    apply: commands.apply,
    first: commands.first,
    rules,
    market,
  };
  let current = state;
  for (const step of SPENDING_STEPS) {
    const result = step(current, ctx);
    current = result.state;
    if (result.saving) {
      return current;
    }
  }
  return current;
}

/**
 * The squads the drop ship is filled with: the starting squads' types,
 * each as many times as it started, then the support type.
 *
 * @param first - The campaign's first state.
 * @param rules - The support type.
 * @returns The target squad types, in the order they are re-hired.
 */
export function targetSquads(
  first: GameState,
  rules: SpendingRules,
): readonly SquadTypeId[] {
  return [
    ...first.roster.squads.map((squad) => squad.typeId),
    rules.supportType,
  ];
}

/**
 * The mechs the drop ship is filled with: every slot the target squads
 * leave.
 *
 * @param first - The campaign's first state.
 * @param rules - The support type.
 * @returns The target mech count.
 */
export function targetMechs(first: GameState, rules: SpendingRules): number {
  return Math.max(0, MAX_DEPLOYED_UNITS - targetSquads(first, rules).length);
}

/**
 * The bay's refit of `state`'s research over the campaign's starting
 * template, under `rules.templateName`: the loadout every mech the
 * spender builds is built from.
 *
 * @param state - The day's state.
 * @param first - The campaign's first state, whose first template is the starter.
 * @param rules - The template's name.
 * @param market - The catalogues the refit rates by.
 * @returns The refit loadout.
 */
export function refitOf(
  state: GameState,
  first: GameState,
  rules: SpendingRules,
  market: SpendingMarket,
): MechLoadout {
  const start = first.roster.savedLoadouts[0];
  if (start === undefined) {
    throw new Error("the campaign starts with no template");
  }
  const { loadout } = refitLoadout(
    start,
    state.tech.unlocked,
    market.tech.listNodes(),
    market,
  );
  return { ...loadout, name: rules.templateName };
}

/**
 * The installation the spender builds next, or `undefined` when every
 * infested region holds every defence: regions at or above
 * `rules.infestedAt`, most infested first (map order on a tie), and in
 * each the first of `rules.installations` it lacks.
 *
 * @param state - The day's state.
 * @param rules - The defences and the infestation threshold.
 * @param catalogue - Each defence's cap per region.
 * @returns The type and region to build in.
 */
export function nextInstallation(
  state: GameState,
  rules: SpendingRules,
  catalogue: DeployableTypeCatalogue,
): { readonly type: DeployableType; readonly regionId: string } | undefined {
  const { map, deployables } = state.overworld;
  const ranked = map.regions
    .map((region) => ({
      regionId: region.id,
      infestation: regionInfestation(map, region.id),
    }))
    .filter((region) => region.infestation >= rules.infestedAt)
    .sort((a, b) => b.infestation - a.infestation);
  for (const { regionId } of ranked) {
    for (const typeId of rules.installations) {
      const type = catalogue.getDeployableType(typeId);
      if (type === undefined) {
        throw new Error(`${typeId} is not in the catalogue`);
      }
      const held = deployables.filter(
        (each) => each.typeId === typeId && each.regionId === regionId,
      ).length;
      if (held < type.maxPerRegion) {
        return { type, regionId };
      }
    }
  }
  return undefined;
}

/**
 * What `deployables` charge a day, each at its level.
 *
 * @param deployables - Installations standing.
 * @param catalogue - Their types.
 * @returns The daily upkeep; an unknown type charges nothing.
 */
export function upkeepPerDay(
  deployables: readonly Deployable[],
  catalogue: DeployableTypeCatalogue,
): number {
  return deployables.reduce((sum, deployable) => {
    const type = catalogue.getDeployableType(deployable.typeId);
    return (
      sum +
      (type === undefined ? 0 : levelSpec(type, deployable.level).upkeepPerDay)
    );
  }, 0);
}

// ===========================================
// Steps
// ===========================================

/** Step 1: repairs every damaged mech in roster order, each at its full repair cost. */
function repairMechs(state: GameState, ctx: SpendingContext): StepResult {
  let current = state;
  for (const mech of state.roster.mechs) {
    if (mech.damage <= 0) continue;
    const cost = repairCost(mech, ctx.market.rosterTuning);
    if (!coversUnit(current, cost, ctx))
      return { state: current, saving: true };
    current = ctx.apply(current, repairMech(mech.id));
  }
  return { state: current, saving: false };
}

/** Step 2: reinforces every squad below strength to full, at its type's per-soldier price. */
function reinforceSquads(state: GameState, ctx: SpendingContext): StepResult {
  let current = state;
  for (const squad of state.roster.squads) {
    const missing = squad.maxStrength - squad.strength;
    if (missing <= 0) continue;
    const type = ctx.market.squadTypes.getSquadType(squad.typeId);
    if (type === undefined) throw new Error(`${squad.typeId} is not a type`);
    const cost = type.reinforceCostPerSoldier * missing;
    if (!coversUnit(current, cost, ctx))
      return { state: current, saving: true };
    current = ctx.apply(current, reinforceSquad(squad.id, missing));
  }
  return { state: current, saving: false };
}

/**
 * Step 3: hires every target squad the roster lacks, same type, at its
 * hire price: a wiped squad's replacement, and the support squad.
 */
function rehireSquads(state: GameState, ctx: SpendingContext): StepResult {
  let current = state;
  for (const typeId of missingSquads(current, ctx)) {
    const type = ctx.market.squadTypes.getSquadType(typeId);
    if (type === undefined) throw new Error(`${typeId} is not a type`);
    const open = createSquadTypeAvailability(ctx.market.tech, current.tech);
    if (!open.isAvailable(typeId)) {
      throw new Error(`the target squad ${typeId} cannot be hired`);
    }
    if (!coversUnit(current, type.hireCost, ctx)) {
      return { state: current, saving: true };
    }
    const name = `${type.name} ${String(current.roster.squads.length + 1)}`;
    current = ctx.apply(current, hireSquad(typeId, name));
  }
  return { state: current, saving: false };
}

/**
 * Step 4: builds mechs up to the target from the bay's refit of the
 * day's research, saving the refit as the template first when it
 * changed. A mech costs the bay's quote: the refit's price less any
 * salvaged part in stock.
 */
function buildMechs(state: GameState, ctx: SpendingContext): StepResult {
  let current = state;
  const target = targetMechs(ctx.first, ctx.rules);
  while (current.roster.mechs.length < target) {
    const refit = refitOf(current, ctx.first, ctx.rules, ctx.market);
    const saved = current.roster.savedLoadouts.find(
      (each) => each.name === refit.name,
    );
    if (JSON.stringify(saved) !== JSON.stringify(refit)) {
      current = ctx.apply(current, saveLoadout(refit));
    }
    if (!coversUnit(current, quoteOf(refit, current, ctx.market), ctx)) {
      return { state: current, saving: true };
    }
    const name = `${refit.name} ${String(current.roster.mechs.length + 1)}`;
    current = ctx.apply(current, buildMech(refit.name, name));
  }
  return { state: current, saving: false };
}

/**
 * Step 5: builds the next installation while the bank after it still
 * covers `installationReserveDays` of every installation's upkeep, the
 * new one's included.
 */
function buildInstallations(
  state: GameState,
  ctx: SpendingContext,
): StepResult {
  let current = state;
  for (;;) {
    const next = nextInstallation(current, ctx.rules, ctx.market.deployables);
    if (next === undefined) return { state: current, saving: false };
    const spec = levelSpec(next.type, MIN_DEPLOYABLE_LEVEL);
    const upkeep =
      upkeepPerDay(current.overworld.deployables, ctx.market.deployables) +
      spec.upkeepPerDay;
    if (
      current.economy.credits - spec.buildCost <
      ctx.rules.installationReserveDays * upkeep
    ) {
      return { state: current, saving: true };
    }
    current = ctx.apply(current, buildDeployable(next.type.id, next.regionId));
  }
}

/** The day's steps, in order. */
const SPENDING_STEPS: readonly SpendingStep[] = [
  repairMechs,
  reinforceSquads,
  rehireSquads,
  buildMechs,
  buildInstallations,
];

// ===========================================
// Helpers
// ===========================================

/** Whether the bank covers `cost` and still holds `unitReserveDays` of upkeep after it. */
function coversUnit(
  state: GameState,
  cost: number,
  ctx: SpendingContext,
): boolean {
  const reserve =
    ctx.rules.unitReserveDays *
    upkeepPerDay(state.overworld.deployables, ctx.market.deployables);
  return state.economy.credits - cost >= reserve;
}

/** The target squad types the roster lacks, each as many times as it is short. */
function missingSquads(
  state: GameState,
  ctx: SpendingContext,
): readonly SquadTypeId[] {
  const standing = state.roster.squads.map((squad) => squad.typeId);
  const missing: SquadTypeId[] = [];
  for (const typeId of targetSquads(ctx.first, ctx.rules)) {
    const at = standing.indexOf(typeId);
    if (at === -1) missing.push(typeId);
    else standing.splice(at, 1);
  }
  return missing;
}

/** What the bay charges to build `loadout` today: its quote over the stock, with the tree's locks. */
function quoteOf(
  loadout: MechLoadout,
  state: GameState,
  market: SpendingMarket,
): number {
  const sheet = validateLoadout(
    loadout,
    market.parts,
    market.rating,
    market.upgrades,
    createPartAvailability(market.tech, market.parts, state.tech),
  );
  if (!sheet.ok) {
    throw new Error(`the refit does not build: ${JSON.stringify(sheet.error)}`);
  }
  return mechBuildQuote(
    loadout,
    sheet.value,
    stockOf(state.roster),
    market.parts,
  ).cost;
}
