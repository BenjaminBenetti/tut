import type { AttackPreview } from "../model/attack-preview";
import type { JevActionType } from "../model/jev-control";
import { attack } from "../model/attack-command";
import { previewAttack, attackEndsTurn } from "../service/combat-service";
import type { JevActionContext } from "./jev-action-context";

/** Every fitted weapon, on either faction, supplies its own legal entity attacks and shared previews. */
export function jevAttackCandidates({
  view,
  actor,
  rules,
  targets,
  add,
}: JevActionContext): void {
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
        "Attack a visible enemy unit or nest with this weapon; choose the entity next. Area damage is centered on that entity.",
      capability: {
        weapon_id: weapon.id,
        weapon: weapon.name,
        ap_cost: apCost,
        ends_activation: endsActivation,
        profile: weapon.profile,
      },
    };
    for (const target of targets) {
      const preview = previewAttack(
        view,
        actor.id,
        target.id,
        rules.combat,
        weapon.id,
      );
      if (preview.ok)
        add(
          "attack",
          attack(actor.id, target.id, weapon.id),
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
