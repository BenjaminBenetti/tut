import type { IdGenerator } from "../../../core/model/id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { CivilianTuning } from "../../model/civilian";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import type {
  Objective,
  RescueCiviliansObjective,
  TacticalState,
} from "../../model/tactical-state";
import { OBJECTIVE_ID_PREFIX } from "../../model/tactical-state";
import type { UnitId } from "../../model/unit";
import type { UnitTemplate, UnitTemplateId } from "../../model/unit-template";
import type { UnitBuild } from "../unit-factory";
import { civilianUnit } from "../unit-factory";
import { coordOf, facingToward, firstTile } from "./map-placement";

// ===========================================
// Civilians
// ===========================================

/**
 * Puts a trapped civilian group on every civilian hook and holds them
 * as one `rescue-civilians` objective (campaign arc §6.4), appended to
 * whatever the mission already has. The evacuation's setup calls this;
 * a map with no civilian hooks gets nothing, and no objective.
 *
 * ```
 *   map.hooks.objectives (civilian), in hook order ──► trapped civilian units   ids: unit-*
 *   one rescue-civilians objective over all of them                         ids: objective-*
 * ```
 *
 * Pure and deterministic: ids come from `deps.ids` in hook order, then
 * the objective's, and nothing is drawn at random.
 *
 * @param state - The mission so far.
 * @param map - The generated map whose civilian hooks say where the groups hide.
 * @param deps - Ids and the civilian tuning.
 * @returns The mission with the groups and their rescue added.
 */
export function placeCivilians(
  state: TacticalState,
  map: TacticalMap,
  deps: Pick<MissionSetupDeps, "ids" | "civilian">,
): TacticalState {
  const groups = civiliansFrom(map, deps.ids, deps.civilian);
  if (groups.length === 0) {
    return state;
  }
  const templates: Record<UnitTemplateId, UnitTemplate> = {
    ...state.templates,
  };
  for (const build of groups) {
    templates[build.template.id] = build.template;
  }
  return joinRescue(
    {
      ...state,
      units: [...state.units, ...groups.map((build) => build.unit)],
      templates,
    },
    groups.map((build) => build.unit.id),
    deps.ids,
  );
}

/**
 * The mission with `groupIds` added to its rescue: the first
 * `rescue-civilians` objective when there is one, else a new open one
 * appended to the objectives. `placeCivilians` builds a mission's rescue
 * through this, and the debug menu adds a placed group to it, so a
 * staged group is tracked, freed and counted like a generated one.
 *
 * @param state - The mission, with the groups already on the map.
 * @param groupIds - The civilian groups to track.
 * @param ids - Issues the objective id when a new rescue is needed.
 * @returns The mission with every group tracked by one rescue.
 */
export function joinRescue(
  state: TacticalState,
  groupIds: readonly UnitId[],
  ids: IdGenerator,
): TacticalState {
  const existing = state.objectives.find(
    (objective): objective is RescueCiviliansObjective =>
      objective.kind === "rescue-civilians",
  );
  if (existing === undefined) {
    const rescue: RescueCiviliansObjective = {
      id: ids.nextId(OBJECTIVE_ID_PREFIX),
      kind: "rescue-civilians",
      groupIds: [...groupIds],
      complete: false,
      failed: false,
    };
    return { ...state, objectives: [...state.objectives, rescue] };
  }
  const joined: RescueCiviliansObjective = {
    ...existing,
    groupIds: [...existing.groupIds, ...groupIds],
  };
  return {
    ...state,
    objectives: state.objectives.map((objective): Objective =>
      objective.id === existing.id ? joined : objective,
    ),
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * One trapped group per civilian hook, in hook order, facing the board's
 * centre. The map put each hook on an interior floor the squad can
 * reach, so nothing here can fail to stand.
 */
function civiliansFrom(
  map: TacticalMap,
  ids: IdGenerator,
  tuning: CivilianTuning,
): UnitBuild[] {
  return map.hooks.objectives
    .filter((hook) => hook.kind === HookKinds.CIVILIAN)
    .map((hook) => {
      const pos = coordOf(firstTile(hook));
      return civilianUnit(tuning, { pos, facing: facingToward(pos, map) }, ids);
    });
}
