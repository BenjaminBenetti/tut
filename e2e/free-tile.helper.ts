import type { Page } from "@playwright/test";

import { allows, PassMask } from "../src/mapgen/model/pass-mask";
import type { TileCoord } from "../src/mapgen/model/tile-coord";
import type { TacticalState } from "../src/tactical/model/tactical-state";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** A client-pixel point on the page. */
interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** A tile a click can put a unit on, and where to click it. */
export interface FreeTile {
  readonly tile: TileCoord;
  readonly at: ScreenPoint;
}

// ===========================================
// Constants
// ===========================================

/** How far out from a member of the force to look, in tiles. */
const SEARCH_RADIUS = 3;

/**
 * How much screen a drawn model can cover around its feet, in projected
 * tile edges: a tile edge's length on screen, so the box scales with the
 * zoom. The mech is the tallest model a mission launches with, about
 * 3.4 edges from its feet to its head, and its gun arm reaches almost
 * two edges to the side.
 *
 * ```
 *        ┌──────┐ ▲
 *        │ head │ │ ABOVE
 *        │      │ │
 *        │ feet●│ ▼
 *        └──────┘ BELOW
 *        ◄─SIDE─►
 * ```
 */
const MODEL_REACH = { SIDE: 2.5, ABOVE: 5, BELOW: 1.5 } as const;

// ===========================================
// Search
// ===========================================

/**
 * The first free ground tile beside the force a click can put a unit
 * on, with where to click it (#1136). Searched from the saved mission
 * rather than guessed: the deploy zone is at an edge of the map and its
 * neighbours are not all standing tiles.
 *
 * A click picks the unit whose model is drawn under the pointer before
 * it picks the tile, and a unit wins over a spawner (the tactical target
 * picker). So a tile only counts when:
 *
 * - it is a tile of the map on the force's own level that infantry can
 *   stand on, holding no living unit and no live spawner, with no living
 *   unit on any of its eight neighbours;
 * - its screen centre is outside every drawn unit's and spawner's model,
 *   judged by a box around the feet ({@link MODEL_REACH}). A tile three
 *   rows behind the mech in the isometric view projects onto the mech's
 *   head, so being a few tiles away on the ground is not enough;
 * - its screen centre is clear of the rail on the left and the card on
 *   the right, where the HUD's panels take the click (#1113, #1134).
 *
 * @param page - The page driving a live mission.
 * @returns The first such tile and its client-pixel centre, or undefined.
 */
export async function freeTileBesideTheForce(
  page: Page,
): Promise<FreeTile | undefined> {
  const mission = await savedMission(page);
  const candidates = groundCandidates(mission);
  const bounds = await page.locator("#tactical-viewport canvas").boundingBox();
  if (bounds === null || candidates.length === 0) return undefined;
  const living = mission.units.filter((unit) => unit.hp > 0);
  const spawners = mission.spawners.filter((spawner) => !spawner.destroyed);
  const screen = await page.evaluate(
    ({ tiles, unitIds, spawnerIds }) => {
      const hooks = (globalThis as HookGlobal).__tutTactical__;
      return {
        tiles: tiles.map((tile) => hooks?.tileScreenPosition(tile)),
        feet: [
          ...unitIds.map((id) => hooks?.unitScreenPosition(id)),
          ...spawnerIds.map((id) => hooks?.spawnerScreenPosition(id)),
        ],
      };
    },
    {
      tiles: candidates,
      unitIds: living.map((unit) => unit.id),
      spawnerIds: spawners.map((spawner) => spawner.id),
    },
  );
  const edge = projectedEdge(candidates, screen.tiles);
  if (edge === undefined) return undefined;
  // Units and spawners not drawn (unseen, or hidden arrivals) are picked
  // nowhere either, so only drawn ones can cover a tile.
  const feet = screen.feet.filter((point) => point !== undefined);
  const covered = (at: ScreenPoint): boolean =>
    feet.some(
      (foot) =>
        Math.abs(at.x - foot.x) < MODEL_REACH.SIDE * edge &&
        at.y > foot.y - MODEL_REACH.ABOVE * edge &&
        at.y < foot.y + MODEL_REACH.BELOW * edge,
    );
  const clearOfHud = (at: ScreenPoint): boolean =>
    at.x > bounds.x + bounds.width * 0.3 &&
    at.x < bounds.x + bounds.width * 0.68 &&
    at.y > bounds.y + 80 &&
    at.y < bounds.y + bounds.height - 80;
  for (const [index, tile] of candidates.entries()) {
    const at = screen.tiles[index];
    if (at !== undefined && clearOfHud(at) && !covered(at)) {
      return { tile, at };
    }
  }
  return undefined;
}

// ===========================================
// Helpers
// ===========================================

/** The mission as the autosave last wrote it. */
async function savedMission(page: Page): Promise<TacticalState> {
  const mission = await page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: { activeMission?: TacticalState };
    };
    return envelope.state.activeMission ?? null;
  });
  if (mission === null) throw new Error("no mission in the autosave");
  return mission;
}

/**
 * The on-screen length of one tile edge: the distance between the
 * centres of two candidates side by side along x, both of which the
 * scene has placed. Measured rather than assumed, so the model box
 * follows the camera's zoom.
 *
 * @param tiles - The candidate tiles.
 * @param points - Their client-pixel centres, index for index.
 * @returns The edge length in pixels, or undefined when no pair is drawn.
 */
function projectedEdge(
  tiles: readonly TileCoord[],
  points: readonly (ScreenPoint | undefined)[],
): number | undefined {
  for (const [index, tile] of tiles.entries()) {
    const next = tiles.findIndex(
      (other) =>
        other.x === tile.x + 1 && other.y === tile.y && other.z === tile.z,
    );
    const from = points[index];
    const to = next < 0 ? undefined : points[next];
    if (from !== undefined && to !== undefined) {
      return Math.hypot(to.x - from.x, to.y - from.y);
    }
  }
  return undefined;
}

/**
 * Ground tiles near the force that the rules would let infantry stand
 * on, in search order: member by member, then row by row out to
 * {@link SEARCH_RADIUS}. Screen position is judged afterwards.
 *
 * @param mission - The live mission.
 * @returns The candidates, each once.
 */
function groundCandidates(mission: TacticalState): TileCoord[] {
  const key = (tile: TileCoord): string =>
    `${String(tile.x)},${String(tile.y)},${String(tile.z)}`;
  const standing = new Set(
    mission.map.tiles
      .filter((tile) => allows(tile.pass, PassMask.INFANTRY))
      .map(key),
  );
  const living = mission.units.filter((unit) => unit.hp > 0);
  const taken = new Set([
    ...living.map((unit) => key(unit.pos)),
    ...mission.spawners
      .filter((spawner) => !spawner.destroyed)
      .map((spawner) => key(spawner.pos)),
  ]);
  // A unit's model overlaps the tiles around it, so a click there picks
  // the unit, and the rules refuse the placement as occupied.
  const clearOfUnits = (tile: TileCoord): boolean =>
    living.every(
      (unit) =>
        unit.pos.y !== tile.y ||
        Math.max(Math.abs(unit.pos.x - tile.x), Math.abs(unit.pos.z - tile.z)) >
          1,
    );
  const candidates: TileCoord[] = [];
  const seen = new Set<string>();
  for (const unit of living.filter((member) => member.team === "tdf")) {
    for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx += 1) {
      for (let dz = -SEARCH_RADIUS; dz <= SEARCH_RADIUS; dz += 1) {
        const tile = { x: unit.pos.x + dx, y: unit.pos.y, z: unit.pos.z + dz };
        const id = key(tile);
        if (seen.has(id)) continue;
        seen.add(id);
        if (!standing.has(id) || taken.has(id) || !clearOfUnits(tile)) continue;
        candidates.push(tile);
      }
    }
  }
  return candidates;
}
