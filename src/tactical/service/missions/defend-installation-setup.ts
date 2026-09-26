import { ok } from "../../../core/model/result";
import type { IdGenerator } from "../../../core/model/id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { InstallationDefence } from "../../../overworld/model/mission";
import type { GeneratorTuning } from "../../model/generator";
import type {
  MissionSetupDeps,
  MissionSetupRule,
} from "../../model/mission-setup-rule";
import type {
  DefendGeneratorsObjective,
  TacticalState,
} from "../../model/tactical-state";
import { OBJECTIVE_ID_PREFIX } from "../../model/tactical-state";
import type { UnitTemplate, UnitTemplateId } from "../../model/unit-template";
import type { UnitBuild } from "../unit-factory";
import { generatorUnit } from "../unit-factory";
import { coordOf, facingToward, firstTile } from "./map-placement";

// ===========================================
// Generators
// ===========================================

/**
 * Stands the installation's generators up on the generator hooks and
 * holds them as one `defend-generators` objective (#1175), appended to
 * whatever the mission already has; the waves are counted, not endless.
 * Uplink-style types that defend generators of their own call this from
 * their setup.
 *
 * ```
 *   map.hooks.objectives (generator), in hook order ──► generator units   ids: unit-*
 *   one defend-generators objective over all of them                     ids: objective-*
 *   edgeSpawn.totalWaves = defence.waves
 * ```
 *
 * @param state - The mission so far.
 * @param map - The generated map whose hooks the generators stand on.
 * @param defence - The offer's defence: the installation and its wave count.
 * @param deps - Ids and the generator tuning.
 */
export function standGenerators(
  state: TacticalState,
  map: TacticalMap,
  defence: InstallationDefence,
  deps: MissionSetupDeps,
): TacticalState {
  const generators = generatorsFrom(map, deps.ids, deps.generator);
  const objective: DefendGeneratorsObjective = {
    id: deps.ids.nextId(OBJECTIVE_ID_PREFIX),
    kind: "defend-generators",
    installation: defence.installation,
    targetIds: generators.map((build) => build.unit.id),
    complete: false,
    failed: false,
  };
  const templates: Record<UnitTemplateId, UnitTemplate> = {
    ...state.templates,
  };
  for (const build of generators) {
    templates[build.template.id] = build.template;
  }
  return {
    ...state,
    units: [...state.units, ...generators.map((build) => build.unit)],
    templates,
    objectives: [...state.objectives, objective],
    edgeSpawn: { ...state.edgeSpawn, totalWaves: defence.waves },
  };
}

// ===========================================
// Rule
// ===========================================

/**
 * `defend-installation` (#1175): hold the generators through every
 * counted wave, then bring the force home. The offer's `defence` says
 * which installation and how many waves; an offer without one (which
 * generation never makes) starts with nothing to defend, as it always
 * did.
 */
export const DEFEND_INSTALLATION_SETUP: MissionSetupRule = {
  typeId: "defend-installation",
  /** The generators, the defend objective and the wave count, from the offer's defence. */
  setup(state, map, mission, deps) {
    return ok(
      mission.defence === undefined
        ? state
        : standGenerators(state, map, mission.defence, deps),
    );
  },
};

// ===========================================
// Helpers
// ===========================================

/**
 * One generator per generator hook, in hook order (#1175), facing the
 * board's centre like everything else that stands still. The map
 * placed the hooks on clear ground or interior floors the squad can
 * reach, so nothing here can fail to stand.
 */
function generatorsFrom(
  map: TacticalMap,
  ids: IdGenerator,
  tuning: GeneratorTuning,
): UnitBuild[] {
  return map.hooks.objectives
    .filter((hook) => hook.kind === HookKinds.GENERATOR)
    .map((hook) => {
      const pos = coordOf(firstTile(hook));
      return generatorUnit(
        tuning,
        { pos, facing: facingToward(pos, map) },
        ids,
      );
    });
}
