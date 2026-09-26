import type { ModelAssetId } from "../../content/data/model-ids";
import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { WeaponProfile } from "../../tactical/model/weapon-profile";
import type { BugUnitSource } from "../../tactical/model/bug-unit-source";

// ===========================================
// Behaviour
// ===========================================

/**
 * How a species fights, as a tag the bug AI (M2) switches on: `rush`
 * closes the distance every turn, `flank` circles for the line's back,
 * `punish-clumps` walks at whatever group is densest, `snipe` (#1179)
 * fires from covered ground at range and backs off when a squad closes,
 * `burrow` (#1179) tunnels under the map to surface beside its mark and
 * fights in melee once it is up, `guard` (#1179) never moves: it fires
 * at the best target in reach and sight, or holds, and `broodmother`
 * (#1179) keeps out of the squad's weapon reach while her clutches do
 * the fighting, and runs for the map edge once she is down to half her
 * hit points, and `sovereign` (#1179) holds the ground in front of the
 * core she guards, cuts down whatever reaches her, and falls back onto
 * the core once she is badly hurt.
 */
export type BehaviourTag =
  | "rush"
  | "flank"
  | "punish-clumps"
  | "snipe"
  | "burrow"
  | "guard"
  | "broodmother"
  | "sovereign";

/** Every behaviour tag, in a fixed order. */
export const BEHAVIOUR_TAGS: readonly BehaviourTag[] = [
  "rush",
  "flank",
  "punish-clumps",
  "snipe",
  "burrow",
  "guard",
  "broodmother",
  "sovereign",
];

// ===========================================
// Bug species
// ===========================================

/**
 * Static definition of a bug species (GDD §6.4). One record per species
 * lives in `bugs/data/species.ts`; the tactical unit factory reads the
 * stat block structurally (it satisfies `tactical/model/BugUnitSource`)
 * and the spawner weighs `hatchWeight` when an egg spawner hatches.
 *
 * ```
 *   BugSpecies (bugs/data, static)         Unit (tactical, runtime)
 *   ┌────────────────────────────┐         ┌──────────────────────┐
 *   │ id: "swarmer"              │◄────────│ sourceId             │
 *   │ hp, armor, move, ap        │────────►│ template stats       │
 *   │ weapon: WeaponProfile      │────────►│ template.weapon      │
 *   │ behaviour: BehaviourTag    │─ AI ───►│ (turn decisions)     │
 *   │ modelId, hatchWeight       │         └──────────────────────┘
 *   └────────────────────────────┘
 * ```
 */
export interface BugSpecies extends BugUnitSource {
  /** Unique catalogue key. */
  readonly id: BugSpeciesId;
  /** Display name, e.g. `"Swarmer"`. */
  readonly name: string;
  /** One or two sentences for the bestiary and contact reports. */
  readonly description: string;
  /** Hit points at spawn. Positive. */
  readonly hp: number;
  /** Armor points subtracted from each hit after `armorPen`. Non-negative. */
  readonly armor: number;
  /**
   * Tiles moved per movement action. Non-negative: `0` is a rooted
   * species (the Hive Guard, #1179), whose move budget is empty so the
   * movement rules refuse every path it could be given.
   */
  readonly move: number;
  /** Action points per turn. Positive. */
  readonly ap: number;
  /** Default attack when no explicit `weapons` loadout is supplied. */
  readonly weapon: WeaponProfile;
  /** Tiles it can see, for fog of war (ADR 0006). Positive. */
  readonly sightRange: number;
  /** How the AI plays it. */
  readonly behaviour: BehaviourTag;
  /** Model rendered on the map. */
  readonly modelId: ModelAssetId;
  /**
   * Relative chance of hatching from an egg spawner or arriving in an
   * edge wave; weights need not sum to 1. Non-negative: `0` means the
   * species is never rolled by default (the spitter until the
   * campaign's bestiary mixes it in, #1179), though the debug
   * placement tool and a per-mission mix can still field it.
   */
  readonly hatchWeight: number;
  /**
   * Experience the killer's squad or mech earns for one of these
   * (#1130). Positive. Frozen onto the unit template at spawn, so the
   * mission resolver credits it without a species lookup.
   */
  readonly xpValue: number;
  /**
   * Tiles per side the species occupies on the ground plane (#1130).
   * Absent means one tile. The brute is `2`: a boulder of carapace does
   * not fit on one tile, and it cannot fit through a door either, which
   * is why its cleavers open walls.
   */
  readonly footprint?: number;
}
