import type { Direction } from "../../core/model/direction";
import { DIRECTIONS } from "../../core/model/direction";
import { oppositeDirection } from "../../core/service/grid-math";
import type { Connector } from "../model/connector";
import type { PassMask, UnitClass } from "../model/pass-mask";
import { allows, PassMask as Pass } from "../model/pass-mask";
import type { Tile } from "../model/tile";
import type { TileCoord } from "../model/tile-coord";
import type { WallKind } from "../model/wall";
import type { TileIndex } from "./tile-index";

// ===========================================
// Types
// ===========================================

/** One end of a connector as seen from a tile. */
interface ConnectorLink {
  readonly to: Tile;
  readonly pass: PassMask;
}

// ===========================================
// ReachabilityService
// ===========================================

/**
 * Implements the traversal contract of ADR 0004 §5 over a `TileIndex` and
 * the map's connectors, and answers reachability questions with a
 * breadth-first search over numeric tile keys.
 *
 * ```
 *   canStep(class, A, B):
 *     both tiles allow the class
 *     and ( same level, orthogonal neighbours, no blocking wall on the edge
 *           (doors block everything but infantry)
 *        or a connector joins A and B and allows the class )
 * ```
 *
 * Passes and the validator use it; tactical implements the same rule on
 * its own runtime state.
 */
export class ReachabilityService {
  // ===========================================
  // Fields
  // ===========================================

  private readonly index: TileIndex;
  private readonly links: ReadonlyMap<number, readonly ConnectorLink[]>;

  // ===========================================
  // Construction
  // ===========================================

  /**
   * Builds the connector adjacency once. Connectors whose endpoints do not
   * exist are ignored here; the validator reports them.
   */
  constructor(index: TileIndex, connectors: readonly Connector[]) {
    this.index = index;
    const links = new Map<number, ConnectorLink[]>();
    for (const connector of connectors) {
      const from = index.getAt(connector.from);
      const to = index.getAt(connector.to);
      if (from === undefined || to === undefined) {
        continue;
      }
      pushLink(links, index.keyOf(from), { to, pass: connector.pass });
      pushLink(links, index.keyOf(to), { to: from, pass: connector.pass });
    }
    this.links = links;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * True when a unit of the class may move directly from one tile to the
   * other under the §5 rule.
   */
  canStep(from: Tile, to: Tile, unitClass: UnitClass): boolean {
    if (!allows(from.pass, unitClass) || !allows(to.pass, unitClass)) {
      return false;
    }
    if (from.y === to.y) {
      const direction = horizontalDirection(from, to);
      if (
        direction !== undefined &&
        !this.wallBlocks(from, to, direction, unitClass)
      ) {
        return true;
      }
    }
    const toKey = this.index.keyOf(to);
    return (this.links.get(this.index.keyOf(from)) ?? []).some(
      (link) =>
        this.index.keyOf(link.to) === toKey && allows(link.pass, unitClass),
    );
  }

  /**
   * Returns every tile a unit of the class can step to from the tile:
   * same-level orthogonal neighbours plus connector endpoints.
   */
  neighbours(from: Tile, unitClass: UnitClass): Tile[] {
    if (!allows(from.pass, unitClass)) {
      return [];
    }
    const result: Tile[] = [];
    for (const direction of DIRECTIONS) {
      const to = this.index.neighbour(from, direction);
      if (
        to !== undefined &&
        allows(to.pass, unitClass) &&
        !this.wallBlocks(from, to, direction, unitClass)
      ) {
        result.push(to);
      }
    }
    for (const link of this.links.get(this.index.keyOf(from)) ?? []) {
      if (allows(link.pass, unitClass) && allows(link.to.pass, unitClass)) {
        result.push(link.to);
      }
    }
    return result;
  }

  /**
   * Returns the keys of every tile reachable by the class from any of the
   * origins. Origins that do not exist or do not allow the class are
   * skipped.
   */
  reachableFrom(
    origins: readonly TileCoord[],
    unitClass: UnitClass,
  ): ReadonlySet<number> {
    const seen = new Set<number>();
    const frontier: Tile[] = [];
    for (const origin of origins) {
      const tile = this.index.getAt(origin);
      if (tile === undefined || !allows(tile.pass, unitClass)) {
        continue;
      }
      const key = this.index.keyOf(tile);
      if (!seen.has(key)) {
        seen.add(key);
        frontier.push(tile);
      }
    }
    // for-of sees elements pushed during iteration, so this is a BFS queue.
    for (const current of frontier) {
      for (const next of this.neighbours(current, unitClass)) {
        const key = this.index.keyOf(next);
        if (!seen.has(key)) {
          seen.add(key);
          frontier.push(next);
        }
      }
    }
    return seen;
  }

  /**
   * True when every listed tile that allows the class is reachable from
   * every other such tile. Vacuously true when none allows the class.
   */
  isConnected(tiles: readonly TileCoord[], unitClass: UnitClass): boolean {
    const members = tiles
      .map((coord) => this.index.getAt(coord))
      .filter(
        (tile): tile is Tile =>
          tile !== undefined && allows(tile.pass, unitClass),
      );
    const first = members[0];
    if (first === undefined) {
      return true;
    }
    const reachable = this.reachableFrom([first], unitClass);
    return members.every((tile) => reachable.has(this.index.keyOf(tile)));
  }

  /**
   * True when at least one of the targets is in the reachable set.
   */
  anyReachable(
    reachable: ReadonlySet<number>,
    targets: readonly TileCoord[],
  ): boolean {
    return targets.some((coord) => {
      const tile = this.index.getAt(coord);
      return tile !== undefined && reachable.has(this.index.keyOf(tile));
    });
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * True when the wall on the shared edge, read from either side, blocks
   * the class. Checking both sides tolerates an asymmetric wall (an I3
   * violation) by treating it as present.
   */
  private wallBlocks(
    from: Tile,
    to: Tile,
    direction: Direction,
    unitClass: UnitClass,
  ): boolean {
    return (
      wallKindBlocks(from.walls[direction], unitClass) ||
      wallKindBlocks(to.walls[oppositeDirection(direction)], unitClass)
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * True when a wall of the kind blocks the class. Nothing lets a mech
 * through — it is too tall to use a door and too heavy to climb a
 * parapet — while infantry walks through a door and vaults a half wall
 * (#508).
 */
export function wallKindBlocks(
  kind: WallKind | undefined,
  unitClass: UnitClass,
): boolean {
  if (kind === undefined) {
    return false;
  }
  if (unitClass !== Pass.INFANTRY) {
    return true;
  }
  return kind !== "door" && kind !== "half";
}

/** Direction from one tile to a horizontally adjacent one, else undefined. */
function horizontalDirection(
  from: TileCoord,
  to: TileCoord,
): Direction | undefined {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx === 0 && dz === -1) return "n";
  if (dx === 1 && dz === 0) return "e";
  if (dx === 0 && dz === 1) return "s";
  if (dx === -1 && dz === 0) return "w";
  return undefined;
}

/** Appends a link to the adjacency map. */
function pushLink(
  links: Map<number, ConnectorLink[]>,
  key: number,
  link: ConnectorLink,
): void {
  const existing = links.get(key);
  if (existing === undefined) {
    links.set(key, [link]);
  } else {
    existing.push(link);
  }
}
