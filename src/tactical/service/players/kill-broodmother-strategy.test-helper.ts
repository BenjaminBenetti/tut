import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { unitFootprintSize } from "../footprint-service";
import { quarryOf } from "../objectives/kill-broodmother-objective";
import {
  objectiveComplete,
  objectiveFailed,
} from "../objectives/objective-status";
import type { Job, ObjectiveStrategy } from "./objective-strategy.test-helper";
import type { PlayerView } from "./player-view.test-helper";

// ===========================================
// Alpha Hunt (#1179, campaign arc §6.8)
// ===========================================
//
// Her marker never leaves the HUD and her tracker row reads her hit
// points and "fleeing", so the force always knows where she is and when
// she has turned for an edge. The whole force goes after her, firing on
// her before the hatchlings when she is in its sights (a likely kill on
// a hatchling aside). It keeps its pace: a unit that sprints after her
// has nothing left to shoot her with when it catches her up. The careful
// player also posts a squad on her way out: the ground between her and
// the map edge she stands nearest, where it watches for her to pass.
//
//          map edge
//   ─────────────────────────
//            ▲  cut-off squad (expert): halfway out, on overwatch
//            │
//          [ B ]  ◄── hunt: everyone, her first
//            ▲
//          force

/** Tiles past her block toward the edge that the cut-off post lies, at most. */
const CUT_OFF_REACH = 8;

/** Tiles past her block that the cut-off post lies, at least; nearer the edge than this, no post. */
const CUT_OFF_MIN = 2;

/** Field steps from the post within which the cut-off squad holds. */
const CUT_OFF_HOLD = 2;

/** Squads the careful player posts on her way out. */
const CUT_OFF_CREW = 1;

/**
 * Kill the Broodmother before she reaches a map edge. Done once the
 * tracker reads her dead or gone; then home.
 */
export const KILL_BROODMOTHER_STRATEGY: ObjectiveStrategy<"kill-broodmother"> =
  {
    /** Done once the tracker reads complete (dead) or failed (escaped, or nobody left). */
    settled(objective, view) {
      return (
        objective.complete ||
        objectiveComplete(view.mission, objective) ||
        objectiveFailed(view.mission, objective)
      );
    },
    /** Everyone after her marker, her first; the expert's squad on her way out. */
    jobs(objective, view) {
      const her = view.places.get(objective.id) ?? [];
      const quarry = quarryOf(objective, view.mission);
      const anchor = her[0];
      if (anchor === undefined || quarry === undefined) {
        return [];
      }
      const hunt: Job = {
        order: {
          kind: "hunt",
          goals: her,
          targetId: objective.targetId,
          focus: true,
        },
      };
      const post = cutOffPost(
        view,
        anchor,
        unitFootprintSize(view.mission, quarry),
      );
      if (post.length === 0) {
        return [hunt];
      }
      return [
        hunt,
        {
          order: { kind: "guard", goals: post, holdRadius: CUT_OFF_HOLD },
          crew: CUT_OFF_CREW,
          who: "squad",
          expertOnly: true,
        },
      ];
    },
  };

// ===========================================
// Private
// ===========================================

/**
 * The ground a cut-off squad holds: halfway from her block to the map
 * edge she stands nearest (straight across, as a player reads it off
 * the map), at least `CUT_OFF_MIN` and at most `CUT_OFF_REACH` tiles
 * out, level with her middle; the ground tiles of the 3×3 round that
 * point. None when she is already within `CUT_OFF_MIN` of the edge:
 * there is no ground left between her and it.
 *
 * ```
 *   gap to each edge from her block ──► the least ──► along = ⌊gap/2⌋
 *   clamped to [CUT_OFF_MIN, CUT_OFF_REACH] ──► the post, off her middle
 * ```
 */
function cutOffPost(
  view: PlayerView,
  anchor: TileCoord,
  size: number,
): readonly TileCoord[] {
  const { width, depth } = view.mission.map;
  const far = size - 1;
  const ways = [
    { gap: anchor.x, dx: -1, dz: 0 },
    { gap: width - 1 - (anchor.x + far), dx: 1, dz: 0 },
    { gap: anchor.z, dx: 0, dz: -1 },
    { gap: depth - 1 - (anchor.z + far), dx: 0, dz: 1 },
  ];
  const way = ways.reduce((best, next) => (next.gap < best.gap ? next : best));
  if (way.gap < CUT_OFF_MIN) {
    return [];
  }
  const along = Math.min(
    CUT_OFF_REACH,
    Math.max(CUT_OFF_MIN, Math.floor(way.gap / 2)),
  );
  const middle = Math.floor(far / 2);
  const x =
    way.dx < 0
      ? anchor.x - along
      : way.dx > 0
        ? anchor.x + far + along
        : anchor.x + middle;
  const z =
    way.dz < 0
      ? anchor.z - along
      : way.dz > 0
        ? anchor.z + far + along
        : anchor.z + middle;
  const post: TileCoord[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ground = view.graph.index.column(x + dx, z + dz)[0];
      if (ground !== undefined) {
        post.push({ x: ground.x, y: ground.y, z: ground.z });
      }
    }
  }
  return post;
}
