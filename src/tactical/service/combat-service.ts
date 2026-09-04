import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import { manhattanDistance } from "../../core/service/grid-math";
import type { CoverLevel } from "../../mapgen/model/cover";
import { CoverLevel as Cover } from "../../mapgen/model/cover";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { AttackCommand } from "../model/attack-command";
import type { AttackTarget } from "../model/attack-target";
import type { AttackPreview } from "../model/attack-preview";
import { ATTACK_RESOLVED } from "../model/attack-resolved-event";
import type { CombatTuning } from "../model/combat-tuning";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type {
  TacticalContext,
  TacticalHandler,
  TacticalOutcome,
} from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import { TEAM_FOR_PHASE } from "../model/tactical-state";
import { UNIT_DIED } from "../model/unit-died-event";
import type { Unit, UnitId } from "../model/unit";
import type { UnitTemplate } from "../model/unit-template";
import type { UnitWeapon, WeaponId } from "../model/unit-weapon";
import { weaponOf } from "../model/unit-weapon";
import type { WeaponProfile } from "../model/weapon-profile";
import { isMelee } from "../model/weapon-profile";
import { findAttackTarget } from "./attack-target-service";
import { endIfOver } from "./mission-end-service";
import { coverAgainst, elevationBonus, hasLineOfSight } from "./sight-service";
import { damageSpawner } from "./spawner-damage-service";

// ===========================================
// Types
// ===========================================

/**
 * The attacker, its stat block and what it is shooting at, validated for
 * an attack. The target is an `AttackTarget` rather than a `Unit`, so
 * the same pair carries a squad, a mech or an egg spawner (#426).
 */
export interface AttackPair {
  readonly attacker: Unit;
  readonly attackerTemplate: UnitTemplate;
  /** The weapon this attack is made with (#532); one of the template's. */
  readonly weapon: UnitWeapon;
  readonly target: AttackTarget;
}

/** What the hit-chance formula reads off the map. */
export interface AttackTerrain {
  readonly distance: number;
  readonly cover: CoverLevel;
  readonly flanked: boolean;
  readonly elevation: number;
}

// ===========================================
// Formulae
// ===========================================

/**
 * Whole-percent chance to hit (GDD §6.2): the weapon's accuracy less a
 * range penalty per tile beyond the first, less the target's cover
 * against this attacker, plus a flank bonus when the target has cover
 * elsewhere but not here, plus a capped elevation modifier; clamped into
 * the tuning's band.
 */
export function hitChance(
  weapon: WeaponProfile,
  terrain: AttackTerrain,
  tuning: CombatTuning,
): number {
  const range = -tuning.rangePenaltyPerTile * Math.max(0, terrain.distance - 1);
  const cover = tuning.coverModifier[terrain.cover];
  const flank = terrain.flanked ? tuning.flankBonus : 0;
  const elevation = Math.max(
    -tuning.maxElevationModifier,
    Math.min(
      tuning.maxElevationModifier,
      terrain.elevation * tuning.elevationPerLevel,
    ),
  );
  const raw = weapon.accuracy + range + cover + flank + elevation;
  return Math.round(
    Math.max(tuning.minHitChance, Math.min(tuning.maxHitChance, raw)),
  );
}

/**
 * Inclusive band a hit can do after armor: the weapon's damage spread by
 * `damageSpread` either way, less the armor the weapon cannot penetrate,
 * never below `minDamage`.
 */
export function damageRange(
  weapon: WeaponProfile,
  armor: number,
  tuning: CombatTuning,
): readonly [number, number] {
  const effectiveArmor = Math.max(0, armor - weapon.armorPen);
  const low = Math.round(weapon.damage * (1 - tuning.damageSpread));
  const high = Math.round(weapon.damage * (1 + tuning.damageSpread));
  return [
    Math.max(tuning.minDamage, low - effectiveArmor),
    Math.max(tuning.minDamage, high - effectiveArmor),
  ];
}

/**
 * Cover, flank, distance and elevation between two tiles on a map. A
 * target is flanked when it has cover against some direction but none
 * against this attacker.
 */
export function attackTerrain(
  map: TacticalMap,
  attacker: TileCoord,
  target: TileCoord,
  index: TileIndex = new TileIndex(map),
): AttackTerrain {
  const cover = coverAgainst(map, target, attacker, index);
  const anyCover = SIDE_PROBES.some(
    (probe) =>
      coverAgainst(
        map,
        target,
        { x: target.x + probe.x, y: target.y, z: target.z + probe.z },
        index,
      ) !== Cover.NONE,
  );
  return {
    distance: manhattanDistance(attacker, target),
    cover,
    flanked: cover === Cover.NONE && anyCover,
    elevation: elevationBonus(attacker, target),
  };
}

/**
 * The terrain as it applies to `weapon` (#446). Geometry is the same for
 * everyone, but cover is not: a melee attacker gets neither the
 * mitigation nor the flank bonus, because both describe a firing line it
 * does not have. Ranged attacks are returned unchanged.
 *
 * Applied here, where the weapon is known, rather than inside
 * `attackTerrain`, which is a pure question about two tiles and a map
 * and is asked by callers that have no weapon in hand.
 */
export function terrainForWeapon(
  terrain: AttackTerrain,
  weapon: WeaponProfile,
): AttackTerrain {
  if (!isMelee(weapon)) {
    return terrain;
  }
  return { ...terrain, cover: Cover.NONE, flanked: false };
}

/** One tile out on each side, to ask whether the target has cover there. */
const SIDE_PROBES: readonly { x: number; z: number }[] = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];

// ===========================================
// Validation
// ===========================================

/**
 * Why this target cannot be shot at because it is already down, or
 * undefined while it still stands. Units die and spawners are destroyed,
 * so the rejection names the right thing for the HUD to phrase.
 */
function targetDown(target: AttackTarget): TacticalError | undefined {
  if (target.hp > 0) {
    return undefined;
  }
  return target.kind === "spawner"
    ? { kind: "target-destroyed", targetId: target.id }
    : { kind: "unit-dead", unitId: target.id };
}

/**
 * Checks an attack is legal for the acting unit: attacker and target
 * both on the map and still standing, the attacker on the acting side
 * with action points to spend, and everything `validateTargeting` asks.
 * The target is whatever `findAttackTarget` resolves the id to, so a
 * squad, a mech and an egg spawner are all legal to name (#426).
 * Returns the pair for the formulae.
 */
export function validateAttack(
  mission: TacticalState,
  attackerId: UnitId,
  targetId: UnitId,
  tuning: CombatTuning,
  weaponId?: WeaponId,
): Result<AttackPair & { readonly terrain: AttackTerrain }, TacticalError> {
  const attacker = mission.units.find((u) => u.id === attackerId);
  if (attacker === undefined) {
    return err({ kind: "unit-not-on-map", unitId: attackerId });
  }
  const target = findAttackTarget(mission, targetId);
  if (target === undefined) {
    return err({ kind: "unit-not-on-map", unitId: targetId });
  }
  if (attacker.hp <= 0) {
    return err({ kind: "unit-dead", unitId: attackerId });
  }
  const down = targetDown(target);
  if (down !== undefined) {
    return err(down);
  }
  if (attacker.team !== TEAM_FOR_PHASE[mission.phase]) {
    return err({ kind: "wrong-phase", unitId: attackerId });
  }
  if (attacker.ap < tuning.attackApCost) {
    return err({ kind: "no-action-points", unitId: attackerId });
  }
  const chosen = weaponOf(
    mission.templates[attacker.templateId]?.weapons ?? [],
    weaponId,
  );
  if (chosen === undefined) {
    return err({ kind: "no-such-weapon", unitId: attackerId });
  }
  // Charges are per weapon (#532): an empty arm gun does not stop the
  // one on the back.
  if (chargesLeft(attacker, chosen) === 0) {
    return err({ kind: "no-charges", unitId: attackerId });
  }
  return validateTargeting(mission, attackerId, targetId, chosen.id);
}

/**
 * The targeting checks that hold whoever's phase it is and whatever the
 * attacker's action points: attacker and target both on the map and
 * still standing, the target an enemy other than the attacker, in range
 * and in sight. Range, sight and cover are judged against the target's
 * tile, so an egg spawner is shot at through exactly the rules a unit
 * is. Overwatch reactions (#328) fire on exactly these. Returns the
 * pair and terrain for the formulae.
 */
export function validateTargeting(
  mission: TacticalState,
  attackerId: UnitId,
  targetId: UnitId,
  weaponId?: WeaponId,
): Result<AttackPair & { readonly terrain: AttackTerrain }, TacticalError> {
  const attacker = mission.units.find((u) => u.id === attackerId);
  if (attacker === undefined) {
    return err({ kind: "unit-not-on-map", unitId: attackerId });
  }
  const target = findAttackTarget(mission, targetId);
  if (target === undefined) {
    return err({ kind: "unit-not-on-map", unitId: targetId });
  }
  if (attacker.hp <= 0) {
    return err({ kind: "unit-dead", unitId: attackerId });
  }
  const down = targetDown(target);
  if (down !== undefined) {
    return err(down);
  }
  if (attackerId === targetId) {
    return err({ kind: "self-target", unitId: attackerId });
  }
  if (attacker.team === target.team) {
    return err({ kind: "friendly-target", targetId });
  }
  const attackerTemplate = mission.templates[attacker.templateId];
  if (attackerTemplate === undefined) {
    throw new Error(
      `Unit "${attackerId}" references a template missing from the mission`,
    );
  }
  const weapon = weaponOf(attackerTemplate.weapons, weaponId);
  if (weapon === undefined) {
    return err({ kind: "no-such-weapon", unitId: attackerId });
  }
  const index = new TileIndex(mission.map);
  const terrain = terrainForWeapon(
    attackTerrain(mission.map, attacker.pos, target.pos, index),
    weapon.profile,
  );
  if (terrain.distance > weapon.profile.range) {
    return err({
      kind: "out-of-range",
      distance: terrain.distance,
      range: weapon.profile.range,
    });
  }
  if (!hasLineOfSight(mission.map, attacker.pos, target.pos, index)) {
    return err({ kind: "no-line-of-sight", targetId });
  }
  return ok({ attacker, attackerTemplate, weapon, target, terrain });
}

// ===========================================
// Charges
// ===========================================

/**
 * Shots left for `weapon`, or undefined when it has no pool at all. A
 * unit whose `charges` record has no entry for a weapon that declares
 * one is treated as full: that is a save written before the weapon
 * existed, not an empty gun.
 */
export function chargesLeft(
  unit: Unit,
  weapon: UnitWeapon,
): number | undefined {
  if (weapon.charges === undefined) {
    return undefined;
  }
  return unit.charges?.[weapon.id] ?? weapon.charges;
}

/** The `charges` patch for a unit that just fired `weapon`; empty when it has no pool. */
function spendCharge(
  unit: Unit,
  weapon: UnitWeapon,
): { charges?: Readonly<Record<WeaponId, number>> } {
  const left = chargesLeft(unit, weapon);
  if (left === undefined) {
    return {};
  }
  return {
    charges: { ...unit.charges, [weapon.id]: Math.max(0, left - 1) },
  };
}

// ===========================================
// Options
// ===========================================

/** One weapon a unit carries, and whether it can be fired right now. */
export interface WeaponOption {
  readonly weapon: UnitWeapon;
  /** Shots left, or undefined for a weapon with no pool. */
  readonly charges: number | undefined;
  /** False when the unit could not attack with it at all this instant. */
  readonly ready: boolean;
  /** Why not, when `ready` is false. */
  readonly refusal?: TacticalError;
}

/**
 * Every weapon `unitId` carries, in template order, each with whether it
 * could be fired this instant and why not (#532).
 *
 * The single list the action bar, the number keys and #529's right-click
 * menu all read, so the three cannot disagree about what a unit can do.
 * Entries are returned whether or not they are ready: a menu that hides
 * an empty gun teaches the player nothing, and one that hides a weapon
 * whose target is out of range looks broken.
 *
 * Readiness here is the unit's own state — phase, action points, charges
 * — not a specific target, because the menu opens before a target is
 * chosen. `previewAttack` answers the per-target question.
 */
export function weaponOptions(
  mission: TacticalState,
  unitId: UnitId,
  tuning: CombatTuning,
): readonly WeaponOption[] {
  const unit = mission.units.find((u) => u.id === unitId);
  const template = unit && mission.templates[unit.templateId];
  if (unit === undefined || template === undefined) {
    return [];
  }
  return template.weapons.map((weapon) => {
    const charges = chargesLeft(unit, weapon);
    const refusal = refuseWeapon(mission, unit, charges, tuning);
    return {
      weapon,
      charges,
      ready: refusal === undefined,
      ...(refusal === undefined ? {} : { refusal }),
    };
  });
}

/** Why the unit cannot fire this weapon at all, target aside. */
function refuseWeapon(
  mission: TacticalState,
  unit: Unit,
  charges: number | undefined,
  tuning: CombatTuning,
): TacticalError | undefined {
  if (unit.hp <= 0) {
    return { kind: "unit-dead", unitId: unit.id };
  }
  if (unit.team !== TEAM_FOR_PHASE[mission.phase]) {
    return { kind: "wrong-phase", unitId: unit.id };
  }
  if (unit.ap < tuning.attackApCost) {
    return { kind: "no-action-points", unitId: unit.id };
  }
  if (charges === 0) {
    return { kind: "no-charges", unitId: unit.id };
  }
  return undefined;
}

// ===========================================
// Preview
// ===========================================

/**
 * The numbers the HUD shows before the player commits (GDD §6.2), or why
 * the attack is not allowed. Pure; `resolveAttack` rolls against exactly
 * this preview.
 */
export function previewAttack(
  mission: TacticalState,
  attackerId: UnitId,
  targetId: UnitId,
  tuning: CombatTuning,
  weaponId?: WeaponId,
): Result<AttackPreview, TacticalError> {
  const checked = validateAttack(
    mission,
    attackerId,
    targetId,
    tuning,
    weaponId,
  );
  if (!checked.ok) {
    return checked;
  }
  const { weapon, target, terrain } = checked.value;
  return ok({
    hitChance: hitChance(weapon.profile, terrain, tuning),
    damage: damageRange(weapon.profile, target.armor, tuning),
    distance: terrain.distance,
    cover: terrain.cover,
    flanked: terrain.flanked,
    elevation: terrain.elevation,
  });
}

// ===========================================
// Resolution
// ===========================================

/**
 * Rolls a validated attack (GDD §6.2) with the context's RNG. Draw order,
 * part of the determinism contract:
 *
 * ```
 *   1. chance(hitChance / 100)                 hit?
 *   2. nextInt(damage.min, damage.max)         only on a hit
 * ```
 *
 * The target loses the damage (never below zero hit points) and the
 * attacker's action points become `apAfter`: what the attack leaves for
 * a normal shot, unchanged for an overwatch reaction. Emits
 * `AttackResolved` always and `UnitDied` (with the killer) when the
 * target's hit points reach zero; the corpse stays in `units` at zero
 * hit points for graphics to remove and the results to count.
 *
 * A shot at an egg spawner (#426) rolls identically and hands the damage
 * to `damageSpawner`, the same rule planted charges use, so it emits
 * `SpawnerDamaged` and — on the killing shot — destroys it and completes
 * its objective. Whether that ended the mission is `resolveAttack`'s
 * question, not this one's: an overwatch reaction never shoots a
 * spawner and must not end anything.
 */
export function rollAttack(
  mission: TacticalState,
  checked: AttackPair & { readonly terrain: AttackTerrain },
  ctx: TacticalContext,
  tuning: CombatTuning,
  apAfter: number,
): TacticalApplied<TacticalState> {
  const { attacker, weapon, target, terrain } = checked;
  const chance = hitChance(weapon.profile, terrain, tuning);
  const band = damageRange(weapon.profile, target.armor, tuning);
  const hit = ctx.rng.chance(chance / 100);
  const damage = hit ? ctx.rng.nextInt(band[0], band[1]) : 0;
  const targetHp = Math.max(0, target.hp - damage);

  // The attacker pays whatever the shot cost it, whatever it shot at.
  const billed: TacticalState = {
    ...mission,
    units: mission.units.map((unit): Unit =>
      unit.id === attacker.id
        ? {
            ...unit,
            ap: apAfter,
            ...spendCharge(unit, weapon),
          }
        : unit,
    ),
  };
  const events: TacticalEvent[] = [
    {
      type: ATTACK_RESOLVED,
      payload: {
        attackerId: attacker.id,
        targetId: target.id,
        hit,
        damage,
        targetHp,
      },
    },
  ];

  // Where the damage lands is the one thing the target's kind decides.
  if (target.kind === "spawner") {
    const hurt = damageSpawner(billed, target.id, damage, attacker.id);
    return { state: hurt.state, events: [...events, ...hurt.events] };
  }
  if (target.hp > 0 && targetHp === 0) {
    events.push({
      type: UNIT_DIED,
      payload: { unitId: target.id, killerId: attacker.id },
    });
  }
  return {
    state: {
      ...billed,
      units: billed.units.map((unit): Unit =>
        unit.id === target.id && damage > 0 ? { ...unit, hp: targetHp } : unit,
      ),
    },
    events,
  };
}

/**
 * Resolves an `Attack` command: validates it, then rolls it with the
 * attacker paying `attackApCost`, or every remaining action point when
 * attacks end the turn. Rolls against exactly the numbers
 * `previewAttack` shows. When the shot destroyed an egg spawner and that
 * completed the last objective, the mission ends here rather than at the
 * next turn boundary, the way `Interact` ends it (#426). Pure: on any
 * error the mission is returned untouched.
 */
export function resolveAttack(
  mission: TacticalState,
  command: AttackCommand,
  ctx: TacticalContext,
  tuning: CombatTuning,
): TacticalOutcome {
  const { attackerId, targetId, weaponId } = command.payload;
  const checked = validateAttack(
    mission,
    attackerId,
    targetId,
    tuning,
    weaponId,
  );
  if (!checked.ok) {
    return checked;
  }
  const apAfter = tuning.attackEndsTurn
    ? 0
    : Math.max(0, checked.value.attacker.ap - tuning.attackApCost);
  const applied = rollAttack(mission, checked.value, ctx, tuning, apAfter);
  // Shooting the last spawner wins the mission there and then, exactly
  // as planting charges on it does; a shot at a unit still waits for the
  // turn boundary, which is where a squad wipe has always been noticed.
  return ok(
    checked.value.target.kind === "spawner"
      ? endIfOver(applied.state, applied.events)
      : applied,
  );
}

/** The `Attack` handler for `registerTacticalCommands`, closed over the tuning. */
export function createAttackHandler(
  tuning: CombatTuning,
): TacticalHandler<AttackCommand> {
  return (mission, command, ctx) =>
    resolveAttack(mission, command, ctx, tuning);
}
