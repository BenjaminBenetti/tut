import { describe, expect, it } from "vitest";
import { DIRECTIONS, type Direction } from "../../../core/model/direction";
import { stepGridPos } from "../../../core/service/grid-math";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { footprintTiles } from "../../../tactical/service/footprint-service";
import {
  buildMoveGraph,
  footprintCanStep,
  footprintFits,
  type MoveGraph,
} from "../../../tactical/service/movement-service";
import { hasLineOfSight } from "../../../tactical/service/sight-service";
import { BIOME_DEFINITIONS } from "../../data/biomes";
import { DEFAULT_MISSION_HOOKS } from "../../data/hook-requirements";
import { PropKindIds } from "../../data/props";
import { SETTLEMENT_DEFINITIONS } from "../../data/settlements";
import { SurfaceIds } from "../../data/surfaces";
import type { GenerationContext } from "../../model/generation-pass";
import type {
  CarapaceGateway,
  CarapaceSite,
} from "../../model/infestation-plan";
import { MapDraft } from "../../model/map-draft";
import { PassMask } from "../../model/pass-mask";
import type { ColumnCoord } from "../../model/road";
import type { Tile } from "../../model/tile";
import type { TileCoord } from "../../model/tile-coord";
import type { TacticalMap } from "../../model/tactical-map";
import { FixtureMapBuilder } from "../../service/fixture-map-builder";
import { createDefaultRegistries } from "../../service/default-registries";
import { DiagnosticsCollector } from "../../service/diagnostics-collector";
import { freezeDraft } from "../../service/draft-freezer";
import { generateTacticalMap } from "../../service/generate-tactical-map";
import {
  columnKey,
  createCarapaceOutline,
  joinCarapaceCells,
  turnDirection,
} from "./carapace-outline";
import { placeCarapaceSite, planCarapaceSites } from "./carapace-sites";

/** A fully infested patch of small terraces separated by natural half-storey steps. */
function steppedColony(seed: number): GenerationContext {
  const draft = new MapDraft(
    24,
    24,
    new SequentialIdGenerator(),
    SurfaceIds.INFESTED,
  );
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      draft.setGroundLevel(x, z, (Math.floor(x / 3) + Math.floor(z / 3)) % 2);
    }
  }
  draft.infestation = {
    level: 10,
    zones: [
      {
        id: "colony",
        centre: { x: 12, z: 12 },
        radius: 14,
        clearingRadius: 5,
        maturity: "hive",
      },
    ],
    corridors: [],
    ruins: [],
    influence: Array<number>(draft.width * draft.depth).fill(1),
  };
  return {
    draft,
    registries: createDefaultRegistries(),
    rng: new Mulberry32Rng(seed),
    diagnostics: new DiagnosticsCollector().forPass("carapace-traversal"),
    params: {
      archetype: "settlement",
      width: draft.width,
      depth: draft.depth,
      biome: BIOME_DEFINITIONS.temperate,
      settlement: SETTLEMENT_DEFINITIONS.town,
      hooks: [],
      slopeShare: 1,
      infestation: 10,
    },
  };
}

/** The nearest 2×2 anchor standing entirely inside a two-cell gateway. */
function innerAnchor(gateway: CarapaceGateway): TileCoord {
  const x = Math.min(...gateway.tiles.map((tile) => tile.x));
  const z = Math.min(...gateway.tiles.map((tile) => tile.z));
  return {
    x: x + (gateway.outward === "w" ? 1 : gateway.outward === "e" ? -2 : 0),
    y: 0,
    z: z + (gateway.outward === "n" ? 1 : gateway.outward === "s" ? -2 : 0),
  };
}

/** Native 2×2 movement restricted to the courtyard, so no route can detour around its outside. */
function bruteReach(
  graph: MoveGraph,
  from: TileCoord,
  courtyard: readonly ColumnCoord[],
): ReadonlySet<number> {
  const allowed = new Set(courtyard.map(columnKey));
  const start = graph.index.getAt(from)!;
  expect(footprintFits(graph, start, 2, PassMask.INFANTRY)).toBe(true);
  expect(
    footprintTiles(start, 2).every((tile) => allowed.has(columnKey(tile))),
  ).toBe(true);
  const seen = new Set([graph.index.keyOf(start)]);
  const pending: Tile[] = [start];
  for (const at of pending) {
    for (const next of graph.reachability.neighbours(at, PassMask.INFANTRY)) {
      const key = graph.index.keyOf(next);
      if (
        seen.has(key) ||
        !footprintTiles(next, 2).every((tile) =>
          allowed.has(columnKey(tile)),
        ) ||
        !footprintCanStep(graph, at, next, 2, PassMask.INFANTRY)
      )
        continue;
      seen.add(key);
      pending.push(next);
    }
  }
  return seen;
}

/** Checks a completed gateway against the same footprint and sight rules used in combat. */
function expectGatewayPassage(
  map: TacticalMap,
  graph: MoveGraph,
  gate: CarapaceGateway,
): void {
  const minX = Math.min(...gate.approach.map((tile) => tile.x));
  const maxX = Math.max(...gate.approach.map((tile) => tile.x));
  const minZ = Math.min(...gate.approach.map((tile) => tile.z));
  const maxZ = Math.max(...gate.approach.map((tile) => tile.z));
  const y = graph.index.column(minX, minZ)[0]!.y;
  const from = { x: minX, y, z: minZ };
  const to = { x: maxX - 1, y, z: maxZ - 1 };
  for (const tile of gate.approach) {
    const actual = graph.index.get(tile.x, y, tile.z);
    expect(actual).toMatchObject({
      pass: PassMask.ALL,
      blocksLos: false,
      walls: {},
    });
    expect(actual).not.toHaveProperty("propId");
  }
  const reachable = bruteReach(graph, from, gate.approach);
  expect(reachable.has(graph.index.keyOf(to)), `gate ${gate.outward}`).toBe(
    true,
  );
  expect(hasLineOfSight(map, from, to)).toBe(true);
  expect(hasLineOfSight(map, to, from)).toBe(true);
}

/** Proves complete exterior-to-exterior traversal using only the reserved passage. */
function expectConnectedPassage(graph: MoveGraph, site: CarapaceSite): void {
  const anchors = site.gateways.map((gate) => {
    let tile = innerAnchor(gate);
    for (let step = 0; step < 3; step++) tile = stepGridPos(tile, gate.outward);
    return { ...tile, y: graph.index.column(tile.x, tile.z)[0]!.y };
  });
  const reachable = bruteReach(graph, anchors[0]!, site.passage);
  expect(
    reachable.has(graph.index.keyOf(anchors[1]!)),
    `formation ${site.footprint.x}:${site.footprint.z}, exterior anchors ${JSON.stringify(anchors)}`,
  ).toBe(true);
}

describe("carapace courtyard traversal", () => {
  it("connects both gateways with a native 2×2 footprint after only a narrow passage is graded", () => {
    let graded = 0;
    for (let seed = 0; seed < 16; seed++) {
      const context = steppedColony(seed);
      const { draft, registries } = context;
      const before = Array.from(
        { length: draft.width * draft.depth },
        (_, key) =>
          draft.groundLevelAt(key % draft.width, Math.floor(key / draft.width)),
      );
      draft.infestation = {
        ...draft.infestation!,
        zones: planCarapaceSites(context, draft.infestation!.zones),
      };
      const site = draft.infestation.zones[0]!.carapace;
      expect(site, `seed ${seed}`).toBeDefined();
      const passage = new Set(site!.passage.map(columnKey));
      for (let z = 0; z < draft.depth; z++) {
        for (let x = 0; x < draft.width; x++) {
          const change = Math.abs(
            draft.groundLevelAt(x, z) - before[z * draft.width + x]!,
          );
          expect(change).toBeLessThanOrEqual(1);
          if (change > 0) {
            graded++;
            expect(passage.has(columnKey({ x, z }))).toBe(true);
          }
        }
      }
      expect(placeCarapaceSite(context, site!, new Set())).toBe(true);
      const map = freezeDraft(
        draft,
        {
          seed: `carapace-traversal-${seed}`,
          params: {
            archetype: "settlement",
            biome: "temperate",
            settlement: "town",
            size: { width: draft.width, depth: draft.depth },
            infestation: 10,
            hooks: [],
          },
        },
        registries,
      );
      const graph = buildMoveGraph(map);
      for (const gate of site!.gateways) expectGatewayPassage(map, graph, gate);
      expectConnectedPassage(graph, site!);
    }
    expect(graded).toBeGreaterThan(0);
  });

  it.each([
    { seed: "infestation-review", minimumSites: 0 },
    { seed: "carapace-0", minimumSites: 1 },
  ])(
    "preserves native traversal through every realized formation in generated $seed",
    ({ seed, minimumSites }) => {
      const map = generateTacticalMap({
        seed,
        params: {
          archetype: "settlement",
          biome: "temperate",
          settlement: "town",
          size: "small",
          infestation: 10,
          hooks: DEFAULT_MISSION_HOOKS,
        },
      });
      const graph = buildMoveGraph(map);
      const sites = map.infestation!.zones.flatMap((zone) =>
        zone.carapace?.realized ? [zone.carapace] : [],
      );
      // Unsuitable terrain may decline a formation; it must never leave its walls behind.
      expect(sites.length).toBeGreaterThanOrEqual(minimumSites);
      expect(
        map.props.filter((prop) => prop.kind.startsWith("infested-carapace-")),
      ).toHaveLength(
        sites.reduce((count, site) => count + site.cells.length, 0),
      );
      for (const site of sites) {
        for (const gate of site.gateways)
          expectGatewayPassage(map, graph, gate);
        expectConnectedPassage(graph, site);
      }
    },
  );

  it("rotates the wall module ports to meet the actual neighboring cells", () => {
    for (let seed = 0; seed < 32; seed++) {
      const outline = createCarapaceOutline(9, 8, new Mulberry32Rng(seed));
      const cells = joinCarapaceCells(
        outline.walls.map((tile) => ({ ...tile, y: 0 })),
        new Mulberry32Rng(seed),
      );
      const occupied = new Set(cells.map((cell) => columnKey(cell.tile)));
      for (const cell of cells) {
        const ports: readonly Direction[] =
          cell.kind === PropKindIds.INFESTED_CARAPACE_WALL_FORK
            ? ["w", "e", "n"]
            : cell.kind === PropKindIds.INFESTED_CARAPACE_WALL_CURVE
              ? ["n", "e"]
              : cell.kind === PropKindIds.INFESTED_CARAPACE_WALL_END
                ? ["w"]
                : ["w", "e"];
        const actual = DIRECTIONS.filter((direction) =>
          occupied.has(columnKey(stepGridPos(cell.tile, direction))),
        );
        expect(
          ports.map((port) => turnDirection(port, cell.rotation)).sort(),
        ).toEqual([...actual].sort());
        expect(cell.joins).toEqual(actual);
      }
    }
  });

  it.each([
    { width: 8, depth: 8 },
    { width: 9, depth: 8 },
    { width: 9, depth: 9 },
    { width: 10, depth: 9 },
    { width: 10, depth: 10 },
  ])(
    "lets a 2×2 brute turn between both gates inside a $width×$depth formation",
    ({ width, depth }) => {
      for (let seed = 0; seed < 16; seed++) {
        const outline = createCarapaceOutline(
          width,
          depth,
          new Mulberry32Rng(seed),
        );
        const builder = new FixtureMapBuilder(
          outline.width,
          outline.depth,
          4,
        ).fillGround();
        for (const tile of outline.walls) {
          builder.prop(PropKindIds.INFESTED_CARAPACE_WALL_RIDGE, {
            ...tile,
            y: 0,
          });
        }
        const graph = buildMoveGraph(builder.build());
        const from = innerAnchor(outline.gateways[0]!);
        const to = innerAnchor(outline.gateways[1]!);
        const reachable = bruteReach(graph, from, outline.courtyard);
        expect(reachable.has(graph.index.keyOf(to)), `seed ${seed}`).toBe(true);
      }
    },
  );
});
