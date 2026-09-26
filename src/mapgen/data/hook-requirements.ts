import { HookKinds } from "../model/hook";
import type { HookRequirement, MapArchetype } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";
import { GREAT_HIVE_CAVERN_HOOKS } from "./great-hive-cavern-recipe";
import { HIVE_CAVERN_HOOKS } from "./hive-cavern-recipe";
import {
  SPORE_PLATFORM_CORE_HOOKS,
  SPORE_PLATFORM_HULL_HOOKS,
} from "./spore-platform-recipe";

// ===========================================
// Default hook requirements
// ===========================================

/**
 * The baseline infestation-clearance hook set (GDD §6.3): one deploy
 * zone, three egg spawners well away from it, two edge spawn zones and an
 * extraction. Mission types (#85) will declare their own; tests and the
 * preview use this one.
 */
export const DEFAULT_MISSION_HOOKS: readonly HookRequirement[] = [
  { kind: HookKinds.DEPLOY, count: 1, requiredPass: PassMask.ALL },
  {
    kind: HookKinds.EGG_SPAWNER,
    count: 3,
    requiredPass: PassMask.INFANTRY,
    minDistanceFromDeploy: 12,
    maxNearestDistanceFromDeploy: 30,
    meta: { hatchRadius: 3 },
  },
  { kind: HookKinds.EDGE_SPAWN, count: 2, requiredPass: PassMask.INFANTRY },
  { kind: HookKinds.EXTRACTION, count: 1, requiredPass: PassMask.ALL },
];

/**
 * The hook set a crash site carries (campaign arc §6.3): one deploy zone,
 * the spore pod on the crater floor, two edge spawn zones for the bugs
 * the landing draws in, and an extraction. No egg spawners — the threat
 * is the pod maturing, not a nest — though the crater still accepts them
 * when a recipe asks (`crater-pass.test`). A mission's tech carcass joins
 * it through the adapter like any other. Distances match
 * `HOOK_KIND_DEFAULTS`, which is what a Crash Site mission type's
 * `requiredHooks` will be completed from.
 */
export const CRASH_SITE_MISSION_HOOKS: readonly HookRequirement[] = [
  { kind: HookKinds.DEPLOY, count: 1, requiredPass: PassMask.ALL },
  {
    kind: HookKinds.SPORE_POD,
    count: 1,
    requiredPass: PassMask.ALL,
    minDistanceFromDeploy: 10,
  },
  { kind: HookKinds.EDGE_SPAWN, count: 2, requiredPass: PassMask.INFANTRY },
  { kind: HookKinds.EXTRACTION, count: 1, requiredPass: PassMask.ALL },
];

/**
 * The civilian hook set (campaign arc §6.4): one deploy zone, four
 * trapped civilian groups in four buildings, two edge spawn zones for
 * the bugs already in the town, and an extraction. Distances match
 * `HOOK_KIND_DEFAULTS`, which is what the Evacuation map rule's civilian
 * requirement is completed from. The Evacuation type traps 3–5 groups
 * by difficulty (the offer's `evacuation.groups`, passed by
 * `EVACUATION_MAP_RULE`; four is the middle of that range) and adds a
 * modest egg-spawner count of its own, one growing to two, so the town
 * has a nest the groups can be hunted from; the preview shows the set
 * without it.
 */
export const CIVILIAN_MISSION_HOOKS: readonly HookRequirement[] = [
  { kind: HookKinds.DEPLOY, count: 1, requiredPass: PassMask.ALL },
  {
    kind: HookKinds.CIVILIAN,
    count: 4,
    requiredPass: PassMask.INFANTRY,
    minDistanceFromDeploy: 6,
  },
  { kind: HookKinds.EDGE_SPAWN, count: 2, requiredPass: PassMask.INFANTRY },
  { kind: HookKinds.EXTRACTION, count: 1, requiredPass: PassMask.ALL },
];

/**
 * The hook set the preview harness asks of each archetype, so Map Lab
 * shows a map with the objectives its missions will have. A new
 * archetype is a compile error here until it names one.
 */
export const ARCHETYPE_MISSION_HOOKS: Readonly<
  Record<MapArchetype, readonly HookRequirement[]>
> = {
  settlement: DEFAULT_MISSION_HOOKS,
  "crash-site": CRASH_SITE_MISSION_HOOKS,
  "hive-cavern": HIVE_CAVERN_HOOKS,
  "spore-platform-hull": SPORE_PLATFORM_HULL_HOOKS,
  "spore-platform-core": SPORE_PLATFORM_CORE_HOOKS,
  "great-hive-cavern": GREAT_HIVE_CAVERN_HOOKS,
};
