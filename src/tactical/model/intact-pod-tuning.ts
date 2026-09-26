import type { ModelAssetId } from "../../content/data/model-ids";

// ===========================================
// Intact Pod tuning
// ===========================================

/**
 * What Intact Pod (#1179, campaign arc §6.9) adds to its crash site: the
 * pod made a unit of ours to keep alive, the turn the drop ship lifts
 * it, and the edge waves that keep coming until then. The pod's hit
 * points are not here: they are the crash site's pod's, `podHp` of the
 * mission's difficulty in the spawn tuning, so the pod the squad keeps
 * is the pod it would have burned.
 */
export interface IntactPodTuning {
  /**
   * The recovery turn: the drop ship lifts a pod still standing as this
   * turn ends. The recovery objective's `deadlineTurn`.
   */
  readonly recoveryTurn: number;
  /**
   * Edge waves on top of the crash site's `podEdgeWaves`, so the edges
   * keep sending until the drop instead of falling quiet halfway.
   */
  readonly extraWaves: number;
  /** The pod as a unit of ours. */
  readonly pod: IntactPodUnitTuning;
}

/**
 * The spore pod as a `generator`-kind unit of ours (#1179): no weapon,
 * no movement. Organic, so a medkit mends it as a repair kit mends a
 * generator.
 */
export interface IntactPodUnitTuning {
  readonly name: string;
  readonly armor: number;
  /** Small: it lights the crater and no more. */
  readonly sightRange: number;
  readonly modelId: ModelAssetId;
}
