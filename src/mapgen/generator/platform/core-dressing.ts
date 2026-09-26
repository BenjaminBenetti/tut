import type { Rng } from "../../../core/model/rng";
import { PropKindIds } from "../../data/props";
import { SurfaceIds } from "../../data/surfaces";
import { HookKinds } from "../../model/hook";
import type { MapDraft } from "../../model/map-draft";
import type { PlatformLayout, PlatformPad } from "../../model/platform-layout";
import type { Rotation } from "../../model/prop";
import type { SporePlatformTuning } from "../../model/spore-platform-tuning";
import { components, ribWalls, scatterClutter } from "./platform-dressing-kit";
import type { PlatformPropStamp } from "./platform-prop-stamp";
import { NEIGHBOURS_4 } from "./platform-raster";

// ===========================================
// Constants
// ===========================================

/** The core chamber is sparser than the hull: its cover is the terraces. */
const CLUTTER_SHARE = 0.5;

/** Flesh ribs laid along the arteries, per artery column. */
const ARTERY_RIB_SHARE = 0.12;

// ===========================================
// Core dressing
// ===========================================

/**
 * Dresses the core chamber (#1179) with the carapace kit: the chamber's
 * wall of ribbed carapace round its rim, spine buttresses flanking every
 * wall niche, a rib cage of buttresses round the back and sides of the
 * core seed, low rib walls along the terrace lips, flesh ribs along the
 * arteries and sparse clutter. The gate, lane, walkway, ducts, dais,
 * guard posts and niches stay clear.
 *
 * ```
 *   ▤▤▤▲[pod]▲▤▤▤    rim wall, buttresses either side of each niche
 *        ▲ ▲ ▲       rib cage round the core's back and sides
 *        ▲ C ▲
 *        ░ S ░       dais in front, open
 * ```
 */
export function dressCore(
  stamp: PlatformPropStamp,
  draft: MapDraft,
  layout: PlatformLayout,
  tuning: SporePlatformTuning,
  rng: Rng,
): void {
  flankNiches(stamp, draft, layout);
  wallRim(stamp, draft, layout, rng.fork("rim"));
  const core = layout.pads.find((pad) => pad.kind === HookKinds.PLATFORM_CORE);
  if (core !== undefined) cageCore(stamp, core);
  ribWalls(stamp, draft, layout, tuning, rng.fork("rib-walls"));
  ribArteries(stamp, draft, layout, rng.fork("arteries"));
  scatterClutter(
    stamp,
    draft,
    layout,
    tuning.clutterPerHundred * CLUTTER_SHARE,
    rng.fork("clutter"),
  );
}

// ===========================================
// Rim
// ===========================================

/** Rim columns of the chamber: inside it, with void among their eight neighbours. */
function rimColumns(draft: MapDraft, layout: PlatformLayout): Uint8Array {
  const rim = new Uint8Array(draft.width * draft.depth);
  const chamber = layout.chamber;
  if (chamber === undefined) return rim;
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      const i = z * draft.width + x;
      if (chamber[i] !== 1) continue;
      let open = false;
      for (let dz = -1; dz <= 1 && !open; dz++) {
        for (let dx = -1; dx <= 1 && !open; dx++) {
          if (!draft.inBounds(x + dx, z + dz)) continue;
          open = layout.deck[(z + dz) * draft.width + x + dx] !== 1;
        }
      }
      if (open) rim[i] = 1;
    }
  }
  return rim;
}

/** A tall spine buttress on each rim column beside a wall niche. */
function flankNiches(
  stamp: PlatformPropStamp,
  draft: MapDraft,
  layout: PlatformLayout,
): void {
  const rim = rimColumns(draft, layout);
  for (let i = 0; i < layout.podBeds.length; i++) {
    if (layout.podBeds[i] !== 1) continue;
    const x = i % draft.width;
    const z = Math.floor(i / draft.width);
    for (const [dx, dz] of NEIGHBOURS_4) {
      if (!draft.inBounds(x + dx, z + dz)) continue;
      if (rim[(z + dz) * draft.width + x + dx] !== 1) continue;
      stamp.place(
        PropKindIds.INFESTED_CARAPACE_SPINE_BUTTRESS,
        { x: x + dx, z: z + dz },
        0,
        false,
      );
    }
  }
}

/**
 * The chamber's wall: every free rim column, grouped into the arcs the
 * gate, the ducts and the niches break it into, each joined into
 * carapace pieces by the kit's joiner.
 */
function wallRim(
  stamp: PlatformPropStamp,
  draft: MapDraft,
  layout: PlatformLayout,
  rng: Rng,
): void {
  const rim = rimColumns(draft, layout);
  for (let i = 0; i < rim.length; i++) {
    if (
      rim[i] === 1 &&
      !stamp.free(i % draft.width, Math.floor(i / draft.width))
    ) {
      rim[i] = 0;
    }
  }
  components(draft, rim).forEach((arc, n) => {
    stamp.placeWall(
      arc.map((i) => ({ x: i % draft.width, z: Math.floor(i / draft.width) })),
      rng.fork(`arc-${String(n)}`),
    );
  });
}

// ===========================================
// Core
// ===========================================

/**
 * The seed's rib cage: spine buttresses on every other column of the
 * ring just outside the core pad's apron, down its sides and across its
 * back; the front toward the dais stays open.
 */
function cageCore(stamp: PlatformPropStamp, pad: PlatformPad): void {
  const x0 = pad.x - 2;
  const x1 = pad.x + pad.size + 1;
  const z1 = pad.z + pad.size + 1;
  for (let z = pad.z; z <= z1; z += 2) {
    stamp.place(
      PropKindIds.INFESTED_CARAPACE_SPINE_BUTTRESS,
      { x: x0, z },
      1,
      false,
    );
    stamp.place(
      PropKindIds.INFESTED_CARAPACE_SPINE_BUTTRESS,
      { x: x1, z },
      3,
      false,
    );
  }
  for (let x = x0 + 2; x < x1; x += 2) {
    stamp.place(
      PropKindIds.INFESTED_CARAPACE_SPINE_BUTTRESS,
      { x, z: z1 },
      2,
      false,
    );
  }
}

/** Flesh ribs lying along the arteries' infested spokes. */
function ribArteries(
  stamp: PlatformPropStamp,
  draft: MapDraft,
  layout: PlatformLayout,
  rng: Rng,
): void {
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      const i = z * draft.width + x;
      if (layout.chamber?.[i] !== 1 || layout.podBeds[i] === 1) continue;
      if (draft.groundSurfaceAt(x, z) !== SurfaceIds.INFESTED) continue;
      if (!rng.chance(ARTERY_RIB_SHARE)) continue;
      stamp.place(
        PropKindIds.INFESTED_RIBS,
        { x, z },
        rng.nextInt(0, 3) as Rotation,
        true,
      );
    }
  }
}
