import type { ActId } from "../../content/model/act-id";
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
 *
 * A row may narrow itself to one act's offers (`onlyInAct`), so the
 * pressure varies within a type without a table per act: the type's
 * offers made in that act are pressed, and its others play the shared
 * schedule as if the type had no row. A row without it presses every
 * mission of its type, as the defence's and the wreck's do.
 *
 * ```
 *   onlyInAct absent            ──► every mission of the type pressed
 *   onlyInAct = offer's act     ──► pressed
 *   onlyInAct ≠ offer's act, or
 *   the offer carries no act    ──► the shared schedule, untouched
 * ```
 */
export interface EdgeWavePressure {
  /** The size scale (above 1) and the spill every edge wave of the type lands with. */
  readonly surge: EdgeWaveSurge;
  /** Turns sooner than the shared first-wave turn the first wave lands. Zero or more. */
  readonly turnsSooner: number;
  /**
   * The act whose offers alone the press lands on (#1179), matched
   * against the act the offer was made in (`Mission.act`, frozen at
   * offer). Absent, the press lands on every mission of the type.
   */
  readonly onlyInAct?: ActId;
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
  /** Wreck Recovery. */
  readonly wreck: EdgeWavePressure;
  /** Tunnel Sabotage: its Act III offers only (`onlyInAct`). */
  readonly tunnels: EdgeWavePressure;
}
