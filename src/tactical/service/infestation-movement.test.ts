import { describe, expect, it } from "vitest";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { move } from "../model/move-command";
import {
  buildMoveGraph,
  movementStepCost,
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
