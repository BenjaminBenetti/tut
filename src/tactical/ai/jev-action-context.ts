import type { CombatTuning } from "../model/combat-tuning";
import type { JevActionCommand, JevActionType } from "../model/jev-control";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import type { EquipmentRules } from "../service/equipment-service";
import type { MoveGraph } from "../service/movement-service";
import type { TacticalHandlers } from "../service/tactical-command-handlers";

/** Injected tactical rules; providers use the same validators and previews as player commands. */
export interface JevActionRules {
  readonly combat: CombatTuning;
  readonly equipment: EquipmentRules;
  readonly handlers: TacticalHandlers;
}

/** Faction-filtered state shared by action providers, with no hidden units to target or preview. */
export interface JevActionContext {
  readonly view: TacticalState;
  readonly actor: Unit;
  readonly rules: JevActionRules;
  readonly graph: MoveGraph;
  readonly targets: readonly (Unit | TacticalState["spawners"][number])[];
  /** Retain the executable command, its routing identity and factual consequences together. */
  readonly add: (
    category: string,
    command: JevActionCommand,
    details: Readonly<Record<string, unknown>> & { readonly ap_cost: number },
    actionType?: JevActionType,
  ) => void;
}
