import { describe, expect, it } from "vitest";
import { BIOME_IDS } from "../../content/model/biome-id";
import { rectContains } from "../../core/service/grid-math";
import { createRegistry } from "../../core/service/definition-registry";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { MISSION_SITES } from "../data/mission-sites";
import { SurfaceIds } from "../data/surfaces";
import { HookKinds } from "../model/hook";
import type { MapRecipe } from "../model/map-recipe";
import type { MissionSiteDefinition } from "../model/mission-site";
import { PassMask } from "../model/pass-mask";
import { createDefaultRegistries } from "../service/default-registries";
import { freezeDraft } from "../service/draft-freezer";
import { generateTacticalMap } from "../service/generate-tactical-map";
import { validateTacticalMap } from "../service/map-validator";
import { propTiles } from "../service/prop-footprint";
import { ReachabilityService } from "../service/reachability-service";
import { createPipeline } from "../service/settlement-pipeline";
import { TileIndex } from "../service/tile-index";
import { validateSite } from "./mission-site-pass";

const registries = createDefaultRegistries();

/** Production-shaped defence recipe with all traversal obligations. */
function recipe(
  site: MissionSiteDefinition,
  seed = "facility-review",
): MapRecipe {
  return {
    seed,
    params: {
      archetype: "settlement",
      biome: "temperate",
      settlement: "town",
      size: "small",
      site: site.id,
      hooks: [
        { kind: HookKinds.DEPLOY, count: 1, requiredPass: PassMask.ALL },
        { kind: HookKinds.EXTRACTION, count: 1, requiredPass: PassMask.ALL },
        {
          kind: HookKinds.EDGE_SPAWN,
          count: 3,
          requiredPass: PassMask.INFANTRY,
        },
        {
          kind: HookKinds.GENERATOR,
          count: site.objectives.length,
          requiredPass: PassMask.INFANTRY,
          minDistanceFromDeploy: 6,
        },
      ],
    },
  };
}

describe("authored mission sites", () => {
  for (const site of Object.values(MISSION_SITES)) {
    it.each(BIOME_IDS)(
      `${site.id} retains its structures and reachable sockets on %s, across sizes`,
      (biome) => {
        for (const [i, size] of (
          ["small", "medium", "large"] as const
        ).entries()) {
          const input = recipe(site, `${site.id}-${biome}-${size}`);
          const params: MapRecipe["params"] = {
            ...input.params,
            biome,
            size,
            settlement: (["rural", "town", "city"] as const)[i]!,
            // Authored sites also survive future mixed colony/defence recipes.
            infestation: i === 2 ? 8 : 0,
          };
          const result = createPipeline("settlement", registries).run(
            params,
            new Mulberry32Rng(hashSeed(input.seed)),
          );
          const map = freezeDraft(
            result.draft,
            { ...input, params },
            registries,
          );
          expect(validateTacticalMap(map, registries)).toEqual([]);
          const placed = result.draft.sites[0]!;
          expect(placed.id).toBe(site.id);
          const index = new TileIndex(map);
          const reach = new ReachabilityService(index, map.connectors);
          const deploy = map.hooks.deployZones.flatMap((hook) => hook.tiles);
          const accessible = reach.reachableFrom(deploy, PassMask.INFANTRY);
          const generators = map.hooks.objectives.filter(
            (hook) => hook.kind === HookKinds.GENERATOR,
          );
          expect(generators.map((hook) => hook.tiles[0])).toEqual(
            placed.objectives.map((socket) => socket.tile),
          );
          for (const generator of generators)
            expect(accessible.has(index.keyOf(generator.tiles[0]!))).toBe(true);
          for (const structureId of placed.structureIds) {
            const prop = map.props.find((piece) => piece.id === structureId)!;
            expect(prop, structureId).toBeDefined();
            for (const tile of propTiles(prop)) {
              expect(index.getAt(tile)).toMatchObject({
                propId: structureId,
                pass: PassMask.NONE,
              });
              if (prop.kind.startsWith("installation-"))
                expect(index.getAt(tile)).toMatchObject({
                  blocksLos: true,
                  sightHeight: registries.props.get(prop.kind).sightHeight,
                });
            }
          }
          // No ordinary building, vegetation, colony or aircraft consumes the yard.
          for (const tile of map.tiles.filter((tile) =>
            rectContains(placed.bounds, tile.x, tile.z),
          )) {
            expect(tile.buildingId).toBeUndefined();
            if (tile.propId !== undefined)
              expect(placed.structureIds).toContain(tile.propId);
          }
          for (const ship of map.dropships ?? []) {
            for (const tile of generators.flatMap((hook) => hook.tiles))
              expect(rectContains(ship.clearance, tile.x, tile.z)).toBe(false);
          }
        }
      },
      60_000,
    );
  }

  it("reproduces and serializes a composed facility exactly", () => {
    const input = recipe(MISSION_SITES["repellent-dispersal"]);
    const map = generateTacticalMap(input);
    expect(generateTacticalMap(input)).toEqual(map);
    expect(JSON.parse(JSON.stringify(map))).toEqual(map);
  });

  it("extends through an injected catalogue with new terrain, a rotated structure and a hook socket", () => {
    const site: MissionSiteDefinition = {
      id: "research-outpost",
      width: 16,
      depth: 16,
      margin: 2,
      surface: SurfaceIds.DIRT,
      terrain: [
        { rect: { x: 2, z: 2, w: 10, d: 10 }, surface: SurfaceIds.SIDEWALK },
      ],
      structures: [
        { kind: "installation-pump-house", x: 4, z: 4, rotation: 1 },
      ],
      objectives: [{ kind: HookKinds.GENERATOR, x: 2, z: 8 }],
    };
    const custom = {
      ...registries,
      missionSites: createRegistry("mission site", [site]),
    };
    const map = generateTacticalMap(recipe(site), { registries: custom });
    const piece = map.props.find(
      (prop) => prop.kind === "installation-pump-house",
    )!;
    expect(piece.rotation).toBe(1);
    expect(new Set(propTiles(piece).map((tile) => tile.x)).size).toBe(6);
    expect(new Set(propTiles(piece).map((tile) => tile.z)).size).toBe(8);
    expect(map.hooks.objectives).toHaveLength(1);
  });

  it("rejects unknown sites, undersized maps and overlapping content", () => {
    const input = recipe(MISSION_SITES.bank);
    expect(() =>
      generateTacticalMap({
        ...input,
        params: { ...input.params, site: "missing" },
      }),
    ).toThrow(/mission site/);
    expect(() =>
      generateTacticalMap({
        ...input,
        params: { ...input.params, size: { width: 16, depth: 16 } },
      }),
    ).toThrow(/does not fit/);
    expect(() =>
      validateSite(
        {
          ...MISSION_SITES.bank,
          objectives: [{ kind: HookKinds.GENERATOR, x: 8, z: 8 }],
        },
        registries,
      ),
    ).toThrow(/Blocked/);
    expect(() =>
      validateSite(
        {
          ...MISSION_SITES.bank,
          structures: [
            ...MISSION_SITES.bank.structures,
            MISSION_SITES.bank.structures[0]!,
          ],
        },
        registries,
      ),
    ).toThrow(/Overlapping/);
  });
});
