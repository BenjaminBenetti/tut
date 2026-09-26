import type { Rng } from "../../../core/model/rng";
import { PropKindIds } from "../../data/props";
import { HookKinds } from "../../model/hook";
import type { MapDraft } from "../../model/map-draft";
import type { PlatformLayout, PlatformPad } from "../../model/platform-layout";
import type { PropKindId, Rotation } from "../../model/prop";
import type { SporePlatformTuning } from "../../model/spore-platform-tuning";
import {
  arcColumns,
  centroid,
  components,
  ribWalls,
  scatterClutter,
} from "./platform-dressing-kit";
import type { PlatformPropStamp } from "./platform-prop-stamp";
import { NEIGHBOURS_4 } from "./platform-raster";

// ===========================================
// Constants
// ===========================================

/** Pods cradled round the docking ring and heaped on pod beds. */
const PODS: readonly PropKindId[] = [
  PropKindIds.INFESTED_EGGS,
  PropKindIds.INFESTED_BROOD,
];

/** Attempts per prop before it is given up. */
const ATTEMPTS = 8;

/** Radians either side of the ring's approach that the cradle leaves open. */
const APPROACH_ARC = 1;

// ===========================================
// Hull dressing
// ===========================================

/**
 * Dresses the hull (#1179) with the infestation kit: spine buttresses
 * in rows beside the spine, a carapace collar and a cradle of pods round
 * the docking ring, gate buttresses at the hatch, pods heaped on every
 * pod bed, low rib walls along raised plates' lips and organic clutter
 * over the rest. Nothing stands on a route, a pad's apron or the dock.
 *
 * ```
 *   ▲ ║ ▲     spine buttresses either side of the spine
 *   ◊◊▤▤▤◊◊   pods behind the ring's collar, open toward the spine
 *   ▤▤▤       rib walls on raised plates' lips
 * ```
 */
export function dressHull(
  stamp: PlatformPropStamp,
  draft: MapDraft,
  layout: PlatformLayout,
  tuning: SporePlatformTuning,
  rng: Rng,
): void {
  buttressSpine(stamp, layout, tuning);
  const ring = layout.pads.find((pad) => pad.kind === HookKinds.DOCKING_RING);
  if (ring !== undefined) cradleRing(stamp, ring, tuning, rng.fork("ring"));
  const exit = layout.pads.find((pad) => pad.kind === HookKinds.PLATFORM_EXIT);
  if (exit !== undefined) gateExit(stamp, exit);
  heapPods(stamp, draft, layout, rng.fork("pods"));
  ribWalls(stamp, draft, layout, tuning, rng.fork("rib-walls"));
  scatterClutter(
    stamp,
    draft,
    layout,
    tuning.clutterPerHundred,
    rng.fork("clutter"),
  );
}

// ===========================================
// Routes and pads
// ===========================================

/** Spine buttresses just outside the spine's band, every `buttressEvery` rows. */
function buttressSpine(
  stamp: PlatformPropStamp,
  layout: PlatformLayout,
  tuning: SporePlatformTuning,
): void {
  const spine = layout.routes.find((route) => route.kind === "spine");
  if (spine === undefined) return;
  const reach = tuning.hull.routeRadius + 1;
  let lastZ = -Infinity;
  for (const column of spine.path) {
    if (column.z - lastZ < tuning.hull.buttressEvery) continue;
    lastZ = column.z;
    for (const [side, rotation] of [
      [-1, 1],
      [1, 3],
    ] as const) {
      for (let out = reach; out <= reach + 1; out++) {
        const at = { x: column.x + side * out, z: column.z };
        if (
          stamp.place(
            PropKindIds.INFESTED_CARAPACE_SPINE_BUTTRESS,
            at,
            rotation,
            false,
          )
        ) {
          break;
        }
      }
    }
  }
}

/**
 * The docking ring's cradle: a carapace collar arcing round the back of
 * the pad, spine buttresses at its ends and pods heaped behind it, all
 * open toward the spine the branch arrives from.
 */
function cradleRing(
  stamp: PlatformPropStamp,
  pad: PlatformPad,
  tuning: SporePlatformTuning,
  rng: Rng,
): void {
  const centre = {
    x: pad.x + pad.size / 2 - 0.5,
    z: pad.z + pad.size / 2 - 0.5,
  };
  // The branch comes in from the spine, on the side away from the flank.
  const approach = pad.meta?.side === "east" ? Math.PI : 0;
  const collar = pad.size / 2 + 2;
  const arc = arcColumns(
    centre,
    collar,
    approach + APPROACH_ARC,
    approach + 2 * Math.PI - APPROACH_ARC,
  );
  stamp.placeWall(arc, rng.fork("collar"));
  for (const end of [arc[0], arc[arc.length - 1]]) {
    if (end === undefined) continue;
    for (const [dx, dz] of NEIGHBOURS_4) {
      if (
        stamp.place(
          PropKindIds.INFESTED_CARAPACE_SPINE_BUTTRESS,
          { x: end.x + dx, z: end.z + dz },
          0,
          false,
        )
      ) {
        break;
      }
    }
  }
  const pods = rng.nextInt(5, 8);
  for (let n = 0; n < pods; n++) {
    const kind = rng.pick(PODS);
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const angle =
        approach + APPROACH_ARC + rng.next() * (2 * Math.PI - 2 * APPROACH_ARC);
      const distance =
        collar + 1.5 + rng.next() * (tuning.hull.ringPlazaRadius - collar);
      // A 2×2 pod is anchored by its lowest corner; centre it on the ring.
      const anchor = {
        x: Math.round(centre.x + Math.cos(angle) * distance - 0.5),
        z: Math.round(centre.z + Math.sin(angle) * distance - 0.5),
      };
      if (stamp.place(kind, anchor, rng.nextInt(0, 3) as Rotation, false))
        break;
    }
  }
}

/** Spine buttresses either side of the hatch, like gate posts, just off the spine. */
function gateExit(stamp: PlatformPropStamp, pad: PlatformPad): void {
  for (const z of [pad.z - 1, pad.z + pad.size]) {
    for (let out = 1; out <= 4; out++) {
      for (const x of [pad.x - out, pad.x + pad.size - 1 + out]) {
        stamp.place(
          PropKindIds.INFESTED_CARAPACE_SPINE_BUTTRESS,
          { x, z },
          0,
          false,
        );
      }
    }
  }
}

// ===========================================
// Pod beds
// ===========================================

/**
 * Pods heaped round every pod bed's rim, leaving its middle for the
 * spawner the hook pass stands there.
 */
function heapPods(
  stamp: PlatformPropStamp,
  draft: MapDraft,
  layout: PlatformLayout,
  rng: Rng,
): void {
  for (const bed of components(draft, layout.podBeds)) {
    const centre = centroid(draft, bed);
    const count = rng.nextInt(2, 4);
    for (let n = 0; n < count; n++) {
      const kind = rng.chance(0.25)
        ? PropKindIds.INFESTED_NEST
        : rng.pick(PODS);
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const angle = rng.next() * 2 * Math.PI;
        const distance = 2.5 + rng.next();
        const anchor = {
          x: Math.round(centre.x + Math.cos(angle) * distance - 0.5),
          z: Math.round(centre.z + Math.sin(angle) * distance - 0.5),
        };
        if (stamp.place(kind, anchor, rng.nextInt(0, 3) as Rotation, true))
          break;
      }
    }
  }
}
