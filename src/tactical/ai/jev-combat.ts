import type { AttackPreview } from "../model/attack-preview";
import type { JevActionType } from "../model/jev-control";
import { attack } from "../model/attack-command";
import { isMelee } from "../model/weapon-profile";
import { previewAttack, attackEndsTurn } from "../service/combat-service";
import type { JevActionContext } from "./jev-action-context";

/** What an attack is for; a melee weapon offered a burning tunnel charge says it can pull one. */
const ATTACK_PURPOSE =
  "Attack a visible enemy unit or nest with this weapon; choose the entity next. Area damage is centered on that entity.";
const PULL_PURPOSE =
  "Attack a visible enemy unit or nest with this weapon, or pull a charge burning on a tunnel mouth with it; choose the entity next. Area damage is centered on that entity.";

/**
 * Every fitted weapon, on either faction, supplies its own legal entity
 * attacks and shared previews. A bug's burning tunnel charges (campaign
 * arc §6.7) are offered after the entities; the shared preview refuses
 * any but a melee weapon at one, so only a bite is ever offered.
 */
export function jevAttackCandidates({
  view,
  actor,
  rules,
  targets,
  charges,
  add,
}: JevActionContext): void {
  const aims = [
    ...targets.map((target) => target.id),
    ...charges.map((burning) => burning.charge.id),
  ];
  for (const weapon of view.templates[actor.templateId]?.weapons ?? []) {
    const apCost = rules.combat.attackApCost;
    const endsActivation = attackEndsTurn(
      weapon.profile,
      actor.kind,
      rules.combat,
    );
    const actionType: JevActionType = {
      id: `attack:${weapon.id}`,
      name: `Attack with ${weapon.name}`,
      purpose:
        charges.length > 0 && isMelee(weapon.profile)
          ? PULL_PURPOSE
          : ATTACK_PURPOSE,
      capability: {
        weapon_id: weapon.id,
        weapon: weapon.name,
        ap_cost: apCost,
        ends_activation: endsActivation,
        profile: weapon.profile,
      },
    };
    for (const targetId of aims) {
      const preview = previewAttack(
        view,
        actor.id,
        targetId,
        rules.combat,
        weapon.id,
      );
      if (preview.ok)
        add(
          "attack",
          attack(actor.id, targetId, weapon.id),
          {
            weapon: weapon.name,
            ap_cost: apCost,
            ends_activation: endsActivation,
            ...jevAttackFacts(preview.value),
          },
          actionType,
        );
    }
  }
}

/** Send consequences without the large blast footprint used only by the game's overlay. */
export function jevAttackFacts(
  preview: AttackPreview,
): Readonly<Record<string, unknown>> {
  return {
    hit_chance_percent: preview.hitChance,
    damage_range: preview.damage,
    distance: preview.distance,
    cover: preview.cover,
    flanked: preview.flanked,
    elevation: preview.elevation,
    ...(preview.blast
      ? {
          blast: {
            radius: preview.blast.radius,
            victims: preview.blast.victims,
            leaves_effect: preview.blast.leavesEffect,
          },
        }
      : {}),
  };
}
