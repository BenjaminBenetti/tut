import { ok } from "../../../core/model/result";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type {
  MissionSetupDeps,
  MissionSetupRule,
} from "../../model/mission-setup-rule";
import type {
  SealTunnelsObjective,
  TacticalState,
} from "../../model/tactical-state";
import { OBJECTIVE_ID_PREFIX } from "../../model/tactical-state";
import type { TunnelMouth } from "../../model/tunnel-mouth";
import { TUNNEL_MOUTH_ID_PREFIX } from "../../model/tunnel-mouth";
import { coordOf, middleOf } from "./map-placement";

// ===========================================
// The mouths
// ===========================================

/**
 * Opens a tunnel mouth on every `tunnel-mouth` hook of the map and adds
 * the one `seal-tunnels` objective naming them (campaign arc §6.7),
 * appended to whatever the mission already has.
 *
 * ```
 *   tunnel-mouth hooks, in hook order ──► TunnelMouth each, open   ids: tunnel-*
 *     tiles in hook order, pos the middle tile
 *   one seal-tunnels objective        ──► mouthIds, in hook order  ids: objective-*
 *   no tunnel-mouth hook              ──► the mission as it was
 * ```
 *
 * The map rule asks for three; the setup seals whatever the map laid,
 * so a board too small for three still plays, with the tracker counting
 * the mouths it has.
 *
 * @param state - The mission so far.
 * @param map - The generated map whose tunnel-mouth hooks the mouths open on.
 * @param deps - Ids.
 */
export function openTunnelMouths(
  state: TacticalState,
  map: TacticalMap,
  deps: Pick<MissionSetupDeps, "ids">,
): TacticalState {
  const mouths: TunnelMouth[] = map.hooks.objectives
    .filter((hook) => hook.kind === HookKinds.TUNNEL_MOUTH)
    .flatMap((hook) => {
      const first = hook.tiles[0];
      if (first === undefined) {
        return [];
      }
      const tiles = hook.tiles.map(coordOf);
      return [
        {
          id: deps.ids.nextId(TUNNEL_MOUTH_ID_PREFIX),
          pos: middleOf(tiles, coordOf(first)),
          tiles,
        },
      ];
    });
  if (mouths.length === 0) {
    return state;
  }
  const objective: SealTunnelsObjective = {
    id: deps.ids.nextId(OBJECTIVE_ID_PREFIX),
    kind: "seal-tunnels",
    mouthIds: mouths.map((mouth) => mouth.id),
    complete: false,
  };
  return {
    ...state,
    tunnelMouths: [...(state.tunnelMouths ?? []), ...mouths],
    objectives: [...state.objectives, objective],
  };
}

// ===========================================
// Rule
// ===========================================

/**
 * `tunnel-sabotage` (campaign arc §6.7): seal the three tunnel mouths,
 * then extract. The map has no egg spawners — the pressure is the edge
 * waves and the burrowers the open mouths surface — so the setup only
 * opens the mouths and names them in the objective.
 *
 * ```
 *   tunnel-mouth hooks ──► mouths + seal-tunnels   ids: tunnel-*, objective-*
 * ```
 */
export const TUNNEL_SABOTAGE_SETUP: MissionSetupRule = {
  typeId: "tunnel-sabotage",
  /** The mouths and their objective. */
  setup(state, map, _mission, deps) {
    return ok(openTunnelMouths(state, map, deps));
  },
};
