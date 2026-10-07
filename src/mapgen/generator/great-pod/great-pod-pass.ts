import { DIRECTIONS } from "../../../core/model/direction";
import type { Direction } from "../../../core/model/direction";
import type { Rng } from "../../../core/model/rng";
import { GREAT_POD_TUNING } from "../../data/great-pod-tuning";
import { PropKindIds } from "../../data/props";
import { SurfaceIds } from "../../data/surfaces";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../../model/generation-pass";
import type { GreatPodLayout } from "../../model/great-pod-layout";
import type { GreatPodTuning } from "../../model/great-pod-tuning";
import type { MapDraft } from "../../model/map-draft";
import type { PropKindId, Rotation } from "../../model/prop";
import type { ColumnCoord } from "../../model/road";
import type { SurfaceId } from "../../model/surface";
import { isOpenGround } from "../../service/draft-queries";
import {
  joinCarapaceCells,
  turnDirection,
} from "../infestation/carapace-outline";
import { GREAT_POD_SITE_ID } from "./great-pod-site-pass";

// ===========================================
// Constants
// ===========================================

/** What the impact throws about the apron: the crash site's bowl debris. */
const DEBRIS: readonly PropKindId[] = [
  PropKindIds.BOULDER,
  PropKindIds.CRATE,
  PropKindIds.BARRIER,
];

/** A carapace straight that lets sight through, swapped for a solid one inside the pod. */
const SOLID_FOR_BROKEN = PropKindIds.INFESTED_CARAPACE_WALL_RIBBED;

/** Rotations in the order a straight plate tries them. */
const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];

// ===========================================
// GreatPodPass
// ===========================================

/**
 * Builds the great pod its site pass planned (#1238): floor, walls and
 * the wreckage round it.
 *
 * ```
 *   1. clear     every prop the debris pass threw onto the disc
 *   2. surfaces  outer chambers hull-plate-dark, the core chamber
 *                hull-plate, under every wall hull-rim (what a breach
 *                leaves walkable), the verge rock, the apron dirt
 *   3. hull      a plate, corner or seam per hull column, joined to its
 *                neighbours, each straight turned to face outward
 *   4. membrane  the membrane and ribs as carapace walls (the colony
 *                kit's joiner; a broken straight is swapped for a solid one)
 *   5. debris    the apron beyond the verge, `debrisDensity` per 100
 *   6. site      every wall is the site's structure: connectivity
 *                repair never cuts the pod open
 * ```
 *
 * Nothing opens the pod: there is no way in until a weapon makes one.
 * The core's own square is left as floor; the mission stands the core
 * on it.
 */
export class GreatPodPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "great-pod";
  readonly requires: readonly DraftCapability[] = ["props", "elevation"];
  readonly provides: readonly DraftCapability[] = [];

  // ===========================================
  // Construction
  // ===========================================

  /** Builds pods by `tuning`; First Skyfall's by default. */
  constructor(private readonly tuning: GreatPodTuning = GREAT_POD_TUNING) {}

  // ===========================================
  // Public Methods
  // ===========================================

  /** Clears the disc, lays its surfaces, raises its walls, strews the apron and names the structure. */
  run(context: GenerationContext): void {
    const { draft, rng, diagnostics } = context;
    const pod = draft.greatPod;
    if (pod === undefined) {
      diagnostics.note("no great pod planned");
      return;
    }
    const cleared = clearDisc(draft, pod);
    laySurfaces(draft, pod, this.tuning);
    const walls = [
      ...raiseHull(draft, pod),
      ...raiseMembrane(draft, pod, rng.fork("membrane")),
    ];
    const debris = strewApron(draft, pod, this.tuning, rng.fork("debris"));
    const index = draft.sites.findIndex(
      (site) => site.id === GREAT_POD_SITE_ID,
    );
    const site = draft.sites[index];
    if (site !== undefined) {
      draft.sites[index] = { ...site, structureIds: walls };
    }
    diagnostics.note(
      `great pod: ${String(pod.hull.length + pod.seams.length)} hull, ` +
        `${String(pod.membrane.length + pod.ribs.length)} membrane and rib, ` +
        `${String(debris)} debris, ${String(cleared)} props cleared`,
    );
  }
}

// ===========================================
// Steps
// ===========================================

/** Removes every prop with a tile on the disc; returns how many. */
function clearDisc(draft: MapDraft, pod: GreatPodLayout): number {
  const disc = new Set(
    [
      ...pod.apron,
      ...pod.hull,
      ...pod.seams,
      ...pod.membrane,
      ...pod.ribs,
      ...pod.floor,
    ].map((column) => key(column)),
  );
  const doomed = draft.props.filter((prop) =>
    (prop.occupiedTiles ?? [prop.tile]).some((tile) => disc.has(key(tile))),
  );
  for (const prop of doomed) draft.removeProp(prop.id);
  return doomed.length;
}

/** Lays the floor, the ground under the walls and the apron (see `GreatPodPass`). */
function laySurfaces(
  draft: MapDraft,
  pod: GreatPodLayout,
  tuning: GreatPodTuning,
): void {
  const set = (columns: readonly ColumnCoord[], surface: SurfaceId): void => {
    for (const { x, z } of columns) {
      if (draft.inBounds(x, z) && !draft.isLandingReserved(x, z)) {
        draft.setGroundSurface(x, z, surface);
      }
    }
  };
  const inCoreChamber = (column: ColumnCoord): boolean =>
    Math.hypot(column.x - pod.centre.x, column.z - pod.centre.z) <=
    tuning.membraneRadius + 0.5;
  set(pod.apron, SurfaceIds.DIRT);
  set(pod.verge, SurfaceIds.ROCK);
  set(
    pod.floor.filter((column) => !inCoreChamber(column)),
    SurfaceIds.HULL_PLATE_DARK,
  );
  set(pod.floor.filter(inCoreChamber), SurfaceIds.HULL_PLATE);
  set(
    [...pod.hull, ...pod.seams, ...pod.membrane, ...pod.ribs],
    SurfaceIds.HULL_RIM,
  );
}

/**
 * One hull piece per hull and seam column: a seam where the plan put
 * one, a corner where the ring turns, a plate elsewhere. Returns the ids.
 */
function raiseHull(draft: MapDraft, pod: GreatPodLayout): string[] {
  const seams = new Set(pod.seams.map(key));
  const ring = [...pod.hull, ...pod.seams];
  const keys = new Set(ring.map(key));
  const ids: string[] = [];
  for (const column of ring) {
    if (!draft.inBounds(column.x, column.z)) continue;
    const joins = DIRECTIONS.filter((direction) =>
      keys.has(key(step(column, direction))),
    );
    const corner =
      joins.length === 2 &&
      (DIRECTIONS.indexOf(joins[0]!) + 2) % 4 !== DIRECTIONS.indexOf(joins[1]!);
    const kind = seams.has(key(column))
      ? PropKindIds.GREAT_POD_HULL_SEAM
      : corner
        ? PropKindIds.GREAT_POD_HULL_CURVE
        : PropKindIds.GREAT_POD_HULL_PLATE;
    const rotation = corner
      ? rotationFor(["n", "e"], joins)
      : straightRotation(column, joins, pod);
    ids.push(
      draft.addProp(kind, draft.groundCoord(column.x, column.z), rotation).id,
    );
  }
  return ids;
}

/**
 * The membrane and ribs as one run of carapace walls, joined where a rib
 * meets the membrane. Returns the ids.
 */
function raiseMembrane(
  draft: MapDraft,
  pod: GreatPodLayout,
  rng: Rng,
): string[] {
  const tiles = [...pod.membrane, ...pod.ribs]
    .filter((column) => draft.inBounds(column.x, column.z))
    .map((column) => draft.groundCoord(column.x, column.z));
  return joinCarapaceCells(tiles, rng).map(
    (cell) =>
      draft.addProp(
        cell.kind === PropKindIds.INFESTED_CARAPACE_WALL_BROKEN
          ? SOLID_FOR_BROKEN
          : cell.kind,
        cell.tile,
        cell.rotation,
      ).id,
  );
}

/** Thrown wreckage on the open apron beyond the verge; returns how many pieces. */
function strewApron(
  draft: MapDraft,
  pod: GreatPodLayout,
  tuning: GreatPodTuning,
  rng: Rng,
): number {
  const verge = new Set(pod.verge.map(key));
  let placed = 0;
  for (const column of pod.apron) {
    if (verge.has(key(column)) || !isOpenGround(draft, column.x, column.z)) {
      continue;
    }
    if (!rng.chance(tuning.debrisDensity / 100)) continue;
    const kind =
      DEBRIS[rng.nextInt(0, DEBRIS.length - 1)] ?? PropKindIds.BOULDER;
    draft.addProp(kind, draft.groundCoord(column.x, column.z));
    placed++;
  }
  return placed;
}

// ===========================================
// Helpers
// ===========================================

/**
 * A straight plate's turn: one that runs it along its joins (`w`–`e` at
 * no turn), of the two, the one that faces its front (`s` at no turn)
 * away from the pod's centre.
 */
function straightRotation(
  column: ColumnCoord,
  joins: readonly Direction[],
  pod: GreatPodLayout,
): Rotation {
  const dx = column.x - pod.centre.x;
  const dz = column.z - pod.centre.z;
  const outward: Direction =
    Math.abs(dz) >= Math.abs(dx) ? (dz < 0 ? "n" : "s") : dx < 0 ? "w" : "e";
  const along = ROTATIONS.filter((turns) =>
    ["w", "e"].every((port) =>
      joins.length < 2
        ? true
        : joins.includes(turnDirection(port as Direction, turns)),
    ),
  );
  return (
    along.find((turns) => turnDirection("s", turns) === outward) ??
    along[0] ??
    0
  );
}

/** The first turn that brings every port onto a join; none when no turn does. */
function rotationFor(
  ports: readonly Direction[],
  joins: readonly Direction[],
): Rotation {
  return (
    ROTATIONS.find((turns) =>
      ports.every((port) => joins.includes(turnDirection(port, turns))),
    ) ?? 0
  );
}

/** The column one step `direction` of `column`. */
function step(column: ColumnCoord, direction: Direction): ColumnCoord {
  switch (direction) {
    case "n":
      return { x: column.x, z: column.z - 1 };
    case "e":
      return { x: column.x + 1, z: column.z };
    case "s":
      return { x: column.x, z: column.z + 1 };
    case "w":
      return { x: column.x - 1, z: column.z };
  }
}

/** A column's key, for sets of columns. */
function key(column: ColumnCoord): string {
  return `${String(column.x)}:${String(column.z)}`;
}
