import type { IntactPodTuning } from "../model/intact-pod-tuning";

// ===========================================
// Intact Pod tuning
// ===========================================

/**
 * The shipped Intact Pod (#1179, campaign arc §6.9). The recovery turn
 * is the crash site's maturity turn, 8: the pod the story wants intact
 * ripens on the same clock as the pod a crash site burns, so the drop
 * comes as it would have matured.
 *
 * At d6 the edges send a wave every second turn from turn 3. A crash
 * site stops after two (turns 3 and 5), because burning the pod ends
 * the pressure. Here the pod has to be held, so one more wave lands on
 * turn 7, the last bug phase before the drop:
 *
 * ```
 *   turn   1   2   3   4   5   6   7   8 │ 9
 *   waves          7       8       8     │ drop: the pod is lifted
 *                  └─ crash site ──┘ └ extra
 * ```
 *
 * One point of armour and a small sight, like a generator. The model
 * is the crash site's spore pod.
 */
export const INTACT_POD_TUNING: IntactPodTuning = {
  recoveryTurn: 8,
  extraWaves: 1,
  pod: {
    name: "Spore pod",
    armor: 1,
    sightRange: 3,
    modelId: "bug.spore-pod",
  },
};
