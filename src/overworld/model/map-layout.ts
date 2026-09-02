import type { Vec2 } from "../../core/model/grid";

// ===========================================
// Map layout
// ===========================================

/**
 * Where something sits on the strategic map, in normalised map space.
 * `x` runs west → east and `y` runs north → south, both in `[0, 1]`:
 *
 * ```
 *   (0,0) ┌────────────────────┐ (1,0)
 *         │  ·          ·      │
 *         │      Earth      ·  │
 *         │   ·        ·       │
 *   (0,1) └────────────────────┘ (1,1)
 * ```
 *
 * Presentation only: the simulation never reads it. The overworld screen
 * scales it to whatever surface it draws on.
 */
export type MapLayout = Vec2;
