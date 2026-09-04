import type { AttackTarget } from "../model/attack-target";
import type { Spawner, TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import type { UnitTemplate } from "../model/unit-template";

// ===========================================
// Constants
// ===========================================

/** What the HUD calls an egg spawner; spawners carry no per-instance name. */
export const SPAWNER_NAME = "Egg spawner";

/**
 * Armor an egg spawner has. A sac of eggs has no plating: `spawnerHp`
 * is the whole of its durability, so a weapon's penetration has nothing
 * to bite on and every hit lands in full.
 */
export const SPAWNER_ARMOR = 0;

// ===========================================
// Adapters
// ===========================================

/** The unit as an attack target, taking its armor and name from its template. */
export function unitAttackTarget(
  unit: Unit,
  template: UnitTemplate,
): AttackTarget {
  return {
    kind: "unit",
    id: unit.id,
    name: template.name,
    pos: unit.pos,
    hp: unit.hp,
    armor: template.armor,
    team: unit.team,
  };
}

/** The spawner as an attack target. Spawners are the bugs' (GDD §5.4), so TDF fire may hit them. */
export function spawnerAttackTarget(spawner: Spawner): AttackTarget {
  return {
    kind: "spawner",
    id: spawner.id,
    name: SPAWNER_NAME,
    pos: spawner.pos,
    hp: spawner.hp,
    armor: SPAWNER_ARMOR,
    team: "bugs",
  };
}

// ===========================================
// Lookup
// ===========================================

/**
 * The thing `targetId` names, whether it is a unit or an egg spawner, or
 * undefined when the mission holds neither. This is the targeting port
 * the combat rules resolve every target through, so a new kind of target
 * is a new adapter here rather than an edit to `validateTargeting`.
 *
 * Units are searched first: they are the common case, and ids do not
 * collide because units, spawners and objectives are all issued by the
 * mission's one id generator.
 *
 * @throws {Error} if a unit references a template the mission lacks,
 *   which is a broken mission rather than an illegal command.
 */
export function findAttackTarget(
  mission: TacticalState,
  targetId: string,
): AttackTarget | undefined {
  const unit = mission.units.find((candidate) => candidate.id === targetId);
  if (unit !== undefined) {
    const template = mission.templates[unit.templateId];
    if (template === undefined) {
      throw new Error(
        `Unit "${targetId}" references a template missing from the mission`,
      );
    }
    return unitAttackTarget(unit, template);
  }
  const spawner = mission.spawners.find(
    (candidate) => candidate.id === targetId,
  );
  return spawner === undefined ? undefined : spawnerAttackTarget(spawner);
}

/**
 * Everything on the map an attacker of `team` could legally aim at: the
 * other side's living units, then its undestroyed egg spawners. The HUD
 * cycles this and the bug AI scores it, so neither has to know that
 * spawners live in their own collection.
 */
export function enemyAttackTargets(
  mission: TacticalState,
  team: Unit["team"],
): AttackTarget[] {
  const targets: AttackTarget[] = [];
  for (const unit of mission.units) {
    if (unit.team === team || unit.hp <= 0) {
      continue;
    }
    const template = mission.templates[unit.templateId];
    if (template !== undefined) {
      targets.push(unitAttackTarget(unit, template));
    }
  }
  if (team !== "bugs") {
    for (const spawner of mission.spawners) {
      if (!spawner.destroyed && spawner.hp > 0) {
        targets.push(spawnerAttackTarget(spawner));
      }
    }
  }
  return targets;
}
