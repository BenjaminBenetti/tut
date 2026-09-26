import type { SpawnerModelCatalogue } from "../model/spawner-models";

/**
 * The shipped spawner models. The egg spawner has one look; the spore
 * pod (campaign arc §6.3) splits open over its last turns, so the
 * player sees the clock on the board as well as in the tracker; the
 * hive core (§6.5) shows its broken ribs and torn membrane once it is
 * below half its hit points, so the squad sees the assault working.
 */
export const SPAWNER_MODELS: SpawnerModelCatalogue = {
  "egg-spawner": { standing: "bug.egg-spawner" },
  "spore-pod": { standing: "bug.spore-pod", ripe: "bug.spore-pod-mature" },
  "hive-core": { standing: "bug.hive-core", damaged: "bug.hive-core-damaged" },
};
