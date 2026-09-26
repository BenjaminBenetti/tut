import { ok } from "../../../core/model/result";
import type { MissionSetupRule } from "../../model/mission-setup-rule";
import { placeSporePod } from "./spore-pod-setup";

// ===========================================
// Rule
// ===========================================

/**
 * `crash-site` (campaign arc §6.3): wreck the spore pod before it
 * matures at the end of turn 8, then board the drop ship, as a clearance
 * extracts. The pod and its clock are the pressure, so the edges send
 * only `spawnTuning.podEdgeWaves` waves and fall quiet; a pod left to
 * mature bursts on turn 9 all the same.
 *
 * ```
 *   map.hooks.objectives (spore-pod) ──► placeSporePod: the pod + destroy-pod,
 *                                        deadlineTurn = podMaturityTurn (8)
 *   edgeSpawn.totalWaves = podEdgeWaves (2: turns 3 and 7)
 * ```
 */
export const CRASH_SITE_SETUP: MissionSetupRule = {
  typeId: "crash-site",
  /** The pod, its objective on the clock, and a short run of edge waves. */
  setup(state, map, mission, deps) {
    const podded = placeSporePod(state, map, mission, deps);
    return ok({
      ...podded,
      edgeSpawn: {
        ...podded.edgeSpawn,
        totalWaves: deps.spawnTuning.podEdgeWaves,
      },
    });
  },
};
