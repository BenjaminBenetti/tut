import type { Direction } from "../../core/model/direction";
import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { MissionType } from "../../content/model/mission-type";
import { HookKinds } from "../../mapgen/model/hook";
import { allows, PassMask } from "../../mapgen/model/pass-mask";
import type { MissionMapRules } from "../../mapgen/model/mission-map-rule";
import type { MapGenRegistries } from "../../mapgen/model/registries";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { missionToMapRecipe } from "../../mapgen/service/mission-map-recipe-adapter";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { Deployment } from "../../overworld/model/deployment";
import {
  deploymentSize,
  MAX_DEPLOYED_UNITS,
} from "../../overworld/model/deployment";
import type { MissionId } from "../../overworld/model/mission";
import type { InfantryUpgradeDefinition } from "../../roster/model/infantry-upgrade";
import type { Mech } from "../../roster/model/mech";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import type { GarrisonTuning } from "../model/garrison-tuning";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import type {
  MissionSetupDeps,
  MissionSetupRules,
} from "../model/mission-setup-rule";
import type { MissionStartOptions } from "../model/mission-start-options";
import type { SitrepRules } from "../model/sitrep-rule";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalState } from "../model/tactical-state";
import { FIRST_TURN } from "../model/tactical-state";
import type { TechCarcass } from "../model/tech-carcass";
import { CARCASS_ID_PREFIX } from "../model/tech-carcass";
import { TURN_STARTED } from "../model/turn-started-event";
import { emptyVision, initialVision } from "./vision-service";
import type { PassClass, Unit } from "../model/unit";
import { passMaskFor } from "../model/unit";
import type { UnitTemplate, UnitTemplateId } from "../model/unit-template";
import type { UnitTuning } from "../model/unit-tuning";
import type { UnitBuild, UnitPlacement } from "./unit-factory";
import { mechUnit, squadUnit } from "./unit-factory";
import { placeGarrisonTurrets } from "./garrison-service";
import { coordOf, facingToward, firstTile } from "./missions/map-placement";
import { MISSION_SETUP_RULES } from "./missions/mission-setup-rules";
import { applySitrepSetups } from "./sitreps/sitrep-service";

// ===========================================
// Types
// ===========================================

/**
 * Content, catalogues and services the mission start reads. Extends the
 * setup rules' own deps — the id generator (the caller writes its state
 * back to `meta`), the spawn tuning (whose `firstWaveTurn` the start
 * reads too) and the generator tuning — which it hands on to the rule
 * for the mission's type.
 */
export interface MissionStartDeps extends MissionSetupDeps {
  readonly missionTypes: Readonly<Record<MissionTypeId, MissionType>>;
  readonly squadTypes: SquadTypeCatalogue;
  /** The mech's stat sheet from its loadout, or undefined when it no longer validates. */
  readonly sheetFor: (mech: Mech) => MechStatSheet | undefined;
  readonly unitTuning: UnitTuning;
  /** Map generation content; the composition root passes the shipped registries. */
  readonly registries: MapGenRegistries;
  /** The turret a region's garrison stands and how the start spreads them (#1155). */
  readonly garrison: GarrisonTuning;
  /**
   * What each mission type puts on its map (ADR 0013 §2.3). The shipped
   * `MISSION_SETUP_RULES` when left out; tests substitute their own.
   */
  readonly setupRules?: MissionSetupRules;
  /**
   * What map each mission type is played on (ADR 0013 §2.3). The shipped
   * `MISSION_MAP_RULES` when left out; a sim or a render stages a map
   * archetype no shipped type asks for yet by substituting its own.
   */
  readonly mapRules?: MissionMapRules;
  /**
   * The campaign's infantry upgrades (campaign arc §10.3), read off the
   * campaign as the mission starts and folded into every squad deployed.
   * The composition root derives them from the unlocked tech; left out,
   * squads deploy with none.
   */
  readonly infantryUpgradesFor?: (
    state: MissionCampaignState,
  ) => readonly InfantryUpgradeDefinition[];
  /**
   * What each sitrep does to a mission (campaign arc §11). The shipped
   * `SITREP_RULES` when left out; tests substitute their own.
   */
  readonly sitrepRules?: SitrepRules;
}

/** Id prefixes the mission start issues, each kept beside the ids it prefixes. */
export {
  OBJECTIVE_ID_PREFIX,
  SPAWNER_ID_PREFIX,
} from "../model/tactical-state";
export { CARCASS_ID_PREFIX } from "../model/tech-carcass";

/** Label of the mission-seed fork the garrison's sites are drawn from. */
export const GARRISON_RNG_LABEL = "garrison-turrets";

// ===========================================
// Mission start
// ===========================================

/**
 * Builds the `TacticalState` for a launched mission and stores it in
 * `activeMission` (GDD §6). No rules run here: units are placed, spawners
 * and objectives recorded, the clock set to the first player turn.
 *
 * ```
 *   mission ──► missionToMapRecipe ──► generateTacticalMap ──► map
 *                                                               │
 *   deployment ──► squadUnit / mechUnit ──► units on deploy-zone tiles
 *                                          (mechs on mech-passable ones first;
 *                                           squads with the campaign's infantry upgrades)
 *   map.hooks.objectives (tech-carcass) ──► carcasses, worth mapParams.techCarcass (#1171)
 *   map.hooks.extraction               ──► extraction tiles
 *   mission.bugMix?                    ──► bugMix, the species the spawns roll
 *   setupRules[mission.typeId]         ──► the type's objectives, entities, schedules
 *                                          (a clearance's spawners, a defence's generators)
 *   options.garrisonTurrets            ──► garrison turrets on random clear tiles (#1155)
 *   mission.sitreps?                   ──► each sitrep's setup, in SITREP_IDS order
 *                                          (smoke, fire, carcasses, a known map)
 *   initialVision                      ──► both sides' first look
 *                                                               │
 *                                                               ▼
 *                              ok { ...state, activeMission: TacticalState }
 * ```
 *
 * Deterministic: the same campaign state, deployment, options and id
 * counters always produce a deep-equal tactical state, because the map
 * comes from the mission's seed, placement walks hooks and tiles in
 * order, and the garrison and each sitrep draw from their own labelled
 * fork of the mission's seed (`garrison-turrets`, `sitrep:<id>`).
 * Generic over the campaign state so the app passes its `GameState`
 * while this domain never imports `save/` (ADR 0002 §3).
 *
 * @param state - The campaign, with no mission active.
 * @param missionId - The offered mission to start.
 * @param deployment - The force sent.
 * @param deps - Content and services the start reads.
 * @param options - What the launch knows beyond the deployment; nothing by default.
 * @returns The campaign with the mission in `activeMission`, or why it cannot start.
 */
export function startTacticalMission<TState extends MissionCampaignState>(
  state: TState,
  missionId: MissionId,
  deployment: Deployment,
  deps: MissionStartDeps,
  options: MissionStartOptions = {},
): Result<TState, TacticalError> {
  if (state.activeMission !== undefined) {
    return err({
      kind: "mission-active",
      missionId: state.activeMission.missionId,
    });
  }
  const mission = state.overworld.missions.find((m) => m.id === missionId);
  if (mission === undefined) {
    return err({ kind: "mission-not-found", missionId });
  }
  const size = deploymentSize(deployment);
  if (size === 0) {
    return err({ kind: "empty-deployment" });
  }
  // Checked here as well as in `validateLaunch` (#67), so the headless
  // path and #341's `StartMission` refuse it the same way and
  // `no-deploy-room` goes back to meaning a genuine map problem rather
  // than a roster the zone was never going to hold (#487).
  if (size > MAX_DEPLOYED_UNITS) {
    return err({ kind: "oversized-deployment", size, max: MAX_DEPLOYED_UNITS });
  }

  const recipe = missionToMapRecipe(
    mission,
    deps.missionTypes[mission.typeId],
    deps.registries,
    // Undefined falls to the adapter's default, the shipped rules.
    deps.mapRules,
  );
  if (!recipe.ok) {
    return err({
      kind: "map-recipe",
      reason: describeRecipeError(recipe.error),
    });
  }
  const map = generateTacticalMap(recipe.value, {
    registries: deps.registries,
  });

  const placed = placeDeployment(state, deployment, map, deps);
  if (!placed.ok) {
    return placed;
  }

  const seed = hashSeed(recipe.value.seed);
  // Everything every mission type shares; the type's own objectives,
  // entities and schedules come from its setup rule below (ADR 0013).
  const base: TacticalState = {
    missionId: mission.id,
    seed,
    difficulty: mission.difficulty,
    threat: state.overworld.threat,
    // The species mix frozen on the offer (ADR 0013 §2.6); an older
    // offer has none and its spawns roll by hatch weight, as before.
    ...(mission.bugMix === undefined ? {} : { bugMix: mission.bugMix }),
    // The sitreps frozen on the offer (campaign arc §11); set up below,
    // after the type's rule and the garrison, and read by sight and the
    // phase steps for the rest of the mission.
    ...(mission.sitreps === undefined ? {} : { sitreps: mission.sitreps }),
    map,
    units: placed.value.units,
    templates: placed.value.templates,
    turn: FIRST_TURN,
    phase: "player",
    objectives: [],
    spawners: [],
    carcasses: carcassesFrom(
      map,
      deps.ids,
      mission.mapParams.techCarcass?.techPoints ?? 0,
    ),
    // Nothing burns until something is fired (#1121).
    effects: [],
    edgeSpawn: { nextTurn: deps.spawnTuning.firstWaveTurn, wave: 0 },
    extraction: map.hooks.extraction.tiles.map(coordOf),
    extracted: [],
    // The mission does begin on turn 1 in the player phase, so it says so
    // (#573). Every later turn is announced by `turn-service`; without
    // this the first one was the only silent one, and a player who
    // launched and read the log was told nothing at all.
    log: [
      { type: TURN_STARTED, payload: { turn: FIRST_TURN, phase: "player" } },
    ],
    // No command has been applied yet. Deliberately not `log.length`,
    // which is 1 here and is exactly the coupling #667 removes.
    radars: [],
    // No charge is set until a squad sets one (#1132).
    charges: [],
    commandSeq: 0,
    // Nobody has looked yet; the first look is taken once all is placed.
    vision: emptyVision(),
  };
  const rules = deps.setupRules ?? MISSION_SETUP_RULES;
  const setUp = rules[mission.typeId].setup(base, map, mission, deps);
  if (!setUp.ok) {
    return setUp;
  }
  const tactical = setUp.value;
  // The region's batteries stand last, on ground the deployment and the
  // spawners have left free (#1155), from a stream that is a pure
  // function of the mission's seed, so nothing else the start draws can
  // move them. Their arrival is logged so the account opens with them.
  const garrison = placeGarrisonTurrets(
    tactical,
    options.garrisonTurrets ?? 0,
    deps.garrison,
    new Mulberry32Rng(seed).fork(GARRISON_RNG_LABEL),
    deps.ids,
  );
  const withGarrison: TacticalState = {
    ...tactical,
    units: garrison.state.units,
    templates: garrison.state.templates,
    log: [...tactical.log, ...garrison.events],
  };
  // The offer's sitreps last (campaign arc §11, ADR 0013 §2.3): each on
  // the ground everything else has claimed, from its own fork of the
  // mission's seed, so a sitrep never moves the garrison, a spawner or
  // another sitrep's draws.
  const withSitreps = applySitrepSetups(
    withGarrison,
    map,
    seed,
    deps.ids,
    deps.sitrepRules,
  );
  const { vision: known, ...placedAll } = withSitreps;
  return ok({
    ...state,
    // Both sides look once from where they deployed, so the first frame
    // is already fogged rather than blank (ADR 0006); the garrison looks
    // with them, so a battery's ground is lit from the first turn. What a
    // sitrep told the squad beforehand (Local Guides) is kept.
    activeMission: { ...placedAll, vision: initialVision(placedAll, known) },
  });
}

// ===========================================
// Placement
// ===========================================

/** Units and their templates once placed, or the first placement error. */
interface Placed {
  readonly units: readonly Unit[];
  readonly templates: Readonly<Record<UnitTemplateId, UnitTemplate>>;
}

/**
 * Builds every deployed unit and stands it on a free deploy-zone tile its
 * class can use. Every squad carries the campaign's infantry upgrades,
 * the capture net among them (#1179). Mechs retain first claim; squads follow. ADR 0004 I6
 * guarantees at least MAX_DEPLOYED_UNITS distinct tiles per class per zone,
 * sufficient for every legal class mix even when the usable sets overlap.
 * Zones and their tiles are walked in map order; a tile is used once.
 */
function placeDeployment(
  state: MissionCampaignState,
  deployment: Deployment,
  map: TacticalMap,
  deps: MissionStartDeps,
): Result<Placed, TacticalError> {
  const index = new TileIndex(map);
  const factoryDeps = {
    ids: deps.ids,
    tuning: deps.unitTuning,
    infantryUpgrades: deps.infantryUpgradesFor?.(state) ?? [],
  };
  const zoneTiles = map.hooks.deployZones.flatMap((zone) => zone.tiles);
  const facing = facingToward(zoneTiles[0], map);
  const used = new Set<string>();
  const units: Unit[] = [];
  const templates: Record<UnitTemplateId, UnitTemplate> = {};

  const builds: UnitBuild[] = [];
  for (const mechId of deployment.mechIds) {
    const mech = state.roster.mechs.find((m) => m.id === mechId);
    if (mech === undefined) {
      return err({ kind: "unit-not-found", unitId: mechId });
    }
    const sheet = deps.sheetFor(mech);
    if (sheet === undefined) {
      return err({ kind: "invalid-loadout", mechId });
    }
    const placement = claimTile(zoneTiles, index, used, "mech", facing);
    if (placement === undefined) {
      return err({ kind: "no-deploy-room", unitId: mechId, passClass: "mech" });
    }
    builds.push(mechUnit(mech, sheet, placement, factoryDeps));
  }
  for (const squadId of deployment.squadIds) {
    const squad = state.roster.squads.find((s) => s.id === squadId);
    if (squad === undefined) {
      return err({ kind: "unit-not-found", unitId: squadId });
    }
    const type = deps.squadTypes.getSquadType(squad.typeId);
    if (type === undefined) {
      return err({ kind: "unit-not-found", unitId: squadId });
    }
    const placement = claimTile(zoneTiles, index, used, "infantry", facing);
    if (placement === undefined) {
      return err({
        kind: "no-deploy-room",
        unitId: squadId,
        passClass: "infantry",
      });
    }
    builds.push(squadUnit(squad, type, placement, factoryDeps));
  }

  for (const build of builds) {
    units.push(build.unit);
    templates[build.template.id] = build.template;
  }
  return ok({ units, templates });
}

/** The first unused zone tile the class may stand on, marked used. */
function claimTile(
  zoneTiles: readonly TileCoord[],
  index: TileIndex,
  used: Set<string>,
  passClass: PassClass,
  facing: Direction,
): UnitPlacement | undefined {
  const required = passMaskFor(passClass);
  for (const coord of zoneTiles) {
    const key = `${String(coord.x)},${String(coord.y)},${String(coord.z)}`;
    if (used.has(key)) {
      continue;
    }
    const tile = index.getAt(coord);
    if (tile === undefined || !allows(tile.pass, required)) {
      continue;
    }
    used.add(key);
    return { pos: coordOf(coord), facing };
  }
  return undefined;
}

// ===========================================
// Tech carcasses
// ===========================================

/**
 * One carcass per tech-carcass hook, on the hook's first tile, worth
 * what the offer decided (#1171). A hook the offer did not price is
 * worth nothing; an offer with no hook yields no carcass, since the
 * adapter only asks for the hook when the offer has one.
 */
function carcassesFrom(
  map: TacticalMap,
  ids: IdGenerator,
  techPoints: number,
): TechCarcass[] {
  return map.hooks.objectives
    .filter((hook) => hook.kind === HookKinds.TECH_CARCASS)
    .map((hook): TechCarcass => ({
      id: ids.nextId(CARCASS_ID_PREFIX),
      pos: coordOf(firstTile(hook)),
      techPoints,
      harvested: false,
    }));
}

// ===========================================
// Helpers
// ===========================================

/** Text for the adapter's typed error. */
function describeRecipeError(error: {
  readonly kind: string;
  readonly id?: string;
}): string {
  return error.id === undefined ? error.kind : `${error.kind} "${error.id}"`;
}

/** Whether a tile mask admits a class; exported for tests that check placement. */
export function tileAdmits(mask: number, passClass: PassClass): boolean {
  return allows(mask, passClass === "mech" ? PassMask.MECH : PassMask.INFANTRY);
}
