import type { HookKind } from "../model/hook";
import type { MapDraft } from "../model/map-draft";
import type { PlatformPad } from "../model/platform-layout";
import type { TileCoord } from "../model/tile-coord";

// ===========================================
// Platform queries
// ===========================================

/**
 * Where a spore platform's spawner pods may stand (#1179): the hull's
 * pod beds and the core chamber's wall niches. Egg spawners are kept to
 * them so pods cluster where the dressing cradles them. Every tile
 * qualifies on a draft that is not a spore platform.
 */
export function isPodBed(draft: MapDraft, coord: TileCoord): boolean {
  const layout = draft.platform;
  if (layout === undefined) return true;
  if (!draft.inBounds(coord.x, coord.z)) return false;
  return layout.podBeds[coord.z * draft.width + coord.x] === 1;
}

/** The pads a spore platform planned for a hook kind, in plan order; none elsewhere. */
export function platformPads(
  draft: MapDraft,
  kind: HookKind,
): readonly PlatformPad[] {
  return draft.platform?.pads.filter((pad) => pad.kind === kind) ?? [];
}
