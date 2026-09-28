import type { ActId } from "../../content/model/act-id";
import { ACT_IDS } from "../../content/model/act-id";
import { RANKS } from "../../roster/data/ranks";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import { loadoutPartIds } from "../../roster/model/mech-loadout";
import type { PartId, PartSlot } from "../../roster/model/mech-part";
import type { MechRatingTuning } from "../../roster/model/mech-rating-tuning";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { UpgradeTuning } from "../../roster/model/upgrade-tuning";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import { rankOf } from "../../roster/service/rank-service";
import type { GameState } from "../../save/model/game-state";
import { partIdsOf } from "../../tech/model/tech-effect";
import type { TechNode, TechNodeId } from "../../tech/model/tech-node";
import {
  composeSweepGame,
  endlessStory,
  playCampaign,
} from "./campaign-sweep.test-helper";
import type { ModelledPlayer } from "./modelled-player.test-helper";
import { CAMPAIGN_SWEEP_TUNING } from "./modelled-player.test-helper";

// ===========================================
// Deriving the calibration forces (#1179, campaign arc §12)
// ===========================================
//
// Each act band deploys what the campaign sweep's Average player holds
// halfway through that act, the force a player fights most of the act
// with. The probe plays that player through 24 seeds and reads each
// seed's force at a point of its own campaign, so the next economy
// retune can rerun it rather than hand-copy numbers:
//
//   seed ──► playCampaign(Average, endlessStory), observed every day
//        ──► the act each day was in, and the missions played by then
//   act A began at mission a, the next act at mission b
//        ──► A's midpoint: the first day in A with ≥ (a + b) / 2 played
//   the finale ──► the first day in the finale (its arrival)
//   one band's snapshots ──► ranks     the median xp of squads and of mechs
//                        ──► research  every node ≥ half the seeds held
//                        ──► refit     the bay's advice over that research
//                        ──► credits   the median bank, which fills the
//                                      deployment (calibration-fill)
//
// A seed that never finishes an act has no midpoint for it and does not
// count for that band; the report says how many seeds each band used.
// `endlessStory` is the shipped story whose last ending does not win, so
// only a defeat or the day cap ends a campaign early.

/** Where in a seed's campaign a band's force is read. */
export type ForcePoint =
  | {
      /** Halfway, in missions, between the act's start and the next act's. */
      readonly kind: "midpoint";
      readonly act: ActId;
    }
  | {
      /** The first day in the act. */
      readonly kind: "arrival";
      readonly act: ActId;
    };

/** Where each band's force is read: each act's midpoint, the finale on arrival. */
export const FORCE_POINTS: Readonly<Record<ActId, ForcePoint>> = {
  "act-1": { kind: "midpoint", act: "act-1" },
  "act-2": { kind: "midpoint", act: "act-2" },
  "act-3": { kind: "midpoint", act: "act-3" },
  finale: { kind: "arrival", act: "finale" },
};

/** Campaigns the probe plays: seeds 1 to 24. */
export const FORCE_PROBE_SEEDS = 24;

/** The share of the seeds that must hold a node for the force to have it. */
export const HELD_SHARE = 0.5;

/** One day of a campaign, right after that day's research. */
export interface CampaignDay {
  readonly seed: number;
  /** Missions played before this day's. */
  readonly missions: number;
  readonly act: ActId;
  readonly days: number;
  readonly threat: number;
  readonly credits: number;
  readonly techPoints: number;
  readonly squadXp: readonly number[];
  readonly mechXp: readonly number[];
  readonly unlocked: readonly TechNodeId[];
}

/** One seed's force for a band: the day its point fell on. */
export interface ForceSnapshot extends CampaignDay {
  readonly band: ActId;
  /** The mission the act began at. */
  readonly actStart: number;
  /** The mission the next act began at; absent for an arrival. */
  readonly actEnd?: number;
}

/** What the probe found over every seed. */
export interface ForceProbe {
  readonly snapshots: readonly ForceSnapshot[];
  /** Per seed, the mission each act it reached began at. */
  readonly actStarts: readonly Readonly<Partial<Record<ActId, number>>>[];
}

/** What a rating needs: the bay's catalogue and tuning. */
export interface RatingContent {
  readonly parts: PartCatalogue;
  readonly rating: MechRatingTuning;
  readonly upgrades: UpgradeTuning;
}

/** A band's force, as the probe derives it. */
export interface DerivedForce {
  readonly band: ActId;
  /** Seeds whose point for the band was reached. */
  readonly seeds: number;
  /** The median seed's mission index at the point. */
  readonly missions: number;
  readonly squadXp: number;
  readonly mechXp: number;
  readonly research: readonly TechNodeId[];
  readonly loadout: MechLoadout;
  readonly rating: number;
  /** What the mech bay charges to build the refit. */
  readonly cost: number;
  readonly credits: number;
  readonly units: number;
}

// ===========================================
// Snapshots
// ===========================================

/**
 * Plays `seeds` campaigns of `player` (seeds 1 to `seeds`, the sweep's
 * first ones) through the game with `endlessStory`, records every day,
 * and takes each seed's snapshot at every point in `points` it reaches.
 */
export function probeForces(
  points: Readonly<Partial<Record<ActId, ForcePoint>>> = FORCE_POINTS,
  seeds: number = FORCE_PROBE_SEEDS,
  player: ModelledPlayer = CAMPAIGN_SWEEP_TUNING.players.average,
): ForceProbe {
  const snapshots: ForceSnapshot[] = [];
  const actStarts: Partial<Record<ActId, number>>[] = [];
  const story = endlessStory();
  for (let seed = 1; seed <= seeds; seed++) {
    const game = composeSweepGame(player, { story });
    const days: CampaignDay[] = [];
    let startDay: number | undefined;
    playCampaign(
      game,
      player,
      seed,
      CAMPAIGN_SWEEP_TUNING,
      story.rules,
      (state, missions) => {
        startDay ??= state.overworld.day;
        days.push(dayOf(state, seed, missions, startDay));
      },
    );
    actStarts.push(actStartsOf(days));
    for (const band of ACT_IDS) {
      const point = points[band];
      const snap = point === undefined ? undefined : sampleAt(days, point);
      if (snap !== undefined) snapshots.push({ ...snap, band });
    }
  }
  return { snapshots, actStarts };
}

/** The mission each act in `days` began at: missions played on its first day. */
export function actStartsOf(
  days: readonly CampaignDay[],
): Partial<Record<ActId, number>> {
  const starts: Partial<Record<ActId, number>> = {};
  for (const day of days) starts[day.act] ??= day.missions;
  return starts;
}

/**
 * The day `point` falls on in one seed's `days`, with the act's bounds;
 * undefined when the seed never reached the act or, for a midpoint,
 * never began the next one.
 */
export function sampleAt(
  days: readonly CampaignDay[],
  point: ForcePoint,
): Omit<ForceSnapshot, "band"> | undefined {
  const starts = actStartsOf(days);
  const actStart = starts[point.act];
  if (actStart === undefined) return undefined;
  if (point.kind === "arrival") {
    const day = days.find((d) => d.act === point.act);
    return day === undefined ? undefined : { ...day, actStart };
  }
  const next = ACT_IDS[ACT_IDS.indexOf(point.act) + 1];
  const actEnd = next === undefined ? undefined : starts[next];
  if (actEnd === undefined) return undefined;
  const halfway = (actStart + actEnd) / 2;
  const day = days.find((d) => d.act === point.act && d.missions >= halfway);
  return day === undefined ? undefined : { ...day, actStart, actEnd };
}

/** One campaign's day in `state`. */
export function dayOf(
  state: GameState,
  seed: number,
  missions: number,
  startDay: number,
): CampaignDay {
  return {
    seed,
    missions,
    act: state.overworld.progress.act,
    days: state.overworld.day - startDay,
    threat: state.overworld.threat,
    credits: state.economy.credits,
    techPoints: state.economy.techPoints,
    squadXp: state.roster.squads.map((squad) => squad.xp),
    mechXp: state.roster.mechs.map((mech) => mech.xp),
    unlocked: [...state.tech.unlocked],
  };
}

// ===========================================
// Deriving
// ===========================================

/** Every node at least `share` of `snapshots` held, in tree order. */
export function heldBy(
  snapshots: readonly CampaignDay[],
  nodes: readonly TechNode[],
  share: number = HELD_SHARE,
): readonly TechNodeId[] {
  const needed = share * snapshots.length;
  return nodes
    .map((node) => node.id)
    .filter(
      (id) =>
        snapshots.length > 0 &&
        snapshots.filter((snap) => snap.unlocked.includes(id)).length >= needed,
    );
}

/**
 * The mech bay's advice over `research`: starting from `start`, fit the
 * researched parts that raise the stat sheet's combat rating, the
 * number the bay shows. The candidates are the parts a researched node
 * unlocks and the parts `start` already fits, which a later pass may
 * put back after an earlier one swapped them out (without them, more
 * research could leave a lower rating). The other tier 1 parts a
 * campaign starts with are not considered, so the refit is what a
 * player fits after researching, not an optimiser.
 *
 * ```
 *   three passes:
 *     chassis, legs, arms, arm weapon, back weapon:
 *       each candidate of the slot, in catalogue order:
 *         swap it in if the rating rises
 *     each candidate utility not fitted:
 *       add it if the rating rises, else swap it for the first fitted
 *       utility whose swap raises the rating
 * ```
 *
 * A loadout that does not validate (over weight, over slots) rates −1,
 * so a swap never makes one.
 */
export function refitLoadout(
  start: MechLoadout,
  research: readonly TechNodeId[],
  nodes: readonly TechNode[],
  content: RatingContent,
): { readonly loadout: MechLoadout; readonly rating: number } {
  const candidates = new Set<PartId>([
    ...loadoutPartIds(start),
    ...nodes
      .filter((node) => research.includes(node.id))
      .flatMap((node) => partIdsOf(node)),
  ]);
  const candidatesFor = (slot: PartSlot): readonly PartId[] =>
    content.parts
      .partsForSlot(slot)
      .map((part) => part.id)
      .filter((id) => candidates.has(id));
  const rate = (loadout: MechLoadout): number => ratingOf(loadout, content);
  const fields = [
    ["chassis", "chassisId"],
    ["legs", "legsId"],
    ["arms", "armsId"],
    ["arm-weapon", "armWeaponId"],
    ["back-weapon", "backWeaponId"],
  ] as const;
  let current: MechLoadout = start;
  for (let pass = 0; pass < 3; pass++) {
    for (const [slot, field] of fields) {
      for (const id of candidatesFor(slot)) {
        const next: MechLoadout = { ...current, [field]: id };
        if (rate(next) > rate(current)) current = next;
      }
    }
    for (const id of candidatesFor("utility")) {
      if (current.utilityIds.includes(id)) continue;
      const added: MechLoadout = {
        ...current,
        utilityIds: [...current.utilityIds, id],
      };
      if (rate(added) > rate(current)) {
        current = added;
        continue;
      }
      for (let i = 0; i < current.utilityIds.length; i++) {
        const swapped: MechLoadout = {
          ...current,
          utilityIds: current.utilityIds.map((u, j) => (j === i ? id : u)),
        };
        if (rate(swapped) > rate(current)) {
          current = swapped;
          break;
        }
      }
    }
  }
  return { loadout: current, rating: rate(current) };
}

/** The bay's combat rating of `loadout`, or −1 when it does not validate. */
export function ratingOf(loadout: MechLoadout, content: RatingContent): number {
  const sheet = validateLoadout(
    loadout,
    content.parts,
    content.rating,
    content.upgrades,
  );
  return sheet.ok ? sheet.value.combatRating : -1;
}

/** What the bay charges to build `loadout`, or −1 when it does not validate. */
export function costOf(loadout: MechLoadout, content: RatingContent): number {
  const sheet = validateLoadout(
    loadout,
    content.parts,
    content.rating,
    content.upgrades,
  );
  return sheet.ok ? sheet.value.totalCost : -1;
}

/**
 * A band's force from its snapshots: median ranks, the nodes half the
 * seeds held, the refit of `start` over them, the median bank and the
 * median roster size.
 */
export function deriveForce(
  snapshots: readonly ForceSnapshot[],
  band: ActId,
  start: MechLoadout,
  nodes: readonly TechNode[],
  content: RatingContent,
): DerivedForce {
  const at = snapshots.filter((snap) => snap.band === band);
  const research = heldBy(at, nodes);
  const refit = refitLoadout(start, research, nodes, content);
  return {
    band,
    seeds: at.length,
    missions: median(at.map((snap) => snap.missions)),
    squadXp: median(at.map((snap) => median(snap.squadXp))),
    mechXp: median(at.map((snap) => median(snap.mechXp))),
    research,
    loadout: refit.loadout,
    rating: refit.rating,
    cost: costOf(refit.loadout, content),
    credits: median(at.map((snap) => snap.credits)),
    units: median(at.map((snap) => snap.squadXp.length + snap.mechXp.length)),
  };
}

/** How many seeds reached `act`, and the median mission it began at. */
export function actReach(
  probe: ForceProbe,
  act: ActId,
): { readonly seeds: number; readonly start: number } {
  const starts = probe.actStarts
    .map((seed) => seed[act])
    .filter((start): start is number => start !== undefined);
  return { seeds: starts.length, start: median(starts) };
}

// ===========================================
// Report
// ===========================================

/** The rank name `xp` reaches on the shipped ladder. */
export function rankName(xp: number): string {
  return rankOf(xp, RANKS)?.name ?? "none";
}

/** Every snapshot as a TSV row: the evidence behind a derived force. */
export function snapshotsTsv(snapshots: readonly ForceSnapshot[]): string {
  const header = [
    "seed",
    "band",
    "act_start",
    "act_end",
    "missions",
    "act",
    "days",
    "threat",
    "credits",
    "tech_points",
    "squad_xp",
    "mech_xp",
    "nodes",
    "unlocked",
  ];
  const rows = snapshots.map((snap) =>
    [
      snap.seed,
      snap.band,
      snap.actStart,
      snap.actEnd ?? "",
      snap.missions,
      snap.act,
      snap.days,
      snap.threat.toFixed(1),
      snap.credits,
      snap.techPoints,
      snap.squadXp.join(","),
      snap.mechXp.join(","),
      snap.unlocked.length,
      snap.unlocked.join(","),
    ].join("\t"),
  );
  return [header.join("\t"), ...rows].join("\n") + "\n";
}

/** A derived force as `key<TAB>value` lines, for reading beside the committed force. */
export function derivedForceLines(
  band: string,
  force: DerivedForce,
): readonly string[] {
  return [
    `${band}.seeds\t${String(force.seeds)}`,
    `${band}.missions\t${String(force.missions)} (median mission index at the point)`,
    `${band}.squad_xp\t${String(force.squadXp)} (${rankName(force.squadXp)})`,
    `${band}.mech_xp\t${String(force.mechXp)} (${rankName(force.mechXp)})`,
    `${band}.research\t${String(force.research.length)}: ${force.research.join(", ")}`,
    `${band}.loadout\t${JSON.stringify(force.loadout)}`,
    `${band}.rating\t${String(force.rating)}`,
    `${band}.cost\t${String(force.cost)}`,
    `${band}.credits\t${String(force.credits)}`,
    `${band}.units\t${String(force.units)}`,
  ];
}

// ===========================================
// Private
// ===========================================

/**
 * The median of `values`, taking the lower of the two middle values on
 * an even count so it is a value some seed had (xp stays a whole number
 * of missions); 0 for none.
 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}
