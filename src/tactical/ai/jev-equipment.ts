import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { EquipmentKind } from "../model/equipment";
import { useEquipment } from "../model/use-equipment-command";
import {
  equipmentOf,
  validateEquipmentUse,
  previewEquipmentUse,
  previewHealUse,
} from "../service/equipment-service";
import { unitFootprintTiles } from "../service/footprint-service";
import { equipmentRangeTiles } from "../service/equipment-range-service";
import type { JevActionContext } from "./jev-action-context";
import { jevAttackFacts } from "./jev-combat";

/** New item kinds must explicitly declare targeting and preview semantics; item IDs need no Jev wiring. */
const EQUIPMENT_TARGETS = {
  blast: { target: "hostile", preview: "blast" },
  charge: { target: "tile", preview: "blast" },
  heal: { target: "tile", preview: "heal" },
  radar: { target: "tile", preview: "none" },
  turret: { target: "tile", preview: "none" },
  net: { target: "hostile", preview: "none" },
} as const satisfies Readonly<
  Record<
    EquipmentKind,
    {
      readonly target: "hostile" | "tile";
      readonly preview: "blast" | "heal" | "none";
    }
  >
>;

/** What choosing an item is for, by what it targets. */
const TARGET_PURPOSES = {
  hostile:
    "Use this explosive against a visible enemy unit or nest; choose the entity next. The blast is centered on a tile occupied by that entity.",
  tile: "Use this specific item with the effect described in capability; choose its target tile next.",
} as const;

/** Kinds whose purpose is not what their target says (#1179): a net is thrown at an enemy but is no explosive. */
const KIND_PURPOSES: Readonly<Partial<Record<EquipmentKind, string>>> = {
  net: "Throw this capture net over an adjacent, weakened enemy bug an objective wants alive; choose the entity next. It takes the bug alive for the actor to carry home.",
};

/** Discover all carried items without faction or item-ID lists; shared rules decide legal targets. */
export function jevEquipmentCandidates(context: JevActionContext): void {
  const { view, actor, rules, graph, targets, add } = context;
  for (const { definition, usesLeft } of equipmentOf(
    view.templates[actor.templateId],
    actor,
    rules.equipment.catalogue,
  )) {
    if (usesLeft <= 0 || actor.ap < definition.apCost) continue;
    const policy = EQUIPMENT_TARGETS[definition.kind];
    const options: { tile: TileCoord; targetId?: string }[] = [];
    if (policy.target === "hostile") {
      for (const target of targets) {
        // One option per entity. Prefer its anchor, but any occupied footprint
        // tile can be a legal aim point when range or walls hide the anchor.
        const tiles =
          "templateId" in target
            ? unitFootprintTiles(view, target)
            : [target.pos];
        const tile = tiles.find(
          (pos) =>
            validateEquipmentUse(
              view,
              actor.id,
              definition.id,
              pos,
              rules.equipment,
              graph,
            ).ok,
        );
        if (tile) options.push({ tile, targetId: target.id });
      }
    } else {
      // Validators own geometry: deployment uses a walk, throws use weapon
      // distance, and healing may include the actor's own tile.
      for (const pos of equipmentRangeTiles(
        view,
        actor.id,
        definition.id,
        rules.equipment.catalogue,
        graph.index,
        graph,
        true,
      )) {
        if (
          validateEquipmentUse(
            view,
            actor.id,
            definition.id,
            pos,
            rules.equipment,
            graph,
          ).ok
        )
          options.push({ tile: pos });
      }
    }
    for (const option of options) {
      let consequences: Readonly<Record<string, unknown>> = {};
      if (policy.preview === "blast") {
        const preview = previewEquipmentUse(
          view,
          actor.id,
          definition.id,
          option.tile,
          rules.equipment,
        );
        if (!preview.ok) continue;
        consequences = jevAttackFacts(preview.value);
      } else if (policy.preview === "heal") {
        const preview = previewHealUse(
          view,
          actor.id,
          definition.id,
          option.tile,
          rules.equipment,
        );
        if (!preview.ok) continue;
        consequences = {
          healing: {
            amount: preview.value.amount,
            radius: preview.value.radius,
            beneficiaries: preview.value.beneficiaries,
          },
        };
      }
      add(
        "equipment",
        useEquipment(actor.id, definition.id, option.tile),
        {
          ...definition,
          ap_cost: definition.apCost,
          uses_left: usesLeft,
          ...(option.targetId ? { targetId: option.targetId } : {}),
          ...consequences,
        },
        {
          id: `equipment:${definition.id}`,
          name: `Use ${definition.name}`,
          purpose:
            KIND_PURPOSES[definition.kind] ?? TARGET_PURPOSES[policy.target],
          capability: {
            ...definition,
            ap_cost: definition.apCost,
            uses_left: usesLeft,
          },
        },
      );
    }
  }
}
