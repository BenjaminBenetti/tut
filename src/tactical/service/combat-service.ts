import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import { manhattanDistance } from "../../core/service/grid-math";
import type { CoverLevel } from "../../mapgen/model/cover";
import { CoverLevel as Cover } from "../../mapgen/model/cover";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { AttackCommand } from "../model/attack-command";
import type { AttackPreview } from "../model/attack-preview";
import { ATTACK_RESOLVED } from "../model/attack-resolved-event";
import type { CombatTuning } from "../model/combat-tuning";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalEvent } from "../model/tactical-event";
import type {
  TacticalContext,
  TacticalHandler,
  TacticalOutcome,
} from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import { UNIT_DIED } from "../model/unit-died-event";
import type { Team, Unit, UnitId } from "../model/unit";
import type { UnitTemplate } from "../model/unit-template";
import type { WeaponProfile } from "../model/weapon-profile";
import { coverAgainst, elevationBonus, hasLineOfSight } from "./sight-service";

// ===========================================
// Types
// ===========================================

/** The attacker, the target and their templates, validated for an attack. */
export interface AttackPair {
  readonly attacker: Unit;
  readonly attackerTemplate: UnitTemplate;
  readonly target: Unit;
  readonly targetTemplate: UnitTemplate;
}

/** What the hit-chance formula reads off the map. */
export interface AttackTerrain {
  readonly distance: number;
  readonly cover: CoverLevel;
  readonly flanked: boolean;
  readonly elevation: number;
}

// ===========================================
// Constants
// ===========================================

/** Which team acts in which phase. */
const TEAM_FOR_PHASE: Readonly<Record<TacticalState["phase"], Team>> = {
  player: "tdf",
  bugs: "bugs",
};

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
 * Checks an attack is legal: both units exist and live, the attacker is
 * on the acting side with action points, the target is an enemy other
 * than itself, in range and in sight. Returns the pair for the formulae.
 */
export function validateAttack(
  mission: TacticalState,
  attackerId: UnitId,
  targetId: UnitId,
  tuning: CombatTuning,
): Result<AttackPair & { readonly terrain: AttackTerrain }, TacticalError> {
  const attacker = mission.units.find((u) => u.id === attackerId);
  if (attacker === undefined) {
    return err({ kind: "unit-not-on-map", unitId: attackerId });
  }
  const target = mission.units.find((u) => u.id === targetId);
  if (target === undefined) {
    return err({ kind: "unit-not-on-map", unitId: targetId });
  }
  if (attacker.hp <= 0) {
    return err({ kind: "unit-dead", unitId: attackerId });
  }
  if (target.hp <= 0) {
    return err({ kind: "unit-dead", unitId: targetId });
  }
  if (attacker.team !== TEAM_FOR_PHASE[mission.phase]) {
    return err({ kind: "wrong-phase", unitId: attackerId });
  }
  if (attacker.ap < tuning.attackApCost) {
    return err({ kind: "no-action-points", unitId: attackerId });
  }
  if (attackerId === targetId) {
    return err({ kind: "self-target", unitId: attackerId });
  }
  if (attacker.team === target.team) {
    return err({ kind: "friendly-target", targetId });
  }
  const attackerTemplate = mission.templates[attacker.templateId];
  const targetTemplate = mission.templates[target.templateId];
  if (attackerTemplate === undefined || targetTemplate === undefined) {
    throw new Error(
      `Unit "${attackerTemplate === undefined ? attackerId : targetId}" references a template missing from the mission`,
    );
  }
  const index = new TileIndex(mission.map);
  const terrain = attackTerrain(mission.map, attacker.pos, target.pos, index);
  if (terrain.distance > attackerTemplate.weapon.range) {
    return err({
      kind: "out-of-range",
      distance: terrain.distance,
      range: attackerTemplate.weapon.range,
    });
  }
  if (!hasLineOfSight(mission.map, attacker.pos, target.pos, index)) {
    return err({ kind: "no-line-of-sight", targetId });
  }
  return ok({ attacker, attackerTemplate, target, targetTemplate, terrain });
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
): Result<AttackPreview, TacticalError> {
  const checked = validateAttack(mission, attackerId, targetId, tuning);
  if (!checked.ok) {
    return checked;
  }
  const { attackerTemplate, targetTemplate, terrain } = checked.value;
  return ok({
    hitChance: hitChance(attackerTemplate.weapon, terrain, tuning),
    damage: damageRange(attackerTemplate.weapon, targetTemplate.armor, tuning),
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
 * Rolls an attack (GDD §6.2) with the context's RNG, the fork the lifted
 * handler labelled for this command. Draw order, part of the determinism
 * contract:
 *
 * ```
 *   1. chance(hitChance / 100)                 hit?
 *   2. nextInt(damage.min, damage.max)         only on a hit
 * ```
 *
 * The target loses the damage (never below zero hit points); the attacker
 * pays `attackApCost`, or all of its action points when attacks end the
 * turn. Emits `AttackResolved` always and `UnitDied` (with the killer)
 * when the target's hit points reach zero; the corpse stays in `units`
 * at zero hit points for graphics to remove and the results to count.
 * Pure: on any error the mission is returned untouched.
 */
export function resolveAttack(
  mission: TacticalState,
  command: AttackCommand,
  ctx: TacticalContext,
  tuning: CombatTuning,
): TacticalOutcome {
  const { attackerId, targetId } = command.payload;
  const preview = previewAttack(mission, attackerId, targetId, tuning);
  if (!preview.ok) {
    return preview;
  }
  const attacker = mission.units.find((u) => u.id === attackerId);
  const target = mission.units.find((u) => u.id === targetId);
  if (attacker === undefined || target === undefined) {
    throw new Error("validated units vanished");
  }
  const hit = ctx.rng.chance(preview.value.hitChance / 100);
  const damage = hit
    ? ctx.rng.nextInt(preview.value.damage[0], preview.value.damage[1])
    : 0;
  const targetHp = Math.max(0, target.hp - damage);
  const spentAp = tuning.attackEndsTurn
    ? 0
    : Math.max(0, attacker.ap - tuning.attackApCost);

  const units = mission.units.map((unit): Unit => {
    if (unit.id === attackerId) {
      return { ...unit, ap: spentAp };
    }
    if (unit.id === targetId && damage > 0) {
      return { ...unit, hp: targetHp };
    }
    return unit;
  });
  const events: TacticalEvent[] = [
    {
      type: ATTACK_RESOLVED,
      payload: { attackerId, targetId, hit, damage, targetHp },
    },
  ];
  if (target.hp > 0 && targetHp === 0) {
    events.push({
      type: UNIT_DIED,
      payload: { unitId: targetId, killerId: attackerId },
    });
  }
  return ok({ state: { ...mission, units }, events });
}

/** The `Attack` handler for `registerTacticalCommands`, closed over the tuning. */
export function createAttackHandler(
  tuning: CombatTuning,
): TacticalHandler<AttackCommand> {
  return (mission, command, ctx) =>
    resolveAttack(mission, command, ctx, tuning);
}
