import { ok } from "../../../core/model/result";
import type { CrashSiteSetupTuning } from "../../model/crash-site-setup-tuning";
import type { MissionSetupRule } from "../../model/mission-setup-rule";
import type { SpawnTuning } from "../../model/spawn-tuning";
import type { TacticalState } from "../../model/tactical-state";
import { placeSporePod } from "./spore-pod-setup";

// ===========================================
// Rule
// ===========================================

/**
 * `crash-site` (campaign arc §6.3): wreck the spore pod before it
 * matures, then board the drop ship, as a clearance extracts. The pod
 * and its clock are the pressure, so the edges send only
 * `spawnTuning.podEdgeWaves` waves and fall quiet; a pod left to mature
 * bursts the turn after its deadline all the same.
 *
 * ```
 *   map.hooks.objectives (spore-pod) ──► placeSporePod: the pod + destroy-pod
 *   destroy-pod.deadlineTurn = crashPodMaturityTurn(difficulty)
 *                              (8; 5 from d5 with the shipped crashSite tuning)
 *   edgeSpawn.totalWaves = podEdgeWaves (2: turns 3 and 7)
 * ```
 */
export const CRASH_SITE_SETUP: MissionSetupRule = {
  typeId: "crash-site",
  /** The pod, its objective on the landing's clock, and a short run of edge waves. */
  setup(state, map, mission, deps) {
    const podded = placeSporePod(state, map, mission, deps);
    const deadline = crashPodMaturityTurn(
      mission.difficulty,
      deps.spawnTuning,
      deps.crashSite,
    );
    return ok({
      ...withPodDeadline(podded, deadline),
      edgeSpawn: {
        ...podded.edgeSpawn,
        totalWaves: deps.spawnTuning.podEdgeWaves,
      },
    });
  },
};

// ===========================================
// Clock
// ===========================================

/**
 * The turn whose end ripens a crash site's pod at `difficulty`: the
 * shared `podMaturityTurn`, or the crash site's own earlier turn from
 * its early difficulty on. The briefing reads it too, so the offer and
 * the mission tell the same clock.
 *
 * ```
 *   no crash tuning, or difficulty < earlyMaturityFromDifficulty ──► podMaturityTurn
 *   otherwise                                                    ──► earlyMaturityTurn
 * ```
 *
 * @param difficulty - The offer's difficulty.
 * @param spawnTuning - The shared pod clock.
 * @param crash - The crash site's own clock; absent, the shared one alone.
 */
export function crashPodMaturityTurn(
  difficulty: number,
  spawnTuning: Pick<SpawnTuning, "podMaturityTurn">,
  crash: CrashSiteSetupTuning | undefined,
): number {
  if (crash === undefined || difficulty < crash.earlyMaturityFromDifficulty) {
    return spawnTuning.podMaturityTurn;
  }
  return Math.min(crash.earlyMaturityTurn, spawnTuning.podMaturityTurn);
}

// ===========================================
// Helpers
// ===========================================

/** `state` with every destroy-pod objective due at the end of `deadline`. */
function withPodDeadline(
  state: TacticalState,
  deadline: number,
): TacticalState {
  return {
    ...state,
    objectives: state.objectives.map((objective) =>
      objective.kind === "destroy-pod"
        ? { ...objective, deadlineTurn: deadline }
        : objective,
    ),
  };
}
