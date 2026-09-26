import type { CavernChamber, CavernLayout } from "../../model/cavern-layout";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../../model/generation-pass";
import { HookKinds } from "../../model/hook";
import type { MapDraft } from "../../model/map-draft";
import { PassMask } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import { nearCorePad } from "../../service/cavern-queries";
import { isOpenGround } from "../../service/draft-queries";
import { hookTileKeys } from "../placer/placer-support";

// ===========================================
// Constants
// ===========================================

/** Columns kept between a brood hook and the hive core's pad. */
const CORE_PAD_RING = 1;

// ===========================================
// BroodChamberPass
// ===========================================

/**
 * Marks every chamber of a hive cavern but the mouth with one
 * `brood-chamber` hook (#1179): the open floor tile nearest the
 * chamber's centre that no other hook holds. Tactical wakes dormant
 * broods there; the meta says which chamber and how big it is.
 *
 * ```
 *   meta { chamberId: "chamber-2", role: "route", radius: 10, depth: 2 }
 *          role: "route" | "side" | "core";  depth: tunnels from the mouth
 * ```
 *
 * Not a hook placer: the count is the seed's chamber count, which no
 * recipe can know, so the recipe never requests the kind and I8 never
 * counts it. Every hook is `PassMask.ALL`, so the connectivity pass after
 * this one guarantees a mech can reach each chamber (I7).
 */
export class BroodChamberPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "brood-chambers";
  readonly requires: readonly DraftCapability[] = ["cavern", "hooks"];
  readonly provides: readonly DraftCapability[] = [];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds one brood-chamber hook per chamber other than the mouth. */
  run(context: GenerationContext): void {
    const { draft, diagnostics } = context;
    const layout = draft.cavern;
    if (layout === undefined) {
      diagnostics.note("no cavern layout: brood chambers skipped");
      return;
    }
    const taken = hookTileKeys(draft);
    let placed = 0;
    for (const chamber of layout.chambers) {
      if (chamber.role === "mouth") continue;
      const tile = broodTile(draft, layout, chamber, taken);
      if (tile === undefined) {
        diagnostics.note(`${chamber.id} has no free floor for its brood`);
        continue;
      }
      taken.add(draft.tileKey(tile));
      draft.addHook(
        "objectives",
        HookKinds.BROOD_CHAMBER,
        [tile],
        PassMask.ALL,
        {
          chamberId: chamber.id,
          role: chamber.role,
          radius: chamber.radius,
          depth: chamber.depth,
        },
      );
      placed++;
    }
    diagnostics.note(`${String(placed)} brood chambers`);
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * The chamber's free open floor tile nearest its centre, off the core
 * pad and its ring; scan order breaks ties.
 */
function broodTile(
  draft: MapDraft,
  layout: CavernLayout,
  chamber: CavernChamber,
  taken: ReadonlySet<number>,
): TileCoord | undefined {
  let best: TileCoord | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (layout.chamberOf[z * draft.width + x] !== chamber.index) continue;
      if (!isOpenGround(draft, x, z)) continue;
      if (nearCorePad(draft, x, z, CORE_PAD_RING)) continue;
      const tile = draft.groundCoord(x, z);
      if (taken.has(draft.tileKey(tile))) continue;
      const dx = x - chamber.centre.x;
      const dz = z - chamber.centre.z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = tile;
      }
    }
  }
  return best;
}
