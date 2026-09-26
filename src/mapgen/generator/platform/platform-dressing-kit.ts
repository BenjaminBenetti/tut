import type { Rng } from "../../../core/model/rng";
import { PropKindIds } from "../../data/props";
import type { MapDraft } from "../../model/map-draft";
import type { PlatformLayout } from "../../model/platform-layout";
import type { PropKindId, Rotation } from "../../model/prop";
import type { ColumnCoord } from "../../model/road";
import type { SporePlatformTuning } from "../../model/spore-platform-tuning";
import type { PlatformPropStamp } from "./platform-prop-stamp";
import { NEIGHBOURS_4 } from "./platform-raster";

// ===========================================
// Constants
// ===========================================

/** Organic clutter scattered over the plates, by weight. */
export const PLATFORM_CLUTTER: readonly { kind: PropKindId; weight: number }[] =
  [
    { kind: PropKindIds.INFESTED_SPINES, weight: 3 },
    { kind: PropKindIds.INFESTED_VENT, weight: 2 },
    { kind: PropKindIds.INFESTED_RIBS, weight: 2 },
    { kind: PropKindIds.INFESTED_RUBBLE, weight: 1 },
    { kind: PropKindIds.INFESTED_NEST, weight: 1 },
  ];

/** Attempts per prop before it is given up. */
const ATTEMPTS = 8;

// ===========================================
// Shared dressing
// ===========================================

/**
 * Low rib walls: short carapace runs along the lips of raised plates,
 * cover at the terrace edges, `ribWallsPerThousand` per thousand deck
 * columns.
 */
export function ribWalls(
  stamp: PlatformPropStamp,
  draft: MapDraft,
  layout: PlatformLayout,
  tuning: SporePlatformTuning,
  rng: Rng,
): void {
  const lips = lipColumns(stamp, draft, layout);
  if (lips.length === 0) return;
  const onLip = new Set(lips);
  const used = new Set<number>();
  let deck = 0;
  for (const value of layout.deck) deck += value;
  const runs = Math.round((deck * tuning.ribWallsPerThousand) / 1000);
  for (let n = 0; n < runs; n++) {
    const start = rng.pick(lips);
    if (used.has(start)) continue;
    const length = rng.nextInt(
      tuning.ribWallLength.min,
      tuning.ribWallLength.max,
    );
    const run = growRun(draft, start, length, onLip, used);
    if (run.length < 2) continue;
    for (const i of run) used.add(i);
    stamp.placeWall(
      run.map((i) => ({ x: i % draft.width, z: Math.floor(i / draft.width) })),
      rng.fork(`run-${String(n)}`),
    );
  }
}

/** Organic clutter over free deck, `perHundred` per hundred deck columns. */
export function scatterClutter(
  stamp: PlatformPropStamp,
  draft: MapDraft,
  layout: PlatformLayout,
  perHundred: number,
  rng: Rng,
): void {
  const deck: number[] = [];
  for (let i = 0; i < layout.deck.length; i++) {
    if (layout.deck[i] === 1) deck.push(i);
  }
  if (deck.length === 0) return;
  const count = Math.round((deck.length * perHundred) / 100);
  for (let n = 0; n < count; n++) {
    const kind = rng.pickWeighted(PLATFORM_CLUTTER, (k) => k.weight).kind;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const i = rng.pick(deck);
      const anchor = { x: i % draft.width, z: Math.floor(i / draft.width) };
      if (stamp.place(kind, anchor, rng.nextInt(0, 3) as Rotation, true)) break;
    }
  }
}

// ===========================================
// Helpers
// ===========================================

/** Free deck columns with a lower deck column beside them. */
function lipColumns(
  stamp: PlatformPropStamp,
  draft: MapDraft,
  layout: PlatformLayout,
): number[] {
  const lips: number[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (!stamp.free(x, z)) continue;
      const level = draft.groundLevelAt(x, z);
      const lower = NEIGHBOURS_4.some(
        ([dx, dz]) =>
          draft.inBounds(x + dx, z + dz) &&
          layout.deck[(z + dz) * draft.width + x + dx] === 1 &&
          draft.groundLevelAt(x + dx, z + dz) < level,
      );
      if (lower) lips.push(z * draft.width + x);
    }
  }
  return lips;
}

/** Walks the lip from `start` for up to `length` level columns. */
function growRun(
  draft: MapDraft,
  start: number,
  length: number,
  onLip: ReadonlySet<number>,
  used: ReadonlySet<number>,
): number[] {
  const level = draft.groundLevelAt(
    start % draft.width,
    Math.floor(start / draft.width),
  );
  const run = [start];
  let current = start;
  while (run.length < length) {
    const x = current % draft.width;
    const z = Math.floor(current / draft.width);
    let next: number | undefined;
    for (const [dx, dz] of NEIGHBOURS_4) {
      if (!draft.inBounds(x + dx, z + dz)) continue;
      const j = (z + dz) * draft.width + x + dx;
      if (
        onLip.has(j) &&
        !used.has(j) &&
        !run.includes(j) &&
        draft.groundLevelAt(x + dx, z + dz) === level
      ) {
        next = j;
        break;
      }
    }
    if (next === undefined) break;
    run.push(next);
    current = next;
  }
  return run;
}

/** Four-connected components of the columns a mask marks, in scan order. */
export function components(draft: MapDraft, mask: Uint8Array): number[][] {
  const seen = new Uint8Array(mask.length);
  const out: number[][] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1 || seen[i] === 1) continue;
    const group = [i];
    seen[i] = 1;
    for (const u of group) {
      const x = u % draft.width;
      const z = Math.floor(u / draft.width);
      for (const [dx, dz] of NEIGHBOURS_4) {
        if (!draft.inBounds(x + dx, z + dz)) continue;
        const v = (z + dz) * draft.width + x + dx;
        if (mask[v] !== 1 || seen[v] === 1) continue;
        seen[v] = 1;
        group.push(v);
      }
    }
    out.push(group);
  }
  return out;
}

/** The mean column of a group. */
export function centroid(
  draft: MapDraft,
  group: readonly number[],
): ColumnCoord {
  let sx = 0;
  let sz = 0;
  for (const i of group) {
    sx += i % draft.width;
    sz += Math.floor(i / draft.width);
  }
  return { x: sx / group.length, z: sz / group.length };
}

/**
 * A four-connected run of columns on the circle of `radius` about
 * `centre`, from angle `from` to angle `to`.
 */
export function arcColumns(
  centre: ColumnCoord,
  radius: number,
  from: number,
  to: number,
): ColumnCoord[] {
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) * radius * 2));
  const out: ColumnCoord[] = [];
  for (let s = 0; s <= steps; s++) {
    const angle = from + ((to - from) * s) / steps;
    const next = {
      x: Math.round(centre.x + Math.cos(angle) * radius),
      z: Math.round(centre.z + Math.sin(angle) * radius),
    };
    const last = out[out.length - 1];
    if (last?.x === next.x && last.z === next.z) continue;
    if (last !== undefined && last.x !== next.x && last.z !== next.z) {
      out.push({ x: next.x, z: last.z });
    }
    out.push(next);
  }
  return out;
}
