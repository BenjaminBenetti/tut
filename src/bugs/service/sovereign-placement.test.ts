import { describe, expect, it } from "vitest";

import type { BugSpeciesId } from "../../content/model/bug-species-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import {
  SPORE_PLATFORM_CORE_HOOKS,
  SPORE_PLATFORM_CORE_SIZE,
} from "../../mapgen/data/spore-platform-recipe";
import { HookKinds } from "../../mapgen/model/hook";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { freezeDraft } from "../../mapgen/service/draft-freezer";
import { createPipeline } from "../../mapgen/service/settlement-pipeline";
import { TileIndex } from "../../mapgen/service/tile-index";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { attackTile } from "../../tactical/model/attack-command";
import { MOVE, move } from "../../tactical/model/move-command";
import { STRUCTURE_DESTROYED } from "../../tactical/model/structure-destroyed-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { createAttackHandler } from "../../tactical/service/combat-service";
import {
  footprintTiles,
  unitFootprintSize,
  unitFootprintTiles,
} from "../../tactical/service/footprint-service";
import { createMoveHandler } from "../../tactical/service/move-handler";
import {
  buildMoveGraph,
  footprintFits,
  occupiedKeys,
  pathTo,
  searchMoves,
} from "../../tactical/service/movement-service";
import {
  fixtureAttackDeps,
  missionWith,
  riggedRng,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { withVision } from "../../tactical/service/vision-service";
import {
  bugView,
  startedMission,
  walkableTileNear,
} from "../ai/bug-mission.test-helper";
import { SovereignBehaviour } from "../ai/sovereign-behaviour";
import { footprintDistance } from "../ai/utility";
import { SOVEREIGN_TUNING } from "../data/sovereign-tuning";
import { BUG_SPECIES, SOVEREIGN } from "../data/species";
import { walledFieldAt } from "./broodmother.test-helper";
import { summonGuards } from "./guard-summon-step";
import { placeSovereign } from "./sovereign-placement";
import { isSovereign, sovereignHp } from "./sovereign-service";
import { sovereignMission } from "./sovereign.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** Her block's side, from the species. */
const SIZE = 4;

/** Places her with fresh ids, guarding `core`. */
function place(
  mission: TacticalState,
  anchor: TileCoord,
  core: TileCoord = anchor,
  difficulty?: number,
): TacticalState {
  return placeSovereign(mission, anchor, {
    ids: new SequentialIdGenerator({ counters: { unit: 950 } }),
    species: SOVEREIGN,
    core,
    ...(difficulty === undefined ? {} : { difficulty }),
  });
}

/** A 4×4 anchor clear of the squad, about `offset` tiles from its first unit. */
function anchorNearSquad(mission: TacticalState, offset: number): TileCoord {
  const squad = mission.units.find((u) => u.team === "tdf");
  if (squad === undefined) throw new Error("fixture mission has no squad");
  return walkableTileNear(
    mission,
    { x: squad.pos.x + offset, y: squad.pos.y, z: squad.pos.z + offset },
    SIZE,
  );
}

/**
 * Walks her to the farthest tile her search reaches and checks every
 * anchor on the way is a whole, free 4×4 block, then that the move
 * rules accept the walk. Returns where she ended.
 */
function walkFarthest(bugs: TacticalState, her: Unit): TileCoord {
  const size = unitFootprintSize(bugs, her);
  expect(size).toBe(SIZE);
  const graph = buildMoveGraph(bugs.map);
  const search = searchMoves(bugs, her, graph);
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
    expect(footprintFits(graph, step, size, PassMask.INFANTRY)).toBe(true);
    for (const cell of footprintTiles(step, size)) {
      expect(held.has(graph.index.keyOf(cell))).toBe(false);
    }
  }
  const moved = createMoveHandler()(bugs, move(her.id, path!), {
    rng: new Mulberry32Rng(1),
    ids: new SequentialIdGenerator(),
  });
  expect(moved.ok).toBe(true);
  if (!moved.ok) throw new Error(moved.error.kind);
  expect(moved.value.state.units.find((u) => u.id === her.id)?.pos).toEqual(
    target,
  );
  return target;
}

// ===========================================
// The platform's core chamber
// ===========================================

/** One frozen core stage of the spore platform, generated for `seed`. */
function coreStage(seed: string): TacticalMap {
  const registries = createDefaultRegistries();
  const params = {
    archetype: "spore-platform-core" as const,
    biome: "temperate" as const,
    settlement: "rural" as const,
    size: SPORE_PLATFORM_CORE_SIZE,
    hooks: SPORE_PLATFORM_CORE_HOOKS,
  };
  const result = createPipeline(params.archetype, registries).run(
    params,
    new Mulberry32Rng(hashSeed(seed)),
  );
  return freezeDraft(result.draft, { seed, params }, registries);
}

/** The tiles of the first objective hook of `kind` on `map`. */
function hookTiles(map: TacticalMap, kind: string): readonly TileCoord[] {
  const hook = map.hooks.objectives.find((h) => h.kind === kind);
  if (hook === undefined) throw new Error(`no ${kind} hook`);
  return hook.tiles;
}

/** The lowest-`x`, lowest-`z` tile of a block of tiles. */
function anchorOf(tiles: readonly TileCoord[]): TileCoord {
  const x = Math.min(...tiles.map((t) => t.x));
  const z = Math.min(...tiles.map((t) => t.z));
  const first = tiles.find((t) => t.x === x && t.z === z);
  if (first === undefined) throw new Error("the hook is not a block");
  return first;
}

/** The tile of a block nearest its middle: the core she guards. */
function middleOf(tiles: readonly TileCoord[]): TileCoord {
  const mx = tiles.reduce((sum, t) => sum + t.x, 0) / tiles.length;
  const mz = tiles.reduce((sum, t) => sum + t.z, 0) / tiles.length;
  let best = tiles[0]!;
  for (const tile of tiles) {
    if (
      Math.abs(tile.x - mx) + Math.abs(tile.z - mz) <
      Math.abs(best.x - mx) + Math.abs(best.z - mz)
    ) {
      best = tile;
    }
  }
  return best;
}

/**
 * The core stage with a squad on its deploy pad and the Sovereign on
 * her dais, guarding the core seed's pad, as the finale's setup will
 * stand her; her first look computed.
 */
function onTheDais(seed = "sovereign-proof"): {
  mission: TacticalState;
  her: Unit;
  dais: readonly TileCoord[];
  core: TileCoord;
} {
  const map = coreStage(seed);
  const deploy = map.hooks.deployZones[0]?.tiles[0];
  if (deploy === undefined) throw new Error("no deploy zone");
  const dais = hookTiles(map, HookKinds.SOVEREIGN_DAIS);
  const core = middleOf(hookTiles(map, HookKinds.PLATFORM_CORE));
  const base = missionWith(map, [unitAt("squad", "infantry", deploy)], {
    phase: "bugs",
    difficulty: 9,
  });
  const placed = place(base, anchorOf(dais), core);
  const mission = withVision({ state: placed, events: [] }).state;
  const her = mission.units.find(isSovereign);
  if (her === undefined) throw new Error("she did not fit on her dais");
  return { mission, her, dais, core };
}

// ===========================================
// Tests
// ===========================================

describe("placeSovereign (#1179, campaign arc §9)", () => {
  it("stands her on a generated map as a named 4×4 boss with her mission's hit points and the core she guards", () => {
    const mission = startedMission("player");
    const anchor = anchorNearSquad(mission, 8);
    const core = { x: anchor.x + 1, y: anchor.y, z: anchor.z + 1 };
    const placed = place(mission, anchor, core);
    const added = placed.units.slice(mission.units.length);
    expect(added).toHaveLength(1);
    const her = added[0]!;
    expect(isSovereign(her)).toBe(true);
    expect(her.persona).toBe("sovereign");
    expect(her.core).toEqual(core);
    expect(her.pos).toEqual(anchor);
    expect(her.hp).toBe(sovereignHp(mission.difficulty));
    expect(her.maxHp).toBe(sovereignHp(mission.difficulty));
    expect(her.ap).toBe(SOVEREIGN.ap);
    const template = placed.templates[her.templateId];
    expect(template?.footprint).toBe(SIZE);
    expect(template?.modelId).toBe("bug.sovereign");
    expect(template?.maxHp).toBe(her.maxHp);
    const index = buildMoveGraph(placed.map).index;
    const held = occupiedKeys(placed, index);
    for (const tile of footprintTiles(anchor, SIZE)) {
      expect(held.has(index.keyOf(tile))).toBe(true);
    }
  });

  it("scales her hit points with the difficulty it is given, over the mission's own", () => {
    const mission = startedMission("player");
    const anchor = anchorNearSquad(mission, 8);
    const her = place(mission, anchor, anchor, 10).units.find(isSovereign)!;
    expect(mission.difficulty).not.toBe(10);
    expect(her.maxHp).toBe(sovereignHp(10));
  });

  it("returns the mission as it was where her block does not fit or is taken", () => {
    const mission = startedMission("player");
    const squad = mission.units.find((u) => u.team === "tdf")!;
    expect(place(mission, squad.pos)).toBe(mission);
    const corner = { x: mission.map.width - 3, y: 0, z: mission.map.depth - 3 };
    expect(place(mission, corner)).toBe(mission);
  });
});

describe("a 4×4 Sovereign on a generated city (#1179)", () => {
  it("finds legal routes, every anchor on them a block that fits and is free, and the move rules walk her there", () => {
    // The Broodmother proved 3×3 (#1179); this is the proof at 4.
    const mission = startedMission("player");
    const placed = place(mission, anchorNearSquad(mission, 8));
    const bugs: TacticalState = { ...placed, phase: "bugs" };
    walkFarthest(bugs, bugs.units.find(isSovereign)!);
  });
});

describe("the Sovereign in the platform's core chamber (#1179, arc §6.9)", () => {
  it("stands whole on the sovereign-dais hook, guarding the core seed's pad", () => {
    const { her, dais, core, mission } = onTheDais();
    const tiles = unitFootprintTiles(mission, her)
      .map((t) => `${String(t.x)},${String(t.z)}`)
      .sort();
    expect(tiles).toEqual(
      dais.map((t) => `${String(t.x)},${String(t.z)}`).sort(),
    );
    expect(her.core).toEqual(core);
    expect(her.maxHp).toBe(sovereignHp(mission.difficulty));
  });

  it("walks the arena: a legal route from her dais, every anchor a whole free 4×4 block", () => {
    const { mission, her } = onTheDais();
    walkFarthest(mission, her);
  });

  it("sees from her block and is seen on it: a squad in the arena is spotted, and spots her", () => {
    const { mission, her } = onTheDais();
    const near = walkableTileNear(mission, {
      x: her.pos.x + SIZE + 5,
      y: her.pos.y,
      z: her.pos.z + 1,
    });
    const squad = unitAt("scout", "infantry", near);
    const seen = withVision({
      state: { ...mission, units: [...mission.units, squad] },
      events: [],
    }).state;
    expect(footprintDistance(her.pos, SIZE, near)).toBeLessThanOrEqual(10);
    expect(seen.vision.bugs.spotted).toContain("scout");
    expect(seen.vision.tdf.spotted).toContain(her.id);
    expect(bugView(seen).units.map((u) => u.id)).toContain("scout");
  });

  it("calls her guards onto free arena ground beside the dais", () => {
    const { mission, her } = onTheDais();
    const turn3: TacticalState = { ...mission, turn: 3 };
    const applied = summonGuards(
      turn3,
      {
        rng: riggedRng(true),
        ids: new SequentialIdGenerator({ counters: { unit: 700 } }),
      },
      { speciesOf: (id: BugSpeciesId) => BUG_SPECIES[id] },
    );
    const guards = applied.state.units.slice(turn3.units.length);
    expect(guards).toHaveLength(2);
    const graph = buildMoveGraph(applied.state.map);
    const hers = new Set(
      footprintTiles(her.pos, SIZE).map((t) => graph.index.keyOf(t)),
    );
    for (const guard of guards) {
      expect(footprintFits(graph, guard.pos, 1, PassMask.INFANTRY)).toBe(true);
      expect(hers.has(graph.index.keyOf(guard.pos))).toBe(false);
    }
  });

  it("holds her dais while healthy, and falls back onto the core pad when hurt", () => {
    // The dais is inside her leash of the core but outside her hold, so
    // with nobody in view the only thing that moves her is the wound.
    const { mission, her, core } = onTheDais();
    const onDais = footprintDistance(her.pos, SIZE, core);
    expect(onDais).toBeGreaterThan(SOVEREIGN_TUNING.holdRadius);
    expect(onDais).toBeLessThanOrEqual(SOVEREIGN_TUNING.leashRadius);
    expect(bugView(mission).units.filter((u) => u.team === "tdf")).toEqual([]);
    const ctx = { rng: new Mulberry32Rng(3), combat: COMBAT_TUNING };
    const behaviour = new SovereignBehaviour();
    expect(behaviour.choose(bugView(mission), her.id, ctx)).toEqual([]);
    const hurt: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === her.id ? { ...u, hp: Math.floor(u.maxHp * 0.4) } : u,
      ),
    };
    const commands = behaviour.choose(bugView(hurt), her.id, ctx);
    const step = commands.find((c) => c.type === MOVE);
    expect(step?.type).toBe(MOVE);
    const end = step?.type === MOVE ? step.payload.path.at(-1)! : her.pos;
    expect(footprintDistance(end, SIZE, core)).toBeLessThanOrEqual(
      SOVEREIGN_TUNING.holdRadius,
    );
  });
});

describe("her scythes open a wall (#1179)", () => {
  it("brings down the solid wall on her block's edge when she strikes it", () => {
    // A solid wall along the east side of column 13, her block's east edge.
    const { mission, sovereign } = sovereignMission(
      walledFieldAt(30, 30, 13),
      [unitAt("squad", "infantry", { x: 20, y: 0, z: 20 })],
      { x: 10, y: 0, z: 10 },
    );
    const impact = { x: 13, y: 0, z: 11 };
    const wall = (state: TacticalState) =>
      new TileIndex(state.map).getAt(impact)?.walls.e;
    expect(wall(mission)).toBe("solid");
    const outcome = createAttackHandler(COMBAT_TUNING, fixtureAttackDeps())(
      mission,
      attackTile(sovereign.id, impact),
      { rng: riggedRng(true), ids: new SequentialIdGenerator() },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.type)).toContain(
      STRUCTURE_DESTROYED,
    );
    expect(wall(outcome.value.state)).toBeUndefined();
  });
});
