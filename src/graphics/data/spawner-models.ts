import type { SpawnerModelCatalogue } from "../model/spawner-models";

/**
 * The shipped spawner models. The egg spawner has one look; the spore
 * pod (campaign arc §6.3) splits open over its last turns, so the
 * player sees the clock on the board as well as in the tracker; the
 * hive core (§6.5) shows its broken ribs and torn membrane once it is
 * below half its hit points, so the squad sees the assault working; the
 * platform core (§6.9) is the finale's caged seed, drawn over the 3×3
 * it fills in the middle of its pad; the great pod's core (#1238) is
 * the spore pod's heart grown to fill the 3×3 at the middle of the pod,
 * split open as it ripens and torn once below half its hit points.
 */
export const SPAWNER_MODELS: SpawnerModelCatalogue = {
  "egg-spawner": { standing: "bug.egg-spawner" },
  "spore-pod": { standing: "bug.spore-pod", ripe: "bug.spore-pod-mature" },
  "hive-core": { standing: "bug.hive-core", damaged: "bug.hive-core-damaged" },
  // The Spore Platform's core (#1179): the caged seed on its dais.
  "platform-core": { standing: "prop.platform-core" },
  "great-pod-core": {
    standing: "bug.great-pod-core",
    ripe: "bug.great-pod-core-ripe",
    damaged: "bug.great-pod-core-damaged",
  },
};
