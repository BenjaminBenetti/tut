import type { Rect } from "../../../core/model/grid";
import type { Rng } from "../../../core/model/rng";
import { GREAT_POD_TUNING } from "../../data/great-pod-tuning";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../../model/generation-pass";
import type { GreatPodAxis } from "../../model/great-pod-layout";
import type { GreatPodTuning } from "../../model/great-pod-tuning";
import type { MapDraft } from "../../model/map-draft";
import type { ColumnCoord } from "../../model/road";
import { planGreatPod } from "./great-pod-planner";

// ===========================================
// Constants
// ===========================================

/** The id of the site the pod reserves in `draft.sites`. */
export const GREAT_POD_SITE_ID = "great-pod";

// ===========================================
// GreatPodSitePass
// ===========================================

/**
 * Chooses where the great pod came down and makes room for it (#1238).
 * It runs once the drop ship has landed, so the pod is placed from the
 * landing rather than the landing squeezed round the pod:
 *
 * ```
 *   ┌──────── edge the drop ship faces ────────┐
 *   │   [ clearance ]                          │
 *   │        ↓ landingGap                      │
 *   │      ╭─────╮  disc = hull + apron,       │
 *   │      │  ●  │  centred in line with the   │
 *   │      ╰─────╯  landing, ± jitter sideways │
 *   └──────────────────────────────────────────┘
 * ```
 *
 * The disc is levelled to the level most of it already sits on, as the
 * crater pass levels its bowl, so the pod's hull and floor share one
 * level. Columns of the landing's clearance are never touched. The pass
 * records the plan as `draft.greatPod` and reserves the disc's square as
 * a mission site, so the colony plan, its carapace and every scatter
 * leave the pod's ground alone; the pod pass later names the walls it
 * builds as the site's structure, which connectivity repair never cuts.
 */
export class GreatPodSitePass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "great-pod-site";
  readonly requires: readonly DraftCapability[] = [
    "heightmap",
    "water",
    "landing-sites",
  ];
  readonly provides: readonly DraftCapability[] = ["elevation"];

  // ===========================================
  // Construction
  // ===========================================

  /** Lays out pods by `tuning`; First Skyfall's by default. */
  constructor(private readonly tuning: GreatPodTuning = GREAT_POD_TUNING) {}

  // ===========================================
  // Public Methods
  // ===========================================

  /** Picks the centre and axis, levels the disc, records the plan and reserves the site. */
  run(context: GenerationContext): void {
    const { draft, rng, diagnostics } = context;
    const discRadius = this.tuning.hullRadius + this.tuning.apron;
    const axis: GreatPodAxis = rng.chance(0.5) ? "ns" : "ew";
    const centre = pickCentre(draft, discRadius, this.tuning, rng);
    const level = levelDisc(draft, centre, discRadius);
    const layout = planGreatPod(centre, level, axis, this.tuning);
    draft.greatPod = layout;
    draft.sites.push({
      id: GREAT_POD_SITE_ID,
      bounds: squareAround(draft, centre, this.tuning.hullRadius),
      clearance: squareAround(draft, centre, discRadius),
      objectives: [],
      structureIds: [],
      lotIds: [],
    });
    diagnostics.note(
      `great pod at ${centre.x},${centre.z}, axis ${axis}, level ${level}`,
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * The pod's centre: `landingGap` columns beyond the landing's clearance
 * on the side it faces into the map, in line with the landing give or
 * take `jitter`, and kept `edgeMargin` from every edge. A map with no
 * landing takes its middle.
 */
function pickCentre(
  draft: MapDraft,
  discRadius: number,
  tuning: GreatPodTuning,
  rng: Rng,
): ColumnCoord {
  const sideways = rng.nextInt(-tuning.jitter, tuning.jitter);
  const landing = draft.dropships[0];
  const clampX = (x: number): number => clampInto(x, draft.width, discRadius, tuning);
  const clampZ = (z: number): number => clampInto(z, draft.depth, discRadius, tuning);
  if (landing === undefined) {
    return {
      x: clampX(Math.floor(draft.width / 2) + sideways),
      z: clampZ(Math.floor(draft.depth / 2)),
    };
  }
  const { clearance, facing } = landing;
  const middleX = clearance.x + Math.floor(clearance.w / 2);
  const middleZ = clearance.z + Math.floor(clearance.d / 2);
  const reach = tuning.landingGap + discRadius;
  switch (facing) {
    case "n":
      return { x: clampX(middleX + sideways), z: clampZ(clearance.z + clearance.d + reach) };
    case "s":
      return { x: clampX(middleX + sideways), z: clampZ(clearance.z - 1 - reach) };
    case "w":
      return { x: clampX(clearance.x + clearance.w + reach), z: clampZ(middleZ + sideways) };
    case "e":
      return { x: clampX(clearance.x - 1 - reach), z: clampZ(middleZ + sideways) };
  }
}

/** `value` clamped so a disc of `radius` round it keeps `edgeMargin` from both ends of `size`. */
function clampInto(
  value: number,
  size: number,
  radius: number,
  tuning: GreatPodTuning,
): number {
  const low = radius + tuning.edgeMargin;
  const high = Math.max(low, size - 1 - radius - tuning.edgeMargin);
  return Math.min(high, Math.max(low, value));
}

/**
 * Flattens the disc's columns outside the landing's clearance to the
 * level most of them already sit on, and returns that level.
 */
function levelDisc(
  draft: MapDraft,
  centre: ColumnCoord,
  radius: number,
): number {
  const columns: ColumnCoord[] = [];
  for (let z = centre.z - radius; z <= centre.z + radius; z++) {
    for (let x = centre.x - radius; x <= centre.x + radius; x++) {
      if (
        draft.inBounds(x, z) &&
        Math.hypot(x - centre.x, z - centre.z) <= radius + 0.5 &&
        !draft.isLandingReserved(x, z)
      ) {
        columns.push({ x, z });
      }
    }
  }
  const counts = new Map<number, number>();
  for (const { x, z } of columns) {
    const level = draft.groundLevelAt(x, z);
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  let level = draft.groundLevelAt(centre.x, centre.z);
  let best = 0;
  for (const [candidate, count] of counts) {
    if (count > best) {
      best = count;
      level = candidate;
    }
  }
  for (const { x, z } of columns) draft.setGroundLevel(x, z, level);
  return level;
}

/** The square of `radius` round `centre`, clipped to the map. */
function squareAround(
  draft: MapDraft,
  centre: ColumnCoord,
  radius: number,
): Rect {
  const x = Math.max(0, centre.x - radius);
  const z = Math.max(0, centre.z - radius);
  return {
    x,
    z,
    w: Math.min(draft.width - 1, centre.x + radius) - x + 1,
    d: Math.min(draft.depth - 1, centre.z + radius) - z + 1,
  };
}
