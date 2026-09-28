import type { IntactPodTuning } from "../model/intact-pod-tuning";

// ===========================================
// Intact Pod tuning
// ===========================================

/**
 * The shipped Intact Pod (#1179, campaign arc §6.9), calibrated on the
 * filled Act II force (`docs/design/calibration/C3b-story.md`).
 *
 * At d6 the edges send a wave every second turn from turn 3. A crash
 * site stops after two (turns 3 and 5), because burning the pod ends
 * the pressure. Here the pod has to be held, so two more waves land, on
 * turns 7 and 9, and the drop comes as turn 10 ends, one bug phase
 * after the last of them:
 *
 * ```
 *   turn   1   2   3   4   5   6   7   8   9  10 │ 11
 *   waves          11      12      12      12    │ drop: the pod is lifted
 *                  └─ crash site ──┘ └── extra ──┘
 * ```
 *
 * The pod draws the swarm: every wave surges by half again, rounded up
 * (seven or eight bugs become eleven or twelve), and may stand two
 * steps off its zone to find room, Swarm Tide's own surge. With the
 * crash site's waves and the recovery at turn 8 a new player won 16 of
 * 16; the surge and the two turns more bring it to about three in four
 * (25 of 32 seeds), the Act II target, while the expert wins them all.
 *
 * One point of armour and a small sight, like a generator. The model
 * is the crash site's spore pod.
 */
export const INTACT_POD_TUNING: IntactPodTuning = {
  recoveryTurn: 10,
  extraWaves: 2,
  waveSurge: { sizeScale: 1.5, spillRadius: 2 },
  pod: {
    name: "Spore pod",
    armor: 1,
    sightRange: 3,
    modelId: "bug.spore-pod",
  },
};
