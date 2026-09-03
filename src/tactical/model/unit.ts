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

/** What a token is: a squad of ~5 figures, one mech, or one bug (GDD §6.1). */
export type UnitKind = "squad" | "mech" | "bug";

/** Every `UnitKind`, in a fixed order. */
export const UNIT_KINDS = [
  "squad",
  "mech",
  "bug",
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
 * | `overwatch`  | fires at the first enemy that moves in range      |
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
}

// ===========================================
// Helpers
// ===========================================

/** The mapgen passability bit a unit class needs on a tile. */
export function passMaskFor(passClass: PassClass): UnitClass {
  return passClass === "mech" ? PASS.MECH : PASS.INFANTRY;
}
