import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
const output = process.argv[2] ?? ".git/mapgen-936/preservation.jsonl";
const withdrawn = new Set([
  "terrace",
  "raised-park",
  "rail-embankment",
  "rubble-mound",
]);
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const load = (p) => server.ssrLoadModule("/src/" + p + ".ts");
  const [
    { createDefaultRegistries },
    { createRegistry },
    { createSettlementPasses },
    { PipelineMapGenerator },
    { Mulberry32Rng },
    { hashSeed },
    { DEFAULT_MISSION_HOOKS },
    { freezeDraft },
    { validateTacticalMap },
    { TileIndex },
    { ReachabilityService },
  ] = await Promise.all(
    [
      "mapgen/service/default-registries",
      "core/service/definition-registry",
      "mapgen/service/settlement-pipeline",
      "mapgen/service/pipeline-map-generator",
      "core/service/mulberry32-rng",
      "core/service/seed-hash",
      "mapgen/data/hook-requirements",
      "mapgen/service/draft-freezer",
      "mapgen/service/map-validator",
      "mapgen/service/tile-index",
      "mapgen/service/reachability-service",
    ].map(load),
  );
  const digest = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const rows = [];
  for (const biome of ["temperate", "snowy", "desert", "coastal"])
    for (const settlement of ["rural", "town", "city"])
      for (const size of ["small", "medium", "large"])
        for (const seed of [
          "mc-opening-01",
          "mc-opening-02",
          "mc-opening-03",
        ]) {
          const recipe = {
            seed,
            params: {
              archetype: "settlement",
              biome,
              settlement,
              size,
              hooks: DEFAULT_MISSION_HOOKS,
              slopeShare: 1,
            },
          };
          const pair = [];
          for (const original of [true, false]) {
            const registries = createDefaultRegistries();
            if (original)
              registries.elevatedFeatures = createRegistry(
                "elevated feature",
                registries.elevatedFeatures.values.map((f) => ({
                  ...f,
                  maxPerMap: withdrawn.has(f.id)
                    ? Number.MAX_SAFE_INTEGER
                    : f.maxPerMap,
                })),
              );
            let terrain, preFeature, postFeature;
            const snapshot = (draft) =>
              Array.from({ length: draft.width * draft.depth }, (_, i) => [
                draft.groundLevelAt(
                  i % draft.width,
                  Math.floor(i / draft.width),
                ),
                draft.groundSurfaceAt(
                  i % draft.width,
                  Math.floor(i / draft.width),
                ),
              ]);
            const passes = createSettlementPasses().map((p) =>
              !["terrain", "elevation"].includes(p.id)
                ? p
                : {
                    ...p,
                    /** Record terrain before and after the artificial feature pass. */
                    run(ctx) {
                      if (p.id === "elevation")
                        preFeature = snapshot(ctx.draft);
                      p.run(ctx);
                      if (p.id === "terrain") terrain = snapshot(ctx.draft);
                      else postFeature = snapshot(ctx.draft);
                    },
                  },
            );
            const { draft } = new PipelineMapGenerator(passes, registries).run(
              recipe.params,
              new Mulberry32Rng(hashSeed(seed)),
            );
            const map = freezeDraft(draft, recipe, registries);
            const errors = validateTacticalMap(map, registries);
            if (errors.length)
              throw new Error(JSON.stringify({ recipe, errors }));
            const index = new TileIndex(map),
              reach = new ReachabilityService(
                index,
                map.connectors,
              ).reachableFrom(
                map.hooks.deployZones.flatMap((h) => h.tiles),
                2,
              );
            const roadLevels = map.tiles
              .filter((t) => t.surface === "road")
              .map((t) => t.y)
              .sort((a, b) => a - b);
            const grade = roadLevels[Math.floor(roadLevels.length / 2)];
            pair.push({
              terrain,
              preFeature,
              postFeature,
              mapHash: digest(map),
              buildings: digest(map.buildings),
              outdoorAboveStreet:
                grade === undefined
                  ? null
                  : map.tiles.filter(
                      (t) =>
                        t.buildingId === undefined &&
                        t.y > grade &&
                        reach.has(index.keyOf(t)),
                    ).length,
              upperBuildingTiles: map.tiles.filter(
                (t) => t.buildingId !== undefined && (t.floorIndex ?? 0) > 0,
              ).length,
              roofTiles: map.tiles.filter((t) => t.surface === "roof").length,
              maxFloors: Math.max(
                0,
                ...map.buildings.map((b) => b.floors.length),
              ),
            });
          }
          const [before, after] = pair;
          const restoredColumns = before.postFeature.filter(
            (c, i) => c[0] !== after.postFeature[i][0],
          ).length;
          const originalGradeRecovered =
            digest(after.preFeature) === digest(after.postFeature);
          const naturalTerrainIdentical =
            digest(before.terrain) === digest(after.terrain);
          const unchangedOutsideWithdrawn = before.postFeature.every(
            (c, i) =>
              c[0] !== before.preFeature[i][0] ||
              c[1] !== before.preFeature[i][1] ||
              JSON.stringify(c) === JSON.stringify(after.postFeature[i]),
          );
          const mapIdentical = before.mapHash === after.mapHash;
          if (
            !originalGradeRecovered ||
            !naturalTerrainIdentical ||
            !unchangedOutsideWithdrawn ||
            before.buildings !== after.buildings ||
            (settlement !== "city" && !mapIdentical)
          )
            throw new Error("Preservation failure: " + JSON.stringify(recipe));
          rows.push({
            biome,
            settlement,
            size,
            seed,
            mapBefore: before.mapHash,
            mapAfter: after.mapHash,
            mapIdentical,
            naturalTerrainBefore: digest(before.terrain),
            naturalTerrainAfter: digest(after.terrain),
            originalGradeRecovered,
            unchangedOutsideWithdrawn,
            buildingsIdentical: before.buildings === after.buildings,
            restoredColumns,
            outdoorAboveStreetBefore: before.outdoorAboveStreet,
            outdoorAboveStreetAfter: after.outdoorAboveStreet,
            upperBuildingTilesBefore: before.upperBuildingTiles,
            upperBuildingTilesAfter: after.upperBuildingTiles,
            roofTilesBefore: before.roofTiles,
            roofTilesAfter: after.roofTiles,
            maxFloorsBefore: before.maxFloors,
            maxFloorsAfter: after.maxFloors,
          });
        }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  for (const settlement of ["rural", "town", "city"]) {
    const set = rows.filter((r) => r.settlement === settlement);
    console.log(
      JSON.stringify({
        settlement,
        maps: set.length,
        identical: set.filter((r) => r.mapIdentical).length,
        restoredColumns: set.reduce((n, r) => n + r.restoredColumns, 0),
        outdoorAboveStreetBefore: set.reduce(
          (n, r) => n + (r.outdoorAboveStreetBefore ?? 0),
          0,
        ),
        outdoorAboveStreetAfter: set.reduce(
          (n, r) => n + (r.outdoorAboveStreetAfter ?? 0),
          0,
        ),
        upperBuildingTilesBefore: set.reduce(
          (n, r) => n + r.upperBuildingTilesBefore,
          0,
        ),
        upperBuildingTilesAfter: set.reduce(
          (n, r) => n + r.upperBuildingTilesAfter,
          0,
        ),
        roofTilesBefore: set.reduce((n, r) => n + r.roofTilesBefore, 0),
        roofTilesAfter: set.reduce((n, r) => n + r.roofTilesAfter, 0),
      }),
    );
  }
} finally {
  await server.close();
}
