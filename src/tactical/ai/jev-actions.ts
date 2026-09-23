import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { JevCandidate, JevActionCommand } from "../model/jev-control";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { overwatch } from "../model/overwatch-command";
import { reload } from "../model/reload-command";
import { extract } from "../model/extract-command";
import { interact } from "../model/interact-command";
import { harvestCarcass } from "../model/harvest-carcass-command";
import {
  mechAction,
  MECH_ACTION_DEFINITIONS,
} from "../model/mech-action-command";
import type { MechAction } from "../model/mech-action-command";
import { actingUnit } from "../service/acting-unit";
import { buildMoveGraph } from "../service/movement-service";
import { validateMechAction } from "../service/mech-action-service";
import { reloadPools, RELOAD_AP_COST } from "../service/reload-handler";
import { applyTacticalCommand } from "../service/tactical-command-handlers";
import type { JevActionContext, JevActionRules } from "./jev-action-context";
import { jevAttackCandidates } from "./jev-combat";
import { jevEquipmentCandidates } from "./jev-equipment";
import { jevMovementCandidates } from "./jev-movement";
import type { JevDestinationSources } from "./jev-destinations";

export type { JevActionRules } from "./jev-action-context";

/** Enumerate every registered entity order; execution still revalidates through the authoritative handler. */
export function jevCandidates(
  view: TacticalState,
  actor: Unit,
  rules: JevActionRules,
  planning: {
    readonly navigation: TacticalState;
    readonly destinations: JevDestinationSources;
    readonly names: Readonly<Record<string, string>>;
  },
): readonly JevCandidate[] {
  const candidates: JevCandidate[] = [];
  if (view.outcome || !actingUnit(view, actor.id, 1).ok) return candidates;
  const context: JevActionContext = {
    view,
    actor,
    rules,
    graph: buildMoveGraph(view.map),
    targets: [
      ...view.units.filter((unit) => unit.team !== actor.team && unit.hp > 0),
      ...(actor.team === "tdf"
        ? view.spawners.filter((nest) => !nest.destroyed)
        : []),
    ],
    /** Keep each command paired with the exact facts sent to Jev. */
    add(category, command, details, actionType): void {
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
    },
  };
  // This exhaustive registry is the extension point. A new tactical entity
  // command cannot compile without its provider (and gameplay instructions).
  const providers = {
    "tactical:move": () =>
      candidates.push(
        ...jevMovementCandidates(
          planning.navigation,
          actor,
          planning.destinations,
          planning.names,
          (carcassId, pos) =>
            applyTacticalCommand(
              rules.handlers,
              {
                ...view,
                units: view.units.map((unit) =>
                  unit.id === actor.id ? { ...unit, pos } : unit,
                ),
              },
              harvestCarcass(actor.id, carcassId),
              { rng: new Mulberry32Rng(0), ids: new SequentialIdGenerator() },
            ).ok,
        ),
      ),
    "tactical:attack": () => jevAttackCandidates(context),
    "tactical:overwatch": () =>
      context.add("overwatch", overwatch(actor.id), {
        ap_cost: 1,
        ends_activation: true,
        effect: "React to enemy movement until the next faction turn",
      }),
    "tactical:reload": () => {
      if (actor.ap >= RELOAD_AP_COST && reloadPools(view, actor).ok)
        context.add("reload", reload(actor.id), { ap_cost: RELOAD_AP_COST });
    },
    "tactical:mech-action": () => mechCandidates(context),
    "tactical:use-equipment": () => jevEquipmentCandidates(context),
    "tactical:extract": () => addValidated(context, extract(actor.id)),
    "tactical:interact": () => {
      for (const objective of view.objectives)
        addValidated(context, interact(actor.id, objective.id));
    },
    "tactical:harvest-carcass": () => {
      for (const carcass of view.carcasses)
        addValidated(context, harvestCarcass(actor.id, carcass.id));
    },
  } satisfies Readonly<Record<JevActionCommand["type"], () => void>>;
  for (const provide of Object.values(providers)) provide();
  return candidates;
}

/** Discover fitted systems from their shared target definitions instead of a second list of actions. */
function mechCandidates({ view, actor, add, targets }: JevActionContext): void {
  if (!view.templates[actor.templateId]?.systems) return;
  for (const action of Object.keys(MECH_ACTION_DEFINITIONS) as MechAction[]) {
    const definition = MECH_ACTION_DEFINITIONS[action];
    const argumentsForAction =
      definition.target === "tile"
        ? view.map.tiles.map(({ x, y, z }) => ({ tile: { x, y, z } }))
        : definition.target === "hostile"
          ? targets.map((target) => ({ targetId: target.id }))
          : [{}];
    for (const args of argumentsForAction) {
      const payload = { unitId: actor.id, action, ...args };
      if (validateMechAction(view, payload).ok)
        add(action, mechAction(payload), { ap_cost: definition.apCost });
    }
  }
}

/** Query deterministic mission interactions through their real handlers and retain the resulting AP cost. */
function addValidated(
  context: JevActionContext,
  command: JevActionCommand,
): void {
  const { view, actor, rules, add } = context;
  const result = applyTacticalCommand(rules.handlers, view, command, {
    rng: new Mulberry32Rng(0),
    ids: new SequentialIdGenerator(),
  });
  if (result.ok) {
    const after = result.value.state.units.find((unit) => unit.id === actor.id);
    const extracted = result.value.state.extracted.find(
      (unit) => unit.id === actor.id,
    );
    add(command.type.replace("tactical:", ""), command, {
      ap_cost: actor.ap - (after?.ap ?? extracted?.ap ?? 0),
      ends_activation: !after,
    });
  }
}
