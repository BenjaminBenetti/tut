import type { SpawnerModelCatalogue } from "../model/spawner-models";

/**
 * The shipped spawner models. The egg spawner has one look; the spore
 * pod (campaign arc §6.3) splits open over its last turns, so the
 * player sees the clock on the board as well as in the tracker.
 */
export const SPAWNER_MODELS: SpawnerModelCatalogue = {
  "egg-spawner": { standing: "bug.egg-spawner" },
  "spore-pod": { standing: "bug.spore-pod", ripe: "bug.spore-pod-mature" },
};
