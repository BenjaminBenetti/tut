import type { Rect, Vec3 } from "../../core/model/grid";
import { phaseEvents } from "../../graphics/service/animation-phases";
import { missionFocus } from "../../graphics/service/tactical-framing";
import type { UnitTemplateLookup } from "../../graphics/service/tactical-scene-builder";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { SideVision, Spawner } from "../../tactical/model/tactical-state";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import {
  perceivedSpawners,
  perceivedUnits,
} from "../../tactical/service/vision-service";

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
  /** Draws the map as this side knows it; `undefined` shows all of it. */
  setVision(vision: SideVision | undefined): void;
  /** Places the units that should be on the board, and removes the rest. */
  update(units: readonly Unit[], templates: UnitTemplateLookup): Promise<void>;
  /** Places the egg spawners that should be on the board. */
  updateSpawners(spawners: readonly Spawner[]): Promise<void>;
}

/** What a step needs to point the camera at a mission. */
export interface SceneFraming {
  /** Limits how far the camera may be panned. */
  setBounds(bounds: Rect | undefined): void;
  /** Centres the camera on a world point. */
  lookAt(target: Vec3): void;
}

/** What a step needs to play a batch of events around a redraw. */
export interface PhasedQueue {
  /** Plays the events, then calls `done`. */
  enqueue(events: readonly TacticalEvent[], done: () => void): void;
}

// ===========================================
// Steps
// ===========================================

/**
 * Draws the player's view of `mission`, in the order the view needs.
 *
 * ```
 *   setVision(vision.tdf)                  the map, as this side knows it
 *   then, together:
 *     update(perceivedUnits)               spotted enemies only
 *     updateSpawners(perceivedSpawners)    explored spawners only
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
  stage.setVision(mission.vision.tdf);
  // Units and spawners are both just models on tiles, and a spawner is
  // the mission's objective, so it appears with the force rather than
  // after it (#484).
  await Promise.all([
    stage.update(perceivedUnits(mission, "tdf"), mission.templates),
    stage.updateSpawners(perceivedSpawners(mission, "tdf")),
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
  framing.lookAt(missionFocus(mission));
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
 * animate (#585). `phaseEvents` owns which events go in which phase;
 * this owns the fact that there are two.
 *
 * @param queue - The animation queue to play through.
 * @param events - The batch that just resolved.
 * @param redraw - Moves the scene to the new state, between the phases.
 */
export function playAroundRedraw(
  queue: PhasedQueue,
  events: readonly TacticalEvent[],
  redraw: () => Promise<void>,
): Promise<void> {
  const phases = phaseEvents(events);
  return new Promise((resolve) => {
    queue.enqueue(phases.before, () => {
      void redraw().then(() => {
        queue.enqueue(phases.after, resolve);
      });
    });
  });
}
