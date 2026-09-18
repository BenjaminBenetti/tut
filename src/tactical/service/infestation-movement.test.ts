import { describe, expect, it } from "vitest";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { move } from "../model/move-command";
import type { TacticalState } from "../model/tactical-state";
import {
  buildMoveGraph,
  movementStepCost,
  movementPathCost,
  pathMovementCost,
  pathTo,
  reachable,
} from "./movement-service";
import { createMoveHandler } from "./move-handler";
import {
  blockUnitAt,
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

/** Flat coordinates for movement fixtures. */
function at(x: number, z = 0): TileCoord {
  return { x, y: 0, z };
}

/** Paints a strip of real infested terrain into a small tactical board. */
function field(growth: (tile: TileCoord) => boolean): TacticalMap {
  const map = openField().build();
  return {
    ...map,
    tiles: map.tiles.map((tile) =>
      growth(tile) ? { ...tile, surface: SurfaceIds.INFESTED } : tile,
    ),
  };
}

const ctx = { rng: new Mulberry32Rng(1), ids: new SequentialIdGenerator() };

describe("infested movement", () => {
  it.each(["infantry", "mech"] as const)(
    "charges %s twice and limits the movement overlay accordingly",
    (kind) => {
      const map = field(() => true);
      const unit = unitAt("u", kind, at(0));
      const mission = missionWith(map, [unit]);
      const graph = buildMoveGraph(map);
      expect(
        reachable(mission, unit.id, graph).get(graph.index.keyOf(at(3))),
      ).toBe(6);
      expect(pathTo(mission, unit.id, at(4), graph)).toBeUndefined();
      const result = createMoveHandler()(
        mission,
        move(unit.id, [at(1), at(2)]),
        ctx,
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.state.units[0]?.ap).toBe(0);
      const refused = createMoveHandler()(
        mission,
        move(unit.id, [at(1), at(2), at(3), at(4)]),
        ctx,
      );
      expect(refused).toMatchObject({
        ok: false,
        error: { reason: "over-budget" },
      });
    },
  );

  it("lets bugs travel twice as far and charges the fractional path cost", () => {
    const map = field(() => true);
    const unit = unitAt("bug", "infantry", at(0), { team: "bugs" });
    const mission = { ...missionWith(map, [unit]), phase: "bugs" as const };
    const path = Array.from({ length: 7 }, (_, i) => at(i + 1));
    expect(pathTo(mission, unit.id, at(7))).toEqual(path);
    expect(pathMovementCost(mission, unit, path)).toBe(3.5);
    const result = createMoveHandler()(mission, move(unit.id, path), ctx);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.state.units[0]).toMatchObject({ pos: at(7), ap: 0 });
    const oneAction = createMoveHandler()(
      mission,
      move(unit.id, path.slice(0, 6)),
      ctx,
    );
    if (!oneAction.ok) throw new Error("Bug route should cost one action");
    expect(oneAction.value.state.units[0]?.ap).toBe(1);
  });

  it("chooses a longer clean detour for players and the infested shortcut for bugs", () => {
    const map = field((tile) => tile.z === 1 && tile.x >= 1 && tile.x <= 5);
    const player = unitAt("u", "infantry", at(0, 1), { ap: 4 });
    const bug = unitAt("bug", "infantry", at(0, 1), { team: "bugs" });
    for (const unit of [player, bug]) {
      const mission = missionWith(map, [unit]);
      const path = pathTo(mission, unit.id, at(6, 1));
      expect(path).toBeDefined();
      expect(path?.length).toBe(unit === player ? 8 : 6);
      expect(pathMovementCost(mission, unit, path!)).toBe(
        unit === player ? 8 : 3.5,
      );
    }
  });

  it("finds a cheaper bug route even when it takes more physical steps", () => {
    const map = field((tile) => tile.z === 0);
    const unit = unitAt("bug", "infantry", at(0, 1), { team: "bugs" });
    const mission = missionWith(map, [unit]);
    const path = pathTo(mission, unit.id, at(6, 1));
    expect(path?.length).toBe(8);
    expect(pathMovementCost(mission, unit, path!)).toBe(4.5);
  });

  it("requires a bug's whole footprint to occupy growth for the speed bonus", () => {
    const unit = blockUnitAt("brute", at(0));
    const mixed = field((tile) => tile.z === 0);
    const covered = field(() => true);
    expect(
      movementStepCost(
        missionWith(mixed, [unit]),
        unit,
        at(1),
        buildMoveGraph(mixed),
      ),
    ).toBe(1);
    expect(
      movementStepCost(
        missionWith(covered, [unit]),
        unit,
        at(1),
        buildMoveGraph(covered),
      ),
    ).toBe(0.5);
  });

  it("charges only terrain actually crossed when a reaction interrupts a move", () => {
    const map = field(() => true);
    const unit = unitAt("u", "infantry", at(0));
    const mission = missionWith(map, [unit]);
    const handler = createMoveHandler((state) => ({
      state: { ...state, units: state.units.map((u) => ({ ...u, hp: 0 })) },
      events: [],
    }));
    const result = handler(mission, move(unit.id, [at(1), at(2), at(3)]), ctx);
    if (!result.ok) throw new Error("Legal path should run until the reaction");
    expect(result.value.state.units[0]).toMatchObject({
      pos: at(1),
      hp: 0,
      ap: 1,
    });
  });

  it("rejects an expensive submitted detour even when every tile has a cheaper reachable route", () => {
    const map = field((tile) => tile.x === 1 && tile.z === 0);
    const unit = unitAt("u", "infantry", at(0));
    const mission = missionWith(map, [unit]);
    const result = createMoveHandler()(
      mission,
      move(unit.id, [at(1), at(0), at(1), at(0), at(1)]),
      ctx,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { reason: "over-budget" },
    });
  });
});

/** A fitted mech crossing rubble that can also carry infested growth. */
function fittedMech(allTerrain: boolean, heat = 0): TacticalState {
  const map = field((tile) => tile.x > 0);
  const mech = { ...unitAt("mech", "mech", at(0)), heat, braced: true };
  const base = missionWith(
    { ...map, tiles: map.tiles.map((tile) => ({ ...tile, mechMoveCost: 2 })) },
    [mech],
  );
  return {
    ...base,
    templates: {
      ...base.templates,
      [mech.templateId]: {
        ...base.templates[mech.templateId]!,
        systems: {
          heatCapacity: 6,
          movementHeat: 3,
          cooling: 1,
          idleHeat: 0,
          allTerrain,
        },
      },
    },
  };
}

describe("infestation with fitted mech movement", () => {
  it.each([false, true])(
    "preserves growth cost with all-terrain=%s and bills movement heat once per actual action",
    (allTerrain) => {
      const mission = fittedMech(allTerrain);
      const unit = mission.units[0]!;
      expect(movementStepCost(mission, unit, at(0, 1))).toBe(
        allTerrain ? 1 : 2,
      );
      const path = [at(1), at(2)];
      expect(pathMovementCost(mission, unit, path)).toBe(4);
      expect(movementPathCost(mission, unit, path)).toBe(4);
      const result = createMoveHandler()(mission, move(unit.id, path), ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.state.units[0]).toMatchObject({
        pos: at(2),
        ap: 0,
        heat: 6,
        braced: false,
        movedThisTurn: true,
      });
      expect(mission.units[0]).toMatchObject({
        pos: at(0),
        ap: 2,
        heat: 0,
        braced: true,
      });
    },
  );

  it("limits infested routes by thermal headroom and bills only the crossed tiles after interruption", () => {
    const hot = fittedMech(true, 3);
    expect(pathTo(hot, "mech", at(2))).toBeUndefined();
    expect(
      createMoveHandler()(hot, move("mech", [at(1), at(2)]), ctx),
    ).toMatchObject({ ok: false, error: { reason: "over-budget" } });
    const short = createMoveHandler()(hot, move("mech", [at(1)]), ctx);
    if (!short.ok) throw new Error("One infested step fits the thermal budget");
    expect(short.value.state.units[0]).toMatchObject({
      pos: at(1),
      ap: 1,
      heat: 6,
    });
    const interrupted = createMoveHandler((state) => {
      expect(state.units[0]).toMatchObject({
        braced: false,
        movedThisTurn: true,
      });
      return {
        state: {
          ...state,
          units: state.units.map((unit) => ({ ...unit, hp: 0 })),
        },
        events: [],
      };
    })(fittedMech(false), move("mech", [at(1), at(2)]), ctx);
    if (!interrupted.ok)
      throw new Error("Legal movement should reach its first reaction");
    expect(interrupted.value.state.units[0]).toMatchObject({
      pos: at(1),
      hp: 0,
      ap: 1,
      heat: 3,
    });
  });

  it("keeps arbitrary fractional mech roughness reachable alongside half-cost bug movement", () => {
    const mech = unitAt("mech", "mech", at(0));
    const ground = openField().build();
    const mission = missionWith(
      {
        ...ground,
        tiles: ground.tiles.map((tile) => ({ ...tile, mechMoveCost: 1.25 })),
      },
      [mech],
    );
    const graph = buildMoveGraph(mission.map);
    const path = pathTo(mission, mech.id, at(3), graph)!;
    expect(path).toHaveLength(3);
    expect(
      reachable(mission, mech.id, graph).get(graph.index.keyOf(at(3))),
    ).toBe(3.75);
    expect(pathMovementCost(mission, mech, path, graph)).toBe(3.75);
    const result = createMoveHandler()(mission, move(mech.id, path), ctx);
    if (!result.ok)
      throw new Error("Fractional rough-ground path should be legal");
    expect(result.value.state.units[0]?.ap).toBe(0);
    const bug = unitAt("bug", "infantry", at(0), { team: "bugs" });
    const growth = fittedMech(false).map;
    expect(movementStepCost(missionWith(growth, [bug]), bug, at(1))).toBe(0.5);
  });
});
