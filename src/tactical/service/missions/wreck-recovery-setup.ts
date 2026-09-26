import { ok } from "../../../core/model/result";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { WreckRecoverySpec } from "../../../overworld/model/wreck-recovery-spec";
import type { MechWreck } from "../../model/mech-wreck";
import { WRECK_ID_PREFIX } from "../../model/mech-wreck";
import type {
  MissionSetupDeps,
  MissionSetupRule,
} from "../../model/mission-setup-rule";
import type {
  StripWreckObjective,
  TacticalState,
} from "../../model/tactical-state";
import { OBJECTIVE_ID_PREFIX } from "../../model/tactical-state";
import { standEggSpawners } from "./infestation-clearance-setup";
import { coordOf, middleOf } from "./map-placement";

// ===========================================
// The wreck
// ===========================================

/**
 * Lays the lost mech on the map's wreck hook and adds the one
 * `strip-wreck` objective (arc §6.6), appended to whatever the mission
 * already has. The record comes from the offer: its name and loadout
 * dress the wreck, its `stripTurns` is how long the squad works it.
 *
 * ```
 *   first wreck hook (footprint × footprint)   ──► MechWreck   ids: wreck-*
 *     tiles in hook order, pos the middle tile
 *   one strip-wreck objective                  ──► turnsNeeded = spec.stripTurns   ids: objective-*
 *   no wreck hook                              ──► the mission as it was
 * ```
 *
 * @param state - The mission so far.
 * @param map - The generated map whose wreck hook the mech lies on.
 * @param spec - The offer's record of the lost mech.
 * @param deps - Ids.
 */
export function layWreck(
  state: TacticalState,
  map: TacticalMap,
  spec: WreckRecoverySpec,
  deps: Pick<MissionSetupDeps, "ids">,
): TacticalState {
  const hook = map.hooks.objectives.find(
    (candidate) => candidate.kind === HookKinds.WRECK,
  );
  const first = hook?.tiles[0];
  if (hook === undefined || first === undefined) {
    return state;
  }
  const tiles = hook.tiles.map(coordOf);
  const wreck: MechWreck = {
    id: deps.ids.nextId(WRECK_ID_PREFIX),
    pos: middleOf(tiles, coordOf(first)),
    tiles,
    mechName: spec.mechName,
    loadout: spec.loadout,
  };
  const objective: StripWreckObjective = {
    id: deps.ids.nextId(OBJECTIVE_ID_PREFIX),
    kind: "strip-wreck",
    targetId: wreck.id,
    turnsNeeded: Math.max(1, spec.stripTurns),
    turnsWorked: 0,
    workedBy: [],
    complete: false,
  };
  return {
    ...state,
    wrecks: [...(state.wrecks ?? []), wreck],
    objectives: [...state.objectives, objective],
  };
}

// ===========================================
// Rule
// ===========================================

/**
 * `wreck-recovery` (arc §6.6): strip the lost mech, then bring the
 * parts home. The map's few egg spawners stand with no objective of
 * their own: they are why the recovery is dangerous, not what it is
 * for. An offer without its wreck record (which the trigger never
 * makes) starts with the nests and nothing to strip, as a defence
 * without its defence starts with nothing to hold.
 *
 * ```
 *   egg-spawner hooks ──► spawners, no objectives      ids: spawner-*
 *   wreck hook        ──► the wreck + strip-wreck      ids: wreck-*, objective-*
 * ```
 */
export const WRECK_RECOVERY_SETUP: MissionSetupRule = {
  typeId: "wreck-recovery",
  /** The nests, then the wreck and its objective from the offer's record. */
  setup(state, map, mission, deps) {
    const nested = standEggSpawners(state, map, mission, deps);
    return ok(
      mission.wreck === undefined
        ? nested
        : layWreck(nested, map, mission.wreck, deps),
    );
  },
};
