import type { EquipmentId } from "./equipment";
import type { WeaponId } from "./unit-weapon";
import type { Direction } from "../../core/model/direction";
import type { UnitClass } from "../../mapgen/model/pass-mask";
import { PassMask as PASS } from "../../mapgen/model/pass-mask";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitTemplateId } from "./unit-template";

// ===========================================
// Ids and unions
// ===========================================

/** Id of a unit on the map, e.g. `"unit-3"`. Plain string (ADR 0003). */
export type UnitId = string;

/** Prefix the id generator uses for tactical units. */
export const UNIT_ID_PREFIX = "unit";

/**
 * What a token is: a squad of ~5 figures, one mech, one bug (GDD §6.1),
 * or a deployed turret (#1138) — a piece of equipment an engineer put
 * down that fights as a unit: it is shot at, it sees, it fires on
 * overwatch, and it is never given an order.
 */
export type UnitKind = "squad" | "mech" | "bug" | "turret";

/** Every `UnitKind`, in a fixed order. */
export const UNIT_KINDS = [
  "squad",
  "mech",
  "bug",
  "turret",
] as const satisfies readonly UnitKind[];

/** Which side a unit fights for. */
export type Team = "tdf" | "bugs";

/** Every `Team`, in a fixed order. */
export const TEAMS = ["tdf", "bugs"] as const satisfies readonly Team[];

/**
 * Which tiles a unit may occupy (ADR 0004 §4.1): infantry enters
 * buildings, mechs are too tall for interiors (GDD §6.1).
 */
export type PassClass = "infantry" | "mech";

/** Every `PassClass`, in a fixed order. */
export const PASS_CLASSES = [
  "infantry",
  "mech",
] as const satisfies readonly PassClass[];

/**
 * Transient conditions on a unit, set and cleared by tactical rules.
 * Closed so the rules and the HUD enumerate the same list:
 *
 * | status       | meaning                                          |
 * |--------------|--------------------------------------------------|
 * | `overwatch`  | fires at enemies that move in range, one shot a step, `overwatchShots` times (#1138) |
 * | `hidden`     | not yet revealed to the other team (lurkers)     |
 * | `suppressed` | pinned; accuracy and movement reduced this turn  |
 */
export type UnitStatus = "overwatch" | "hidden" | "suppressed";

/** Every `UnitStatus`, in a fixed order. */
export const UNIT_STATUSES = [
  "overwatch",
  "hidden",
  "suppressed",
] as const satisfies readonly UnitStatus[];

// ===========================================
// Unit
// ===========================================

/**
 * One token on one tile (GDD §6.1). Plain serializable data inside the
 * tactical mission state; rules return copies. Stats that never change
 * during a mission live on the `UnitTemplate` it references.
 *
 * ```
 *   Unit ── templateId ──► UnitTemplate (maxHp, weapon, move, model …)
 *     ├── sourceId ──────► roster Squad / Mech id, or the bug species id
 *     └── pos, facing, hp, ap, status      (what the mission changes)
 * ```
 */
export interface Unit {
  readonly id: UnitId;
  readonly kind: UnitKind;
  readonly team: Team;
  /** The roster entry (`squad-3`, `mech-1`) or species id (`swarmer`) it came from. */
  readonly sourceId: string;
  readonly templateId: UnitTemplateId;
  /** The tile it stands on. */
  readonly pos: TileCoord;
  /** Which way it faces; cover is judged against attacks from the front and sides. */
  readonly facing: Direction;
  /** Current hit points in `[0, maxHp]`; `0` is dead or wiped. */
  readonly hp: number;
  /** Copied from the template so a HUD needs no lookup. */
  readonly maxHp: number;
  /** Action points left this turn in `[0, maxAp]`. */
  readonly ap: number;
  /** Copied from the template. */
  readonly maxAp: number;
  readonly status: readonly UnitStatus[];
  /** Copied from the template; movement reads it without a lookup. */
  readonly passClass: PassClass;
  /**
   * Shots left per weapon before a reload or vent (#409), keyed by
   * `UnitWeapon.id` and each in `[0, that weapon's charges]`. Absent
   * when no weapon has a pool, as for bugs.
   *
   * Per weapon since #532: emptying the arm gun does not silence the
   * one on the back.
   */
  readonly charges?: Readonly<Record<WeaponId, number>>;
  /**
   * Uses left of each piece of equipment the unit has drawn on (#1132),
   * keyed by `EquipmentId`. An item absent here has never been used and
   * has its full allowance (`usesLeftOf`), so a fresh unit carries no
   * record and a save from before equipment needs no rewrite.
   */
  readonly equipment?: Readonly<Record<EquipmentId, number>>;
  /**
   * Player turns of battery a deployed turret has left (#1138), like a
   * scanner's `Radar.turnsLeft`: drains as each player turn opens and at
   * zero the turret burns out. Absent for everything that is not a
   * turret, and on every unit saved before turrets existed.
   */
  readonly turnsLeft?: number;
  /**
   * Reaction shots left in the unit's current overwatch (#1138). Absent
   * means one, which is what every watch was before turrets: a squad on
   * overwatch fires once and is clear. A turret's gun says two, so it
   * keeps watching after its first shot (`overwatch-status`).
   */
  readonly overwatchShots?: number;
}

// ===========================================
// Helpers
// ===========================================

/** The mapgen passability bit a unit class needs on a tile. */
export function passMaskFor(passClass: PassClass): UnitClass {
  return passClass === "mech" ? PASS.MECH : PASS.INFANTRY;
}

/**
 * True for a unit nobody orders (#1138): a deployed turret holds its
 * tile and fires by rule. The strip does not list it, Tab does not
 * cycle onto it, the wheel does not open for it, and its standing
 * neither keeps the mission open nor counts at the debrief — it is
 * equipment the force left behind, not a member of it.
 */
export function isAutonomous(unit: Pick<Unit, "kind">): boolean {
  return unit.kind === "turret";
}
