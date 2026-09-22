import type { AttackPreview } from "../model/attack-preview";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { CombatTuning } from "../model/combat-tuning";
import type {
  JevCandidate,
  JevActionCommand,
  JevActionType,
} from "../model/jev-control";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { attack } from "../model/attack-command";
import { overwatch } from "../model/overwatch-command";
import { reload } from "../model/reload-command";
import { extract } from "../model/extract-command";
import { interact } from "../model/interact-command";
import { harvestCarcass } from "../model/harvest-carcass-command";
import { mechAction } from "../model/mech-action-command";
import { useEquipment } from "../model/use-equipment-command";
import { previewAttack, attackEndsTurn } from "../service/combat-service";
import { buildMoveGraph } from "../service/movement-service";
import {
  equipmentOf,
  validateEquipmentUse,
} from "../service/equipment-service";
import type { EquipmentRules } from "../service/equipment-service";
import { validateMechAction } from "../service/mech-action-service";
import { reloadPools } from "../service/reload-handler";
import { applyTacticalCommand } from "../service/tactical-command-handlers";
import type { TacticalHandlers } from "../service/tactical-command-handlers";

/** Injected tactical rules; the action catalogue contains no parallel combat rules. */
export interface JevActionRules {
  readonly combat: CombatTuning;
  readonly equipment: EquipmentRules;
  readonly handlers: TacticalHandlers;
}

/** Enumerate orders using perceived state only. The authoritative handlers validate again on execution. */
export function jevCandidates(
  view: TacticalState,
  actor: Unit,
  rules: JevActionRules,
): readonly JevCandidate[] {
  const candidates: JevCandidate[] = [];
  if (actor.hp <= 0 || actor.ap <= 0 || view.outcome) return candidates;
  /** Retain the executable command and its specific weapon/item routing identity together. */
  const add = (
    category: string,
    command: JevActionCommand,
    details: Readonly<Record<string, unknown>> & { readonly ap_cost: number },
    actionType?: JevActionType,
  ): void => {
    candidates.push({
      id: `action-${String(candidates.length)}`,
      category,
      actionType,
      apCost: details.ap_cost,
      endsActivation: details.ends_activation === true,
      command,
      description: JSON.stringify({
        action: category,
        ...command.payload,
        details,
      }),
    });
  };
  const graph = buildMoveGraph(view.map);
  const template = view.templates[actor.templateId];
  const footprintReach = 2 * ((template?.footprint ?? 1) - 1);
  const targets = [
    ...view.units.filter((unit) => unit.team !== actor.team && unit.hp > 0),
    ...(actor.team === "tdf"
      ? view.spawners.filter((nest) => !nest.destroyed)
      : []),
  ];
  for (const weapon of template?.weapons ?? []) {
    const apCost = rules.combat.attackApCost;
    const endsActivation = attackEndsTurn(
      weapon.profile,
      actor.kind,
      rules.combat,
    );
    const capability = {
      weapon_id: weapon.id,
      weapon: weapon.name,
      ap_cost: apCost,
      ends_activation: endsActivation,
      profile: weapon.profile,
    };
    const targetedAttack: JevActionType = {
      id: `attack:${weapon.id}`,
      name: `Attack with ${weapon.name}`,
      purpose:
        "Attack a visible enemy unit or nest with this weapon; choose the entity next. Area damage is centered on that entity.",
      capability,
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
            ...previewFacts(preview.value),
          },
          targetedAttack,
        );
    }
  }
  if (actor.kind === "turret") return candidates;
  add("overwatch", overwatch(actor.id), {
    ap_cost: 1,
    ends_activation: true,
    effect: "React to enemy movement until the next faction turn",
  });
  if (reloadPools(view, actor).ok)
    add("reload", reload(actor.id), { ap_cost: 1 });
  for (const action of ["brace", "coolant"] as const) {
    const payload = { unitId: actor.id, action };
    if (validateMechAction(view, payload).ok)
      add(action, mechAction(payload), {
        ap_cost: action === "coolant" ? 0 : 1,
      });
  }
  for (const target of targets) {
    const payload = {
      unitId: actor.id,
      action: "designate" as const,
      targetId: target.id,
    };
    if (validateMechAction(view, payload).ok)
      add("designate", mechAction(payload), { ap_cost: 1 });
  }
  const equipment = equipmentOf(template, actor, rules.equipment.catalogue);
  const equipmentReach = Math.max(
    template?.systems?.jumpRange ?? 0,
    ...equipment.map((item) => item.definition.range + footprintReach),
  );
  for (const tile of view.map.tiles) {
    if (!equipment.length && !template?.systems?.jumpRange) break;
    if (
      Math.abs(tile.x - actor.pos.x) + Math.abs(tile.z - actor.pos.z) >
      equipmentReach
    )
      continue;
    const pos = { x: tile.x, y: tile.y, z: tile.z };
    const jump = { unitId: actor.id, action: "jump" as const, tile: pos };
    if (template?.systems?.jumpRange && validateMechAction(view, jump).ok)
      add("jump", mechAction(jump), { ap_cost: 1 });
    for (const item of equipment) {
      const entityTarget = item.definition.kind === "blast";
      const target = entityTarget
        ? targets.find(
            (target) =>
              target.pos.x === pos.x &&
              target.pos.y === pos.y &&
              target.pos.z === pos.z,
          )
        : undefined;
      if (entityTarget && !target) continue;
      if (
        validateEquipmentUse(
          view,
          actor.id,
          item.definition.id,
          pos,
          rules.equipment,
          graph,
        ).ok
      )
        add(
          "equipment",
          useEquipment(actor.id, item.definition.id, pos),
          {
            ...item.definition,
            ap_cost: item.definition.apCost,
            uses_left: item.usesLeft,
            ...(target ? { targetId: target.id } : {}),
          },
          {
            id: `equipment:${item.definition.id}`,
            name: `Use ${item.definition.name}`,
            purpose: entityTarget
              ? "Use this explosive against a visible enemy unit or nest; choose the entity next. The blast is centered on that entity."
              : "Use this specific item with the effect described in capability; choose its target tile next.",
            capability: {
              ...item.definition,
              ap_cost: item.definition.apCost,
              uses_left: item.usesLeft,
            },
          },
        );
    }
  }
  const other = [
    extract(actor.id),
    ...view.objectives.map((objective) => interact(actor.id, objective.id)),
    ...view.carcasses.map((carcass) => harvestCarcass(actor.id, carcass.id)),
  ];
  for (const command of other) {
    const result = applyTacticalCommand(rules.handlers, view, command, {
      rng: new Mulberry32Rng(0),
      ids: new SequentialIdGenerator(),
    });
    if (result.ok)
      add(command.type.replace("tactical:", ""), command, {
        ap_cost:
          actor.ap -
          (result.value.state.units.find((unit) => unit.id === actor.id)?.ap ??
            0),
      });
  }
  return candidates;
}

/** Tactical consequences are sufficient; sending every blast footprint tile needlessly expands the question. */
function previewFacts(
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
