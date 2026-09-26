import { ok } from "../../core/model/result";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { BurrowCommand } from "../model/burrow-command";
import type { BurrowTuning } from "../model/burrow-tuning";
import type { TacticalHandler } from "../model/tactical-handler";
import { UNIT_BURROWED } from "../model/unit-burrowed-event";
import { validateBurrow } from "./burrow-service";

// ===========================================
// Handler
// ===========================================

/**
 * Builds the `Burrow` handler (#1179): a surfaced burrower whose
 * cooldown has run digs back down through its column's ground tile for
 * `tuning.burrowApCost`. From the next vision recompute the other side
 * cannot see it; what it saw last stays in that side's memory, because
 * they watched it go down, but nothing it does underground is ever
 * added. Pure; draws nothing.
 *
 * ```
 *   validateBurrow refuses ──► err (as it says)
 *   otherwise ──► status + burrowed, ap − cost, UnitBurrowed { pos }
 * ```
 *
 * @param tuning - What going down costs, and the cooldown.
 */
export function createBurrowHandler(
  tuning: BurrowTuning,
): TacticalHandler<BurrowCommand> {
  return (mission, command) => {
    const { unitId } = command.payload;
    const checked = validateBurrow(
      mission,
      unitId,
      tuning,
      new TileIndex(mission.map),
    );
    if (!checked.ok) {
      return checked;
    }
    const { unit, tile } = checked.value;
    const pos: TileCoord = { x: tile.x, y: tile.y, z: tile.z };
    return ok({
      state: {
        ...mission,
        units: mission.units.map((candidate) =>
          candidate.id === unitId
            ? {
                ...unit,
                pos,
                status: [...unit.status, "burrowed" as const],
                ap: Math.max(0, unit.ap - tuning.burrowApCost),
              }
            : candidate,
        ),
      },
      events: [{ type: UNIT_BURROWED, payload: { unitId, pos } }],
    });
  };
}
