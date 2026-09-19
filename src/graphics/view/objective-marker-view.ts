import { Group } from "three";
import type { ObjectiveMarker } from "../../tactical/model/objective-marker";
import type { Disposable } from "../model/disposable";
import { IntelBlipPainter, OBJECTIVE_BLIP_COLOUR } from "./intel-blip-painter";

// ===========================================
// Constants
// ===========================================

/** Scene-graph name of the layer, for tests and inspection. */
export const OBJECTIVE_MARKERS_NAME = "objective-markers";

/** Scene-graph name of one marker blip; the objective id follows it. */
export const OBJECTIVE_MARKER_PREFIX = "objective-marker-";

// ===========================================
// Objective marker view
// ===========================================

/**
 * White diamond blips over the objectives the player cannot see (#1173):
 * the radar's structure mark in white, drawn above fog and roofs, so
 * the eggs are always on the map even before the squad has been near
 * them. Observes state only: what to mark is `objectiveMarkers`'s
 * answer, redrawn in full on every update.
 *
 * ```
 *   updateMarkers(markers) ──► layer cleared, one ◈ per marker
 * ```
 */
export class ObjectiveMarkerView implements Disposable {
  // ===========================================
  // Fields
  // ===========================================

  readonly root = new Group();
  private readonly painter = new IntelBlipPainter(OBJECTIVE_BLIP_COLOUR);

  // ===========================================
  // Constructor
  // ===========================================

  /** Creates an empty layer. */
  constructor() {
    this.root.name = OBJECTIVE_MARKERS_NAME;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Blips actually placed, for the scene's diagnostic readout. */
  count(): number {
    return this.root.children.length;
  }

  /**
   * Redraws the layer from `markers`; a nest that came into view or
   * fell simply stops being asked for.
   *
   * @param markers - Where every fogged, open objective stands.
   */
  updateMarkers(markers: readonly ObjectiveMarker[]): void {
    this.root.clear();
    for (const marker of markers) {
      this.root.add(
        this.painter.paint(
          marker.pos,
          "diamond",
          `${OBJECTIVE_MARKER_PREFIX}${marker.objectiveId}`,
        ),
      );
    }
  }

  /** Frees the shared blip geometry and material and detaches the layer. */
  dispose(): void {
    this.root.clear();
    this.root.removeFromParent();
    this.painter.dispose();
  }
}
