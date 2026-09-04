import type { ModelAssetId } from "../../content/data/model-ids";
import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { WeaponProfile } from "../../tactical/model/weapon-profile";

// ===========================================
// Behaviour
// ===========================================

/**
 * How a species fights, as a tag the bug AI (M2) switches on: `rush`
 * closes the distance every turn, `flank` circles for the line's back,
 * `punish-clumps` walks at whatever group is densest.
 */
export type BehaviourTag = "rush" | "flank" | "punish-clumps";

/** Every behaviour tag, in a fixed order. */
export const BEHAVIOUR_TAGS: readonly BehaviourTag[] = [
  "rush",
  "flank",
  "punish-clumps",
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
export interface BugSpecies {
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
  /** Tiles moved per movement action. Positive. */
  readonly move: number;
  /** Action points per turn. Positive. */
  readonly ap: number;
  /** The species' one attack. */
  readonly weapon: WeaponProfile;
  /** Tiles it can see, for fog of war (ADR 0006). Positive. */
  readonly sightRange: number;
  /** How the AI plays it. */
  readonly behaviour: BehaviourTag;
  /** Model rendered on the map. */
  readonly modelId: ModelAssetId;
  /** Relative chance of hatching from an egg spawner. Positive; weights need not sum to 1. */
  readonly hatchWeight: number;
}
