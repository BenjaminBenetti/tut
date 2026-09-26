import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import { CARCASS_HARVESTED } from "../model/carcass-harvested-event";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import type { EarlierStage, MissionStageState } from "../model/mission-stage";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalEvent } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import { isCombatUnit, isStandingForce } from "../model/unit";
import type { UnitTemplate, UnitTemplateId } from "../model/unit-template";
import { UNIT_ABANDONED } from "../model/unit-abandoned-event";
import { UNIT_DIED } from "../model/unit-died-event";
import { facingToward } from "./missions/map-placement";
import type { MissionStartDeps, Placed } from "./mission-start-service";
import { buildMissionStage, claimTile } from "./mission-start-service";
import type { UnitPlacement } from "./unit-factory";

// ===========================================
// Constants
// ===========================================

/**
 * The events of a finished stage the mission's one result still reads
 * (ADR 0013 amendment): the kills and their killers, the carcasses
 * stripped, the units left behind. A stage keeps only these, so a long
 * first stage does not carry its whole log in the save. A result field
 * that comes to read another event type adds it here.
 */
export const STAGE_RESULT_EVENTS: ReadonlySet<TacticalEvent["type"]> = new Set<
  TacticalEvent["type"]
>([UNIT_DIED, CARCASS_HARVESTED, UNIT_ABANDONED]);

// ===========================================
// Where a linked mission stands
// ===========================================

/**
 * True when the mission's current stage is won and another follows
 * (ADR 0013 amendment, #1179): the mission is not over, and the squad
 * goes straight on to the next map with `AdvanceStage`. False on every
 * one-map mission, on a stage still being fought, on a stage lost or
 * left, and on the last stage.
 *
 * ```
 *   outcome won ∧ stage.index + 1 < stage.count ──► true
 *   otherwise                                     ──► false
 * ```
 *
 * @param mission - The mission as it stands.
 */
export function stagePending(mission: TacticalState): boolean {
  const stage = mission.stage;
  return (
    mission.outcome === "won" &&
    stage !== undefined &&
    stage.index + 1 < stage.count
  );
}

/**
 * True once the whole mission is over and can be resolved: an outcome
 * is recorded and no stage waits after it. A lost or left stage ends a
 * linked mission there, whichever stage it was.
 *
 * @param mission - The mission as it stands.
 */
export function missionFinished(mission: TacticalState): boolean {
  return mission.outcome !== undefined && !stagePending(mission);
}

// ===========================================
// The whole mission, across its stages
// ===========================================

/** Everyone, every event the result reads and every stat block, over every stage played. */
export interface MissionRecord {
  /**
   * Every unit of every stage, each once: the earlier stages' units that
   * did not go on, then this stage's units, then those extracted.
   */
  readonly roster: readonly Unit[];
  /** The earlier stages' result events, then this stage's whole log. */
  readonly log: readonly TacticalEvent[];
  /** Every stage's stat blocks, the current stage's last. */
  readonly templates: Readonly<Record<UnitTemplateId, UnitTemplate>>;
}

/**
 * The mission as its one result reads it (ADR 0013 amendment): a
 * one-map mission's units, extracted and log exactly as they are, and a
 * linked mission's with every earlier stage's put in front. A survivor
 * that went on is only in the stage it is in now, under the same id, so
 * the roster names each unit once.
 *
 * ```
 *   roster     earlier[0].units, …, units, extracted
 *   log        earlier[0].log, …, log
 *   templates  earlier[0].templates, …, templates (later wins)
 * ```
 *
 * @param mission - The mission, finished or not.
 */
export function missionRecord(mission: TacticalState): MissionRecord {
  const earlier = mission.stage?.earlier ?? [];
  if (earlier.length === 0) {
    return {
      roster: [...mission.units, ...mission.extracted],
      log: mission.log,
      templates: mission.templates,
    };
  }
  const templates: Record<UnitTemplateId, UnitTemplate> = {};
  for (const stage of earlier) {
    Object.assign(templates, stage.templates);
  }
  Object.assign(templates, mission.templates);
  return {
    roster: [
      ...earlier.flatMap((stage) => stage.units),
      ...mission.units,
      ...mission.extracted,
    ],
    log: [...earlier.flatMap((stage) => stage.log), ...mission.log],
    templates,
  };
}

// ===========================================
// Carry-over
// ===========================================

/**
 * The squads and mechs that go on to the next stage: those that boarded
 * (in the order they left), then those still standing on the map (a
 * stage won on the spot, as the platform core is). Turrets, generators,
 * civilian groups, the dead and the left behind stay where they are.
 *
 * @param mission - A won stage.
 */
export function stageSurvivors(mission: TacticalState): readonly Unit[] {
  return [
    ...mission.extracted.filter(
      (unit) => unit.team === "tdf" && isCombatUnit(unit) && unit.hp > 0,
    ),
    ...mission.units.filter(isStandingForce),
  ];
}

/**
 * A survivor as it stands on the next stage's map (ADR 0013 amendment,
 * #1179): the same unit, with what lasts and nothing else. No repairs,
 * no re-arm.
 *
 * ```
 *   kept     id, kind, team, sourceId, templateId, maxHp, maxAp, passClass
 *            hp               wounds and damage do not mend between stages
 *            charges          ammunition is not topped up
 *            equipment        a charge, a net or a medkit used stays used
 *            ablativeSpent    armour plate shot away stays gone
 *            carrying         a specimen in hand stays in hand
 *   reset    pos, facing      the next map's deploy tiles
 *            ap = maxAp       a fresh turn 1
 *            status []        overwatch and suppression are turn-scoped;
 *                             hidden, dormant and burrowed are the bugs'
 *            heat             bled off: the trip down takes longer than a turn
 *            braced, movedThisTurn, weaponReadyOnTurn, designations,
 *            overwatchShots   all measured in the last map's turns
 * ```
 *
 * A whitelist on purpose: a field added to `Unit` later is left behind
 * unless someone decides it lasts, which is the safe way round for a
 * per-turn flag and a visible omission for a lasting one.
 *
 * @param unit - The survivor as the stage ended.
 * @param placement - Where it stands now.
 */
export function carriedUnit(unit: Unit, placement: UnitPlacement): Unit {
  return {
    id: unit.id,
    kind: unit.kind,
    team: unit.team,
    sourceId: unit.sourceId,
    templateId: unit.templateId,
    pos: placement.pos,
    facing: placement.facing,
    hp: unit.hp,
    maxHp: unit.maxHp,
    ap: unit.maxAp,
    maxAp: unit.maxAp,
    status: [],
    passClass: unit.passClass,
    ...(unit.charges === undefined ? {} : { charges: unit.charges }),
    ...(unit.equipment === undefined ? {} : { equipment: unit.equipment }),
    ...(unit.ablativeSpent === undefined
      ? {}
      : { ablativeSpent: unit.ablativeSpent }),
    ...(unit.carrying === undefined ? {} : { carrying: unit.carrying }),
  };
}

/**
 * What a won stage leaves for the result (ADR 0013 amendment): every
 * unit of it but the survivors going on, its stat blocks and the events
 * the result reads.
 *
 * @param mission - The won stage.
 * @param survivors - The units going on.
 */
export function earlierStageOf(
  mission: TacticalState,
  survivors: readonly Unit[],
): EarlierStage {
  const going = new Set<UnitId>(survivors.map((unit) => unit.id));
  return {
    index: mission.stage?.index ?? 0,
    turns: mission.turn,
    units: [...mission.units, ...mission.extracted].filter(
      (unit) => !going.has(unit.id),
    ),
    templates: mission.templates,
    log: mission.log.filter((event) => STAGE_RESULT_EVENTS.has(event.type)),
  };
}

// ===========================================
// Advancing
// ===========================================

/**
 * Starts the next stage of a linked mission whose stage has just been
 * won (ADR 0013 amendment, #1179): straight into it, with no overworld
 * turn, no repairs, no re-arm and no swaps. The survivors stand on the
 * next map's deploy tiles (mechs first, as a deployment does) as
 * `carriedUnit` keeps them; everyone else, and the events the result
 * reads, go into `stage.earlier` so the mission still resolves as one.
 *
 * ```
 *   no activeMission                     ──► err no-active-mission
 *   not a won stage with one after it    ──► err no-stage-to-advance
 *   offer gone                           ──► err mission-not-found
 *          │
 *   stageSurvivors ──► carriedUnit on the next map's deploy tiles
 *   earlierStageOf ──► stage { index + 1, count, earlier + this }
 *   buildMissionStage (seed "<seed>/stage-n", the type's rules for stage n,
 *                      no garrison) ──► ok { ...state, activeMission }
 * ```
 *
 * Deterministic: the map comes from the offer's seed and the stage, and
 * the survivors are placed in a fixed order on tiles walked in map
 * order.
 *
 * @param state - The campaign, with a won stage in `activeMission`.
 * @param deps - What the mission start reads.
 * @returns The campaign with the next stage in `activeMission`, or why not.
 */
export function advanceMissionStage<TState extends MissionCampaignState>(
  state: TState,
  deps: MissionStartDeps,
): Result<TState, TacticalError> {
  const active = state.activeMission;
  if (active === undefined) {
    return err({ kind: "no-active-mission" });
  }
  const stage = active.stage;
  if (stage === undefined || !stagePending(active)) {
    return err({ kind: "no-stage-to-advance", missionId: active.missionId });
  }
  const mission = state.overworld.missions.find(
    (candidate) => candidate.id === active.missionId,
  );
  if (mission === undefined) {
    return err({ kind: "mission-not-found", missionId: active.missionId });
  }
  const survivors = stageSurvivors(active);
  const next: MissionStageState = {
    index: stage.index + 1,
    count: stage.count,
    earlier: [...stage.earlier, earlierStageOf(active, survivors)],
  };
  return buildMissionStage(
    state,
    mission,
    next,
    (map, zoneTiles) =>
      placeSurvivors(survivors, active.templates, map, zoneTiles),
    deps,
    {},
  );
}

// ===========================================
// Helpers
// ===========================================

/**
 * Stands each survivor on the first free zone tile its class may use,
 * mechs first and then squads, each in survivor order, with the stat
 * blocks they reference. No room is `no-deploy-room`, as for a
 * deployment.
 */
function placeSurvivors(
  survivors: readonly Unit[],
  templates: Readonly<Record<UnitTemplateId, UnitTemplate>>,
  map: TacticalMap,
  zoneTiles: readonly TileCoord[],
): Result<Placed, TacticalError> {
  const index = new TileIndex(map);
  const facing = facingToward(zoneTiles[0], map);
  const used = new Set<string>();
  const ordered = [
    ...survivors.filter((unit) => unit.kind === "mech"),
    ...survivors.filter((unit) => unit.kind !== "mech"),
  ];
  const units: Unit[] = [];
  const kept: Record<UnitTemplateId, UnitTemplate> = {};
  for (const unit of ordered) {
    const placement = claimTile(zoneTiles, index, used, unit.passClass, facing);
    if (placement === undefined) {
      return err({
        kind: "no-deploy-room",
        unitId: unit.sourceId,
        passClass: unit.passClass,
      });
    }
    units.push(carriedUnit(unit, placement));
    const template = templates[unit.templateId];
    if (template !== undefined) {
      kept[unit.templateId] = template;
    }
  }
  return ok({ units, templates: kept });
}
