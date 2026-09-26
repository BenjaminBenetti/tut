import type { CarriedSpecimen } from "./carried-specimen";
import type { EquipmentId } from "./equipment";
import type { WeaponId } from "./unit-weapon";
import type { Direction } from "../../core/model/direction";
import type { UnitClass } from "../../mapgen/model/pass-mask";
import { PassMask as PASS } from "../../mapgen/model/pass-mask";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitTemplateId } from "./unit-template";
import type { PersonaId } from "../../content/model/persona-id";
import { isTrapped } from "./civilian";

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
 * overwatch, and it is never given an order — or a generator (#1175),
 * the installation's plant the squad defends: it is shot at and it
 * sees, but it neither moves nor fires — or a civilian group (campaign
 * arc §6.4), a huddle of townsfolk the squad frees and walks to the
 * drop ship: it moves and boards like a squad, and never fires.
 */
export type UnitKind =
  "squad" | "mech" | "bug" | "turret" | "generator" | "civilian";

/** Every `UnitKind`, in a fixed order. */
export const UNIT_KINDS = [
  "squad",
  "mech",
  "bug",
  "turret",
  "generator",
  "civilian",
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
 * | `dormant`    | a sleeping brood bug (#1179): it neither acts, looks nor watches until its brood wakes |
 */
export type UnitStatus = "overwatch" | "hidden" | "suppressed" | "dormant";

/** Every `UnitStatus`, in a fixed order. */
export const UNIT_STATUSES = [
  "overwatch",
  "hidden",
  "suppressed",
  "dormant",
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
  /** Shared thermal load; absent means cold (or a legacy charge-based mech). */
  readonly heat?: number;
  readonly braced?: boolean;
  readonly movedThisTurn?: boolean;
  readonly ablativeSpent?: number;
  /** Turn number on which each weapon becomes ready again. */
  readonly weaponReadyOnTurn?: Readonly<Record<WeaponId, number>>;
  /** A friendly designation expires when the marking side next begins its turn. */
  readonly designatedBy?: Team;
  readonly designatedUntilTurn?: number;
  /** The designating fitting's accuracy contribution for allied guided attacks. */
  readonly designatedAccuracy?: number;
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
   * turret, on every unit saved before turrets existed, and on a
   * **garrison turret** (#1155), which runs on the region's mains and
   * has no battery to drain (`turretHasBattery`).
   */
  readonly turnsLeft?: number;
  /**
   * Reaction shots left in the unit's current overwatch (#1138). Absent
   * means one, which is what every watch was before turrets: a squad on
   * overwatch fires once and is clear. A turret's gun says two, so it
   * keeps watching after its first shot (`overwatch-status`).
   */
  readonly overwatchShots?: number;
  /**
   * The named enemy this bug is (ADR 0013 §2.8): the Broodmother, a pack
   * alpha, the Sovereign. Set by the mission's setup rule, never by the
   * player. It names the unit (`PERSONAS[persona].displayName`), swaps
   * its species behaviour for the persona's fallback, and lets the app's
   * default Jev policy put it under Jev control when a relay is
   * configured. Absent on every ordinary bug, on every TDF unit and on
   * every unit saved before personas, so no save needs a migration.
   */
  readonly persona?: PersonaId;
  /**
   * The bug this squad took alive with a capture net and is carrying
   * home (#1179). It costs the carrier `movePenalty` movement points per
   * action. Kept on the unit's record when it falls, which is what a
   * dropped specimen is: a dead unit that still carries one, waiting for
   * another squad to pick it up. Absent on every unit that carries
   * nothing and on every unit saved before specimens, so no save needs a
   * migration.
   */
  readonly carrying?: CarriedSpecimen;
  /**
   * True while a civilian group is still shut in the building it hid in
   * (campaign arc §6.4): it takes no orders, sees nothing and holds no
   * action points until a squad or mech beside it uses Interact, which
   * clears the flag. Absent on every other unit, on a freed group and on
   * every unit saved before civilians, so no save needs a migration.
   */
  readonly trapped?: boolean;
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
 * equipment the force left behind, not a member of it. A generator
 * (#1175) is the same to every one of those rules.
 */
export function isAutonomous(unit: Pick<Unit, "kind">): boolean {
  return unit.kind === "turret" || unit.kind === "generator";
}

/**
 * True for a sleeping brood bug (#1179, campaign arc §7.5): placed
 * `dormant` in a hive cavern's chamber, it is skipped by the bug phase
 * before any scoring, pathing or Jev call, keeps its eyes shut (it adds
 * nothing to its side's vision) and neither fires on nor draws
 * overwatch. It can still be seen, targeted and hurt; a hurt dormant bug
 * wakes, and its brood with it (`brood-wake-service`).
 */
export function isDormant(unit: Pick<Unit, "status">): boolean {
  return unit.status.includes("dormant");
}

/**
 * True for a member of the force (campaign arc §6.4): a squad or a mech,
 * the units whose standing keeps a mission open and whose getting out is
 * "somebody came home". A civilian group moves and boards like one, but
 * it is who the force came for, not the force: when the last squad and
 * mech are gone the mission ends, whoever else is still on the map.
 *
 * ```
 *   squad, mech                     ──► true
 *   civilian, turret, generator, bug ──► false
 * ```
 */
export function isCombatUnit(unit: Pick<Unit, "kind">): boolean {
  return unit.kind === "squad" || unit.kind === "mech";
}

/**
 * True for a member of the force still on its feet (campaign arc §6.4):
 * a living TDF squad or mech. The one reading of "who of ours is left"
 * — what keeps a mission open (`missionOutcome`), what
 * `UnitExtracted.remaining` counts and what the top bar's TDF stat
 * shows — so a civilian group, a turret or a generator never pads it.
 *
 * ```
 *   tdf squad or mech, hp > 0             ──► true
 *   dead, a bug, a civilian group,
 *   a turret or a generator               ──► false
 * ```
 */
export function isStandingForce(
  unit: Pick<Unit, "kind" | "team" | "hp">,
): boolean {
  return unit.team === "tdf" && unit.hp > 0 && isCombatUnit(unit);
}

/**
 * True for a unit the player can give an order to when it is its side's
 * turn: anything not autonomous, except a civilian group still trapped
 * (campaign arc §6.4), which waits to be freed. The strip, Tab, the
 * wheel and Jev's hand-off all ask this one question.
 */
export function takesOrders(unit: Pick<Unit, "kind" | "trapped">): boolean {
  return !isAutonomous(unit) && !isTrapped(unit);
}
