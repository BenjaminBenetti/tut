import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { move } from "../../tactical/model/move-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { footprintTiles } from "../../tactical/service/footprint-service";
import { createMoveHandler } from "../../tactical/service/move-handler";
import {
  buildMoveGraph,
  footprintFits,
  occupiedKeys,
  pathTo,
  searchMoves,
} from "../../tactical/service/movement-service";
import {
  startedMission,
  walkableTileNear,
} from "../ai/bug-mission.test-helper";
import { BROODMOTHER, BROODMOTHER_SCARRED_MODEL_ID } from "../data/species";
import { placeBroodmother } from "./broodmother-placement";
import { broodmotherHp, isBroodmother } from "./broodmother-service";

// ===========================================
// Fixtures
// ===========================================

/** A started d5 mission on a generated small city, the starter roster deployed. */
function cityMission(): TacticalState {
  return startedMission("player");
}

/** A 3×3 anchor clear of the squad, about `offset` tiles from its first unit. */
function anchorNearSquad(mission: TacticalState, offset: number): TileCoord {
  const squad = mission.units.find((u) => u.team === "tdf");
  if (squad === undefined) throw new Error("fixture mission has no squad");
  return walkableTileNear(
    mission,
    { x: squad.pos.x + offset, y: squad.pos.y, z: squad.pos.z + offset },
    3,
  );
}

/** Places her with fresh ids. */
function place(
  mission: TacticalState,
  anchor: TileCoord,
  scars: number,
): TacticalState {
  return placeBroodmother(mission, anchor, {
    ids: new SequentialIdGenerator({ counters: { unit: 900 } }),
    species: BROODMOTHER,
    scars,
  });
}

// ===========================================
// Tests
// ===========================================

describe("placeBroodmother (#1179, campaign arc §6.8)", () => {
  it("stands her on a generated map as a named 3×3 boss with her mission's hit points", () => {
    const mission = cityMission();
    const anchor = anchorNearSquad(mission, 8);
    const placed = place(mission, anchor, 0);
    const added = placed.units.slice(mission.units.length);
    expect(added).toHaveLength(1);
    const her = added[0]!;
    expect(isBroodmother(her)).toBe(true);
    expect(her.persona).toBe("broodmother");
    expect(her.pos).toEqual(anchor);
    expect(her.hp).toBe(broodmotherHp(mission.difficulty, 0));
    expect(her.maxHp).toBe(broodmotherHp(mission.difficulty, 0));
    expect(her.ap).toBe(BROODMOTHER.ap);
    const template = placed.templates[her.templateId];
    expect(template?.footprint).toBe(3);
    expect(template?.modelId).toBe("bug.broodmother");
    expect(template?.maxHp).toBe(her.maxHp);
    // Her whole block now holds the ground.
    const held = occupiedKeys(placed, buildMoveGraph(placed.map).index);
    const index = buildMoveGraph(placed.map).index;
    for (const tile of footprintTiles(anchor, 3)) {
      expect(held.has(index.keyOf(tile))).toBe(true);
    }
  });

  it("comes back scarred and a quarter harder for every escape", () => {
    const mission = cityMission();
    const anchor = anchorNearSquad(mission, 8);
    const placed = place(mission, anchor, 2);
    const her = placed.units.find(isBroodmother)!;
    expect(her.maxHp).toBe(broodmotherHp(mission.difficulty, 2));
    expect(her.maxHp).toBeGreaterThan(broodmotherHp(mission.difficulty, 0));
    expect(placed.templates[her.templateId]?.modelId).toBe(
      BROODMOTHER_SCARRED_MODEL_ID,
    );
  });

  it("returns the mission as it was where her block does not fit or is taken", () => {
    const mission = cityMission();
    const squad = mission.units.find((u) => u.team === "tdf")!;
    // On the squad: taken.
    expect(place(mission, squad.pos, 0)).toBe(mission);
    // Off the map's far corner: her block hangs over the edge.
    const corner = { x: mission.map.width - 2, y: 0, z: mission.map.depth - 2 };
    expect(place(mission, corner, 0)).toBe(mission);
  });
});

describe("a 3×3 Broodmother on a generated map (#1179)", () => {
  it("finds legal routes, every anchor on them a block that fits and is free, and the move rules walk her there", () => {
    // The kit asks for the first 3×3 unit; movement, fit and pathing were
    // proven at 2×2 (#1130). This is the proof at 3, on a real city.
    const mission = cityMission();
    const placed = place(mission, anchorNearSquad(mission, 8), 0);
    const bugs: TacticalState = { ...placed, phase: "bugs" };
    const her = bugs.units.find(isBroodmother)!;
    const graph = buildMoveGraph(bugs.map);
    const search = searchMoves(bugs, her, graph);
    // Somewhere to go: more than the tile she holds.
    expect(search.costs.size).toBeGreaterThan(10);
    const held = occupiedKeys(bugs, graph.index, her.id);
    let farthest: { key: number; cost: number } | undefined;
    for (const [key, cost] of search.costs) {
      if (farthest === undefined || cost > farthest.cost) {
        farthest = { key, cost };
      }
    }
    const tile = search.tiles.get(farthest!.key)!;
    const target = { x: tile.x, y: tile.y, z: tile.z };
    const path = pathTo(bugs, her.id, target, graph);
    expect(path).toBeDefined();
    expect(path!.length).toBeGreaterThan(1);
    for (const step of path!) {
      expect(footprintFits(graph, step, 3, PassMask.INFANTRY)).toBe(true);
      for (const tile of footprintTiles(step, 3)) {
        expect(held.has(graph.index.keyOf(tile))).toBe(false);
      }
    }
    // The move rules agree: the whole walk is legal for her block.
    const moved = createMoveHandler()(bugs, move(her.id, path!), {
      rng: new Mulberry32Rng(1),
      ids: new SequentialIdGenerator(),
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.value.state.units.find((u) => u.id === her.id)?.pos).toEqual(
      target,
    );
  });
});
