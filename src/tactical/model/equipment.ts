import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Unit, UnitId } from "./unit";
import type { Construction } from "./unit-template";
import type { WeaponProfile } from "./weapon-profile";

// ===========================================
// Ids and unions
// ===========================================

/** Id of a piece of equipment in the catalogue, e.g. `"grenade"`. Plain string (ADR 0003). */
export type EquipmentId = string;

/**
 * What using a piece of equipment does (#1132). Closed so the rules,
 * the wheel and the renderer switch on the same list:
 *
 * | kind     | on use                                                   |
 * |----------|----------------------------------------------------------|
 * | `radar`  | places a scanner on the tile (`radar-service`)           |
 * | `blast`  | resolves at once, like a shot at the ground (#1121)      |
 * | `charge` | is placed on the tile and detonates `delayTurns` later   |
 * | `heal`   | mends the user's own side in a blast-shaped area (#1138)  |
 * | `turret` | puts a turret unit on the tile (`turret-service`, #1138) |
 * | `net`    | captures a weakened bug next to the user (`capture-service`, #1179) |
 */
export type EquipmentKind =
  "radar" | "blast" | "charge" | "heal" | "turret" | "net";

/** Every `EquipmentKind`, in a fixed order. */
export const EQUIPMENT_KINDS = [
  "radar",
  "blast",
  "charge",
  "heal",
  "turret",
  "net",
] as const satisfies readonly EquipmentKind[];

/**
 * True for an item that is carried to a tile and put down there
 * (#1138): a radar dish or a turret. Its range is a walk over the move
 * graph rather than a throw, it has no hit chance or damage to preview,
 * and it keeps its own entry on the wheel's ring rather than riding
 * under Attack. The one predicate the rules, the range preview and the
 * wheel share, so a fourth kind of deployable is added in one place.
 */
export function isDeployable(
  definition: Pick<EquipmentDefinition, "kind">,
): boolean {
  return definition.kind === "radar" || definition.kind === "turret";
}

/** Prefix the id generator uses for placed charges, e.g. `"charge-2"`. */
export const CHARGE_ID_PREFIX = "charge";

// ===========================================
// Definition
// ===========================================

/**
 * A limited-use item a squad carries into a mission (GDD §6.2.4,
 * #1132): the radio squad's radar dish, every squad's grenades, the
 * rocket squad's breaching charge. Content, typed here and defined in
 * `tactical/data/equipment.ts`; the rules read it through an
 * `EquipmentCatalogue`.
 *
 * ```
 *   SquadType.equipment ──► UnitTemplate.equipment (ids, frozen at start)
 *                                │
 *   UseEquipment { unitId, equipmentId, tile }
 *                                │
 *                                ├─ radar  ──► Radar placed
 *                                ├─ blast  ──► BlastResolved …   (resolveBlastAt)
 *                                ├─ charge ──► PlacedCharge ──► detonates as turn T+delay opens
 *                                ├─ heal   ──► UnitsHealed        (resolveHealAt)
 *                                ├─ turret ──► a turret Unit on overwatch (#1138)
 *                                └─ net    ──► SpecimenCaptured, the bug carried (#1179)
 * ```
 */
export interface EquipmentDefinition {
  /** Optional scanner override for a compact mech fitting. */
  readonly radar?: {
    readonly scanRange: number;
    readonly batteryTurns: number;
  };
  readonly id: EquipmentId;
  /** What the wheel and the card call it, e.g. `"Grenade"`. */
  readonly name: string;
  readonly kind: EquipmentKind;
  /** Uses per mission. Positive integer. */
  readonly uses: number;
  /** Action points one use costs. Positive integer. */
  readonly apCost: number;
  /**
   * Tiles from the user the tile may be. A radar dish or a turret is
   * carried there on foot (a bounded walk over the move graph); a blast
   * or a charge is thrown or placed, measured with `attackDistance` and
   * needing a line of sight. Positive integer.
   */
  readonly range: number;
  /** What a blast or a charge does where it lands; absent for a radar or a heal. */
  readonly profile?: WeaponProfile;
  /** What a heal does where it lands (#1138); present for a `heal`, absent for the rest. */
  readonly heal?: HealProfile;
  /**
   * Turns a placed charge waits (#1132): placed on turn T in the player
   * phase, it detonates as the player phase of turn `T + delayTurns`
   * opens — two for the shipped charge, so the squad that set it has a
   * whole turn to step away (#1134). Positive integer; absent for
   * anything but a charge.
   */
  readonly delayTurns?: number;
  /** What a capture net takes and what carrying the catch costs (#1179); present for a `net`, absent for the rest. */
  readonly net?: NetProfile;
}

/**
 * What a capture net does (#1179, campaign arc §6.9): thrown over a
 * bug on a tile next to the user once that bug is worn down to
 * `captureAtHpFraction` of its hit points or less, it takes the bug
 * alive, and the squad then carries it home at `carryMovePenalty` fewer
 * movement points per action.
 *
 * ```
 *   capture net  captureAtHpFraction 0.5 · carryMovePenalty 1 · range 1
 * ```
 */
export interface NetProfile {
  /** Hit points, as a share of the bug's maximum, at or below which the net holds. In `(0, 1]`. */
  readonly captureAtHpFraction: number;
  /** Movement points per action the carrier loses while it carries the catch. Non-negative integer. */
  readonly carryMovePenalty: number;
}

/**
 * What a medkit or a repair kit does where it is used (#1138): a
 * blast-shaped area — the same three-dimensional footprint a grenade
 * has, walls and all — in which every living unit of the user's side
 * made of `target` gets `amount` hit points back, never past full.
 * The Executive Director asked for "an AOE like grenade" that heals
 * (#1138), so the shape is the grenade's and only the effect differs.
 *
 * ```
 *   medkit      amount 10 · target organic    · radius 2
 *   repair kit  amount 25 · target mechanical · radius 2
 * ```
 */
export interface HealProfile {
  /** Hit points restored to each unit it reaches, before the cap at full. Positive integer. */
  readonly amount: number;
  /** What the kit can mend: flesh for a medkit, metal for a repair kit. */
  readonly target: Construction;
  /** Tiles from the impact it reaches, in three dimensions, as a blast is measured. */
  readonly radius: number;
}

/**
 * Turns a charge waits when its definition names no delay: placed on
 * turn T, it detonates as turn T + 2 opens, a whole turn to step away
 * (#1134). The rules and every text that names the wait read this.
 */
export const DEFAULT_CHARGE_DELAY_TURNS = 2;

/**
 * How the rules and the HUD look equipment up. A small interface so a
 * service depends on it rather than on the data module (ADR 0003).
 */
export interface EquipmentCatalogue {
  /** The definition for `id`, or undefined for an id the catalogue lacks. */
  get(id: EquipmentId): EquipmentDefinition | undefined;
  /** Every id, in catalogue order. */
  readonly ids: readonly EquipmentId[];
}

// ===========================================
// Placed charge
// ===========================================

/**
 * A breaching charge waiting on a tile (#1132). Plain serialisable data
 * in the mission state, like a fire: put there by `UseEquipment`, it
 * goes off when the player phase of `detonatesOnTurn` opens, whoever is
 * standing on it by then — its own squad included.
 */
export interface PlacedCharge {
  readonly id: string;
  /** The unit that placed it; the kill is theirs, and the blast spares nobody. */
  readonly ownerId: UnitId;
  readonly equipmentId: EquipmentId;
  /** The tile it sits on, level included. */
  readonly tile: TileCoord;
  /** The turn whose player phase opening sets it off. */
  readonly detonatesOnTurn: number;
}

// ===========================================
// Helpers
// ===========================================

/**
 * Uses a unit has left of `definition`: what its record says, or the
 * full allowance when it has not used the item yet. Absent means full,
 * so a unit built before the record existed, or a saved mission that
 * never counted, starts with every use — the kindest reading, and the
 * one that needs no factory or migration to write zeros.
 */
export function usesLeftOf(
  unit: Unit,
  definition: EquipmentDefinition,
): number {
  return unit.equipment?.[definition.id] ?? definition.uses;
}
