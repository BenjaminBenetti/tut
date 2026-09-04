import type { Camera } from "three";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { SpawnerId } from "../../tactical/model/tactical-state";

/**
 * Hit-tests and highlights egg spawners (#484). Separate from
 * `UnitPicker` rather than folded into it: spawners are not units, they
 * live in their own collection on the mission state, and a client that
 * only cares about units should not have to know they exist (interface
 * segregation). The tactical scene builder implements both.
 */
export interface SpawnerPicker {
  /** The spawner under a normalised device coordinate, or undefined. */
  pickSpawner(ndc: Vec2, camera: Camera): SpawnerId | undefined;

  /** Highlights one spawner as hovered, or none. */
  setHoveredSpawner(spawnerId: SpawnerId | undefined): void;

  /** Marks one spawner as targeted, or none. */
  setSelectedSpawner(spawnerId: SpawnerId | undefined): void;

  /** A world point at a spawner's base, or undefined for an unknown one. */
  spawnerWorldPosition(spawnerId: SpawnerId): Vec3 | undefined;
}
