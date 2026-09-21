import type { GenerationContext } from "../../model/generation-pass";
import type { HookRequirement } from "../../model/map-recipe";
import { isPassableGround } from "../../service/draft-queries";
import { distanceToDeploy, hookTileKeys } from "./placer-support";

// ===========================================
// Authored objective sockets
// ===========================================

/**
 * Claims site sockets before the ordinary placer fills any remainder. The
 * recipe supplies count, pass mask and metadata, so a site never silently
 * changes the mission rules. Connectivity repairs routes after all hooks.
 */
export function placeSiteObjectives(
  requirement: HookRequirement,
  { draft }: GenerationContext,
): number {
  const taken = hookTileKeys(draft);
  let placed = 0;
  for (const socket of draft.sites.flatMap((site) => site.objectives)) {
    if (placed >= requirement.count) break;
    const tile = draft.groundCoord(socket.tile.x, socket.tile.z);
    if (
      socket.kind !== requirement.kind ||
      taken.has(draft.tileKey(tile)) ||
      !isPassableGround(draft, tile.x, tile.z) ||
      distanceToDeploy(draft, tile) < (requirement.minDistanceFromDeploy ?? 0)
    )
      continue;
    draft.addHook(
      "objectives",
      requirement.kind,
      [tile],
      requirement.requiredPass,
      requirement.meta,
    );
    taken.add(draft.tileKey(tile));
    placed++;
  }
  return placed;
}
