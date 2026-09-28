import type { EdgeWaveSurge } from "./tactical-state";

// ===========================================
// Edge wave pressure
// ===========================================

/**
 * How much harder than the shared schedule a mission type's edge waves
 * press (#1179): every wave larger, and the first sooner. The shared
 * wave size and interval (`SpawnTuning`) stay every type's; a type
 * listed in `WavePressureTuning` has its setup set this on top.
 *
 * ```
 *   the type's setup ──► edgeSpawn.surge    ← surge
 *                        every wave ⌈size × sizeScale⌉, standing up to
 *                        spillRadius steps past its edge zone
 *                    ──► edgeSpawn.nextTurn ← max(FIRST_TURN, nextTurn − turnsSooner)
 * ```
 *
 * The same surge Swarm Tide sets; the tide on top keeps the larger of
 * each of its size scale and spill, never less.
 */
export interface EdgeWavePressure {
  /** The size scale (above 1) and the spill every edge wave of the type lands with. */
  readonly surge: EdgeWaveSurge;
  /** Turns sooner than the shared first-wave turn the first wave lands. Zero or more. */
  readonly turnsSooner: number;
}

/**
 * The edge wave pressure of the mission types whose objective the
 * shared waves did not press hard enough (#1179): the ones whose force
 * wins by holding or reaching something while the waves come in.
 * Defaults live in `tactical/data/wave-pressure-tuning.ts`; the setup
 * table binds each to its type.
 */
export interface WavePressureTuning {
  /** Defend Installation, and the story defences on it (Uplink, Launch Window). */
  readonly defence: EdgeWavePressure;
  /** Tunnel Sabotage. */
  readonly tunnel: EdgeWavePressure;
  /** Wreck Recovery. */
  readonly wreck: EdgeWavePressure;
}
