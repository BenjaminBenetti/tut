import { ok } from "../../core/model/result";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalHandler } from "../model/tactical-handler";
import type { TunnelCommand } from "../model/tunnel-command";
import { UNIT_TUNNELLED } from "../model/unit-tunnelled-event";
import { validateTunnel } from "./burrow-service";

// ===========================================
// Handler
// ===========================================

/**
 * Applies a `Tunnel` (#1179): the burrowed unit moves under the ground
 * to the checked ground tile in one go and pays for the columns crossed
 * (`validateTunnel`). No step reaction runs — nothing on the surface can
 * see, shoot or burn what is under it — and the one event is a
 * `UnitTunnelled`, never a `UnitMoved`, so the scene neither walks nor
 * places it. Its facing is left alone; it turns when it comes up. Pure;
 * draws nothing.
 *
 * ```
 *   validateTunnel refuses ──► err (as it says)
 *   otherwise ──► pos = to, ap − apCost, UnitTunnelled { from, to }
 * ```
 */
export const tunnelHandler: TacticalHandler<TunnelCommand> = (
  mission,
  command,
) => {
  const { unitId, to } = command.payload;
  const checked = validateTunnel(
    mission,
    unitId,
    to,
    new TileIndex(mission.map),
  );
  if (!checked.ok) {
    return checked;
  }
  const { unit, apCost } = checked.value;
  const end: TileCoord = {
    x: checked.value.to.x,
    y: checked.value.to.y,
    z: checked.value.to.z,
  };
  return ok({
    state: {
      ...mission,
      units: mission.units.map((candidate) =>
        candidate.id === unitId
          ? { ...candidate, pos: end, ap: Math.max(0, candidate.ap - apCost) }
          : candidate,
      ),
    },
    events: [
      { type: UNIT_TUNNELLED, payload: { unitId, from: unit.pos, to: end } },
    ],
  });
};
