import type { Rect, Vec3 } from "../../core/model/grid";
import { phaseEvents } from "../../graphics/service/animation-phases";
import { missionFocus } from "../../graphics/service/tactical-framing";
import type { UnitTemplateLookup } from "../../graphics/service/tactical-scene-builder";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { SideVision, Spawner } from "../../tactical/model/tactical-state";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { PlacedCharge } from "../../tactical/model/equipment";
import type { TechCarcass } from "../../tactical/model/tech-carcass";
import type { TileEffect } from "../../tactical/model/tile-effect";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { perceivedEffects } from "../../tactical/service/tile-effect-service";
import { UNIT_MOVED } from "../../tactical/model/unit-moved-event";
import { UNIT_SPOTTED } from "../../tactical/model/unit-spotted-event";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import {
  perceivedCarcasses,
  perceivedSpawners,
  perceivedUnits,
} from "../../tactical/service/vision-service";
import { LAYER_HEIGHT } from "../../graphics/data/mapgen-preview-palette";
import type { MapExtent } from "../../graphics/service/camera-math";
import type { Radar, RadarContact } from "../../tactical/model/radar";
import { radarContacts } from "../../tactical/service/radar-service";
import type { ObjectiveMarker } from "../../tactical/model/objective-marker";
import { objectiveMarkers } from "../../tactical/service/objective-marker-service";

// ===========================================
// Types
// ===========================================

/**
 * What a step needs to draw one side's view of a mission. The tactical
 * scene builder satisfies it; a test satisfies it with a recorder, which
 * is the point — these rules were unverifiable while they lived inside a
 * method that built its own three.js (#622).
 */
export interface PerceivedStage {
  /** Brings the drawn map in step with the mission's, which demolition changes (#1121). */
  applyMap(map: TacticalMap): void;
  /** Draws the map as this side knows it; `undefined` shows all of it. */
  setVision(vision: SideVision | undefined): void;
  /** Places the units that should be on the board, and removes the rest. */
  update(units: readonly Unit[], templates: UnitTemplateLookup): Promise<void>;
  /** Places the egg spawners that should be on the board. */
  updateSpawners(spawners: readonly Spawner[]): Promise<void>;
  /** Lays the tech carcasses that should be on the board (#1171). */
  updateCarcasses(carcasses: readonly TechCarcass[]): Promise<void>;
  /** Draws the fires on ground this side knows (#1121). */
  updateEffects(effects: readonly TileEffect[]): void;
  /** Draws the breaching charges set and waiting (#1132). */
  updateCharges(charges: readonly PlacedCharge[]): void;
  /** Places friendly scanners and their location-only enemy blips. */
  updateRadar(
    radars: readonly Radar[],
    contacts: readonly RadarContact[],
  ): Promise<void>;
  /** Marks the open objectives this side cannot see with a white diamond (#1173). */
  updateObjectiveMarkers(markers: readonly ObjectiveMarker[]): void;
}

/**
 * What a step needs to put a unit on the board ahead of its walk. The
 * tactical scene builder satisfies it; a test satisfies it with a
 * recorder.
 */
export interface ArrivalStage {
  /** Ids of the units currently drawn or loading. */
  unitIds(): readonly UnitId[];
  /** Places `unit` at `at`, ready to be walked, unless it is already on the board. */
  arrive(unit: Unit, template: UnitTemplate, at: TileCoord): Promise<void>;
}

/** What a step needs to point the camera at a mission. */
export interface SceneFraming {
  /** Limits how far the camera may be panned. */
  setBounds(bounds: Rect | undefined): void;
  /** Sizes the zoom range so the whole map fits at the far end (#828). */
  setMapExtent(extent: MapExtent | undefined): void;
  /** Centres the camera on a world point. */
  lookAt(target: Vec3): void;
}

/** What a step needs to play a batch of events around a redraw. */
export interface PhasedQueue {
  /** Plays the events, then calls `done`; `onStart` hears each as it begins. */
  enqueue(
    events: readonly TacticalEvent[],
    done: () => void,
    onStart?: (event: TacticalEvent) => void,
  ): void;
}

// ===========================================
// Steps
// ===========================================

/**
 * Draws the player's view of `mission`, in the order the view needs.
 *
 * ```
 *   applyMap(map)                          what demolition has taken down (#1121)
 *   setVision(vision.tdf)                  the map, as this side knows it
 *   then, together:
 *     update(perceivedUnits)               spotted enemies only
 *     updateSpawners(perceivedSpawners)    explored spawners only
 *     updateCarcasses(perceivedCarcasses)  explored carcasses only (#1171)
 *     updateEffects(perceivedEffects)      fires on explored ground
 *     updateCharges(charges)               set breaching charges (#1132)
 *     updateObjectiveMarkers(objectiveMarkers)  white diamonds on fogged nests (#1173)
 * ```
 *
 * Two rules live here, and both are silent when broken. The scene draws
 * the player's view rather than the mission (ADR 0006 §2.4), so an
 * unspotted enemy must have no object at all — passing `mission.units`
 * would draw one, and it could then be picked and read off the scene
 * graph, which is a wallhack rather than a cosmetic slip (#551). And
 * vision is set before the units are placed, or the map draws one frame
 * stale behind them.
 *
 * @param stage - The scene to draw into.
 * @param mission - The mission to draw.
 */
export async function drawPerceived(
  stage: PerceivedStage,
  mission: TacticalState,
): Promise<void> {
  // The map first: a wall that fell this command must be gone before
  // vision is painted onto what is left.
  stage.applyMap(mission.map);
  stage.setVision(mission.vision.tdf);
  stage.updateEffects(perceivedEffects(mission, "tdf"));
  // A set charge is the player's own, on ground it stood on to set it.
  stage.updateCharges(mission.charges);
  // The objective is the mission: its whereabouts are the one thing the
  // fog never withholds, as a location-only blip (#1173).
  stage.updateObjectiveMarkers(objectiveMarkers(mission, "tdf"));
  // Units and spawners are both just models on tiles, and a spawner is
  // the mission's objective, so it appears with the force rather than
  // after it (#484).
  await Promise.all([
    stage.update(perceivedUnits(mission, "tdf"), mission.templates),
    stage.updateSpawners(perceivedSpawners(mission, "tdf")),
    stage.updateCarcasses(perceivedCarcasses(mission, "tdf")),
    stage.updateRadar(
      mission.radars.filter((radar) => radar.team === "tdf"),
      radarContacts(mission, "tdf"),
    ),
  ]);
}

/**
 * Points the camera at the force the player just deployed.
 *
 * The middle of the map is the obvious choice and the wrong one: on a
 * large map the two are tens of tiles apart and the squad opens off
 * screen (#538).
 *
 * @param framing - The camera rig to aim.
 * @param mission - The mission being opened.
 */
export function frameMission(
  framing: SceneFraming,
  mission: TacticalState,
): void {
  framing.setBounds({
    x: 0,
    z: 0,
    w: mission.map.width,
    d: mission.map.depth,
  });
  // Levels are half-height layers (ADR 0008); the camera wants world
  // units, and relief is what would otherwise put roofs off the top of
  // the frame at the far end (#828).
  framing.setMapExtent({
    width: mission.map.width,
    depth: mission.map.depth,
    height: mission.map.levels * LAYER_HEIGHT,
  });
  framing.lookAt(missionFocus(mission));
}

/**
 * Puts every unit that walks into view during `events` on the board at
 * the tile its walk started from, so the walk can play (#1116).
 *
 * The scene has no object for an enemy the player has not spotted (ADR
 * 0006 §2.4), and the bug phase is one batch: a bug that started in the
 * dark and ended in view had its moves offered to a queue that found
 * nothing to walk, and then appeared at its destination. An arrival is
 * a unit that
 *
 * ```
 *   moves during the batch            (a UnitMoved of its own)
 *   has no object yet                 (absent from the stage)
 *   and is the player's to see by the end:
 *     in the side's spotted set, or
 *     announced by a UnitSpotted for the player's side, or
 *     shot at by one of the player's units on the way in — an overwatch
 *     kill leaves it dead and unspotted, and still has to be watched
 * ```
 *
 * It is placed at the `from` of its first move; the animation queue
 * walks it from there, and the redraw after the batch finds it standing
 * where the state says (or removes it, if the walk ended in a death).
 * The object exists only for the batch that brings the unit into view:
 * a unit that stays unspotted is never placed.
 *
 * @param stage - The scene to place into.
 * @param mission - The mission as it is after the batch.
 * @param events - The batch that just resolved.
 * @returns The ids placed, for `playAroundRedraw` to phase the batch by.
 */
export async function placeArrivals(
  stage: ArrivalStage,
  mission: TacticalState,
  events: readonly TacticalEvent[],
): Promise<ReadonlySet<UnitId>> {
  const onBoard = new Set(stage.unitIds());
  const known = knownByTheEnd(mission, events);
  const starts = new Map<UnitId, TileCoord>();
  for (const event of events) {
    if (event.type !== UNIT_MOVED) {
      continue;
    }
    const { unitId, from } = event.payload;
    if (!starts.has(unitId) && !onBoard.has(unitId) && known.has(unitId)) {
      starts.set(unitId, from);
    }
  }
  const placed = new Set<UnitId>();
  const loads: Promise<void>[] = [];
  for (const [unitId, from] of starts) {
    const unit = mission.units.find((candidate) => candidate.id === unitId);
    const template =
      unit === undefined ? undefined : mission.templates[unit.templateId];
    if (unit === undefined || template === undefined) {
      continue;
    }
    placed.add(unitId);
    loads.push(stage.arrive(unit, template, from));
  }
  await Promise.all(loads);
  return placed;
}

/**
 * Units the player is entitled to watch by the end of a batch: the
 * side's spotted set, plus anything the batch announced to the player
 * or that the player's own units fired on.
 */
function knownByTheEnd(
  mission: TacticalState,
  events: readonly TacticalEvent[],
): ReadonlySet<UnitId> {
  const known = new Set<UnitId>(mission.vision.tdf?.spotted ?? []);
  const ownUnits = new Set(
    mission.units.filter((unit) => unit.team === "tdf").map((u) => u.id),
  );
  for (const event of events) {
    if (event.type === UNIT_SPOTTED && event.payload.team === "tdf") {
      known.add(event.payload.unitId);
    } else if (
      event.type === ATTACK_RESOLVED &&
      ownUnits.has(event.payload.attackerId)
    ) {
      known.add(event.payload.targetId);
    }
  }
  return known;
}

/**
 * Plays `events` around a redraw, in two phases.
 *
 * ```
 *   enqueue(before) ──► redraw() ──► enqueue(after) ──► resolve
 * ```
 *
 * Spots play last on purpose. The scene draws only what the player
 * perceives, so an enemy coming into view has no object until the redraw
 * has run, and a reveal enqueued with the rest would find nothing to
 * animate (#585). The units `placeArrivals` put on the board ahead of
 * the batch are the exception: their spot plays first and their walk
 * follows (#1116). `phaseEvents` owns which events go in which phase;
 * this owns the fact that there are two.
 *
 * @param queue - The animation queue to play through.
 * @param events - The batch that just resolved.
 * @param redraw - Moves the scene to the new state, between the phases.
 * @param onStart - Hears each event as it begins to play, in order.
 * @param arrivals - Units already placed at the start of their walk.
 */
export function playAroundRedraw(
  queue: PhasedQueue,
  events: readonly TacticalEvent[],
  redraw: () => Promise<void>,
  onStart?: (event: TacticalEvent) => void,
  arrivals: ReadonlySet<UnitId> = new Set(),
): Promise<void> {
  const phases = phaseEvents(events, arrivals);
  return new Promise((resolve) => {
    queue.enqueue(
      phases.before,
      () => {
        // A redraw that rejects must not strand the batch (#1132): the
        // promise here is what releases the player's controls, and an
        // unhandled rejection left them held for a whole CI budget. The
        // failure is logged and the rest of the batch still plays.
        void redraw()
          .catch((error: unknown) => {
            console.error("Tactical redraw failed", error);
          })
          .then(() => {
            queue.enqueue(phases.after, resolve, onStart);
          });
      },
      onStart,
    );
  });
}
