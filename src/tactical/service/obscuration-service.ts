import type { GridPos } from "../../core/model/grid";
import type { TacticalState } from "../model/tactical-state";
import type { TileEffect } from "../model/tile-effect";

/** Smoke blocks a sight segment beyond adjacent contact, including its end points. */
export function smokeBlocksSight(
  mission: TacticalState,
  from: GridPos,
  to: GridPos,
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.abs(dx) + Math.abs(dz) <= 1) return false;
  const steps = Math.max(Math.abs(dx), Math.abs(dz));
  const fromY = "y" in from && typeof from.y === "number" ? from.y : 0;
  const toY = "y" in to && typeof to.y === "number" ? to.y : 0;
  const smoke = mission.effects.filter(isActiveSmoke);
  if (smoke.length === 0) return false;
  for (let step = 0; step <= steps; step++) {
    const fraction = steps === 0 ? 0 : step / steps;
    const x = Math.round(from.x + dx * fraction);
    const z = Math.round(from.z + dz * fraction);
    const y = Math.round(fromY + (toY - fromY) * fraction);
    if (
      smoke.some(
        (effect) =>
          effect.tile.x === x && effect.tile.z === z && effect.tile.y === y,
      )
    )
      return true;
  }
  return false;
}

/**
 * Whether any smoke still hangs over the mission (#1179). Without it
 * `smokeBlocksSight` is false for every line, so a caller asking about
 * many lines at once — a whole side's vision — can skip the question.
 */
export function hasActiveSmoke(mission: TacticalState): boolean {
  return mission.effects.some(isActiveSmoke);
}

/** Smoke that has phases left to hang: the only effect that blocks sight. */
function isActiveSmoke(effect: TileEffect): boolean {
  return effect.kind === "smoke" && effect.phasesLeft > 0;
}
