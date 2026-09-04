import type { Rng } from "../../core/model/rng";
import { PropKindIds } from "../data/props";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { PropKindId } from "../model/prop";
import { isOpenGround } from "../service/draft-queries";

// ===========================================
// Constants
// ===========================================

/** Debris pieces per 100 open columns, inside the blast and outside it. */
const DENSITY = { inside: 14, outside: 3 } as const;

/** What the blast throws about, by how far out it lands. */
const INSIDE: readonly PropKindId[] = [
  PropKindIds.BOULDER,
  PropKindIds.CRATE,
  PropKindIds.BARRIER,
];
const OUTSIDE: readonly PropKindId[] = [
  PropKindIds.BOULDER,
  PropKindIds.SANDBAGS,
];

// ===========================================
// DebrisPass
// ===========================================

/**
 * Scatters wreckage over a crash site. Wreckage is its own job — thrown
 * from an impact, densest in the bowl — so it stays a pass of its own.
 * Since #714 the settlement's prop pass *could* also scatter the biome's
 * vegetation here without demanding buildings, but the two compete for
 * the same open tiles rather than layering; see `createCrashSitePasses`.
 *
 * **Prototype** (GDD §8, M3). Density is heaviest in the bowl and thins
 * outside it, so the debris field reads as thrown from the impact rather
 * than sprinkled over the map.
 *
 * ```
 *   .  .    o .  .      o debris, densest where the ground is lowest
 *   . o  ▂▃o▃▂  o .
 *   .  . o▄o▄ o  . .
 * ```
 */
export class DebrisPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "debris";
  readonly requires: readonly DraftCapability[] = ["heightmap", "elevation"];
  readonly provides: readonly DraftCapability[] = ["props"];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Scatters debris, thickest where the ground was thrown down. */
  run(context: GenerationContext): void {
    const { draft, rng, diagnostics } = context;
    const base = modalLevel(draft);
    let placed = 0;
    for (let z = 0; z < draft.depth; z++) {
      for (let x = 0; x < draft.width; x++) {
        if (!isOpenGround(draft, x, z)) {
          continue;
        }
        const inside = draft.groundLevelAt(x, z) < base;
        const density = inside ? DENSITY.inside : DENSITY.outside;
        if (!rng.chance(density / 100)) {
          continue;
        }
        const kinds = inside ? INSIDE : OUTSIDE;
        draft.addProp(pick(kinds, rng), draft.groundCoord(x, z));
        placed++;
      }
    }
    diagnostics.note(`${placed} pieces of debris`);
  }
}

// ===========================================
// Helpers
// ===========================================

/** The level most of the plat sits on, which the bowl is measured against. */
function modalLevel(draft: MapDraft): number {
  const counts = new Map<number, number>();
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      const level = draft.groundLevelAt(x, z);
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
  }
  let best = 0;
  let level = 0;
  for (const [candidate, count] of counts) {
    if (count > best) {
      best = count;
      level = candidate;
    }
  }
  return level;
}

/** One of the kinds, uniformly. */
function pick(kinds: readonly PropKindId[], rng: Rng): PropKindId {
  return kinds[rng.nextInt(0, kinds.length - 1)] ?? PropKindIds.BOULDER;
}
