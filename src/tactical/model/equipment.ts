import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Unit, UnitId } from "./unit";
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
 */
export type EquipmentKind = "radar" | "blast" | "charge";

/** Every `EquipmentKind`, in a fixed order. */
export const EQUIPMENT_KINDS = [
  "radar",
  "blast",
  "charge",
] as const satisfies readonly EquipmentKind[];

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
 *                                └─ charge ──► PlacedCharge ──► detonates as turn T+delay opens
 * ```
 */
export interface EquipmentDefinition {
  readonly id: EquipmentId;
  /** What the wheel and the card call it, e.g. `"Grenade"`. */
  readonly name: string;
  readonly kind: EquipmentKind;
  /** Uses per mission. Positive integer. */
  readonly uses: number;
  /** Action points one use costs. Positive integer. */
  readonly apCost: number;
  /**
   * Tiles from the user the tile may be. A radar dish is carried there
   * on foot (a bounded walk over the move graph); a blast or a charge
   * is thrown or placed, measured with `attackDistance` and needing a
   * line of sight. Positive integer.
   */
  readonly range: number;
  /** What a blast or a charge does where it lands; absent for a radar. */
  readonly profile?: WeaponProfile;
  /**
   * Turns a placed charge waits (#1132): placed on turn T in the player
   * phase, it detonates as the player phase of turn `T + delayTurns`
   * opens — two for the shipped charge, so the squad that set it has a
   * whole turn to step away (#1134). Positive integer; absent for
   * anything but a charge.
   */
  readonly delayTurns?: number;
}

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
