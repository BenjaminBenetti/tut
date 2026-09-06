import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const output = process.argv[2] ?? ".git/mapgen-915/survey.jsonl";
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const load = (p) => server.ssrLoadModule("/src/" + p + ".ts");
  const [
    { createDefaultRegistries },
    { createSettlementPasses },
    { PipelineMapGenerator },
    { Mulberry32Rng },
    { hashSeed },
    { DEFAULT_MISSION_HOOKS },
    { freezeDraft },
    { validateTacticalMap },
    { TileIndex },
    { ReachabilityService },
    { waterEdges },
  ] = await Promise.all(
    [
      "mapgen/service/default-registries",
      "mapgen/service/settlement-pipeline",
      "mapgen/service/pipeline-map-generator",
      "core/service/mulberry32-rng",
      "core/service/seed-hash",
      "mapgen/data/hook-requirements",
      "mapgen/service/draft-freezer",
      "mapgen/service/map-validator",
      "mapgen/service/tile-index",
      "mapgen/service/reachability-service",
      "mapgen/generator/road/road-builder",
    ].map(load),
  );
  const seeds = [
    "mc-opening-01",
    "mc-opening-02",
    "mc-opening-03",
    ...Array.from({ length: 8 }, (_, i) => `coast-control-${i}`),
    "coast-control-12",
  ];
  const rows = [];
  for (const settlement of ["town", "city"])
    for (const size of ["small", "medium", "large"])
      for (const seed of seeds) {
        const recipe = {
          seed,
          params: {
            archetype: "settlement",
            biome: "coastal",
            settlement,
            size,
            hooks: DEFAULT_MISSION_HOOKS,
            slopeShare: 1,
          },
        };
        const registries = createDefaultRegistries();
        const pair = [];
        let bedColumns = [];
        for (const original of [true, false]) {
          const passes = createSettlementPasses()
            .filter((p) => !original || p.id !== "waterfronts")
            .map((p) =>
              p.id !== "elevation"
                ? p
                : {
                    ...p,
                    run(ctx) {
                      const before = [];
                      for (let z = 0; z < ctx.draft.depth; z++)
                        for (let x = 0; x < ctx.draft.width; x++)
                          before.push(ctx.draft.groundLevelAt(x, z));
                      p.run(ctx);
                      const columns = [];
                      for (let z = 0; z < ctx.draft.depth; z++)
                        for (let x = 0; x < ctx.draft.width; x++) {
                          const y = ctx.draft.groundLevelAt(x, z),
                            surface = ctx.draft.groundSurfaceAt(x, z);
                          if (
                            y > before[z * ctx.draft.width + x] &&
                            ["grass", "dirt"].includes(surface)
                          )
                            columns.push({ x, y, z, surface });
                        }
                      if (original) bedColumns = columns;
                      else if (
                        JSON.stringify(columns) !== JSON.stringify(bedColumns)
                      )
                        throw new Error("Planted feature plan changed");
                    },
                  },
            );
          const result = new PipelineMapGenerator(passes, registries).run(
            recipe.params,
            new Mulberry32Rng(hashSeed(seed)),
          );
          const map = freezeDraft(result.draft, recipe, registries);
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
          let roadWaterEdges = 0;
          for (const tile of map.tiles.filter((t) => t.surface === "road"))
            for (const [dx, dz] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ])
              if (
                result.draft.inBounds(tile.x + dx, tile.z + dz) &&
                result.draft.groundSurfaceAt(tile.x + dx, tile.z + dz) ===
                  "water"
              )
                roadWaterEdges++;
          pair.push({ ...result, map, index, reach, roadWaterEdges });
        }
        const [before, after] = pair;
        const apron = before.map.tiles.filter(
          (t) =>
            t.surface === "road" &&
            after.index.getAt(t)?.surface === "sidewalk",
        );
        const heightOrSurfaceChanges = before.map.tiles.filter((t) => {
          const n = after.index.getAt(t);
          return (
            !n ||
            (n.surface !== t.surface &&
              !(t.surface === "road" && n.surface === "sidewalk"))
          );
        }).length;
        const preservedBeds = bedColumns.every(
          (t) => after.index.getAt(t)?.surface === t.surface,
        );
        if (
          heightOrSurfaceChanges ||
          !preservedBeds ||
          JSON.stringify(before.map.buildings) !==
            JSON.stringify(after.map.buildings)
        )
          throw new Error(
            "Unintended terrain/building/bed change: " + JSON.stringify(recipe),
          );
        const groups = [];
        const seen = new Set();
        for (const tile of apron) {
          const key = after.index.keyOf(tile);
          if (seen.has(key)) continue;
          const group = [tile];
          seen.add(key);
          for (const t of group)
            for (const n of apron)
              if (
                !seen.has(after.index.keyOf(n)) &&
                Math.abs(t.x - n.x) + Math.abs(t.z - n.z) === 1
              ) {
                seen.add(after.index.keyOf(n));
                group.push(n);
              }
          groups.push({
            columns: group.length,
            mechReachable: group.filter((t) =>
              after.reach.has(after.index.keyOf(t)),
            ).length,
            bounds: {
              x: Math.min(...group.map((t) => t.x)),
              z: Math.min(...group.map((t) => t.z)),
              w:
                Math.max(...group.map((t) => t.x)) -
                Math.min(...group.map((t) => t.x)) +
                1,
              d:
                Math.max(...group.map((t) => t.z)) -
                Math.min(...group.map((t) => t.z)) +
                1,
            },
          });
        }
        const row = {
          seed,
          settlement,
          size,
          shore: waterEdges(before.draft),
          apronGroups: groups,
          changedRoadColumns: apron.length,
          roadWaterEdgesBefore: before.roadWaterEdges,
          roadWaterEdgesAfter: after.roadWaterEdges,
          bedColumns: bedColumns.length,
          mechBedTilesBefore: bedColumns.filter((t) =>
            before.reach.has(before.index.keyOf(t)),
          ).length,
          mechBedTilesAfter: bedColumns.filter((t) =>
            after.reach.has(after.index.keyOf(t)),
          ).length,
          preservedBedGeometry: preservedBeds,
          unintendedHeightOrSurfaceChanges: heightOrSurfaceChanges,
          buildingsUnchanged: true,
          mapIdentical:
            JSON.stringify(before.map) === JSON.stringify(after.map),
          note: after.diagnostics.notes.find((n) => n.pass === "waterfronts")
            ?.message,
        };
        rows.push(row);
        if (
          (seed === "mc-opening-03" &&
            settlement === "city" &&
            size === "medium") ||
          (seed === "mc-opening-01" &&
            settlement === "town" &&
            size === "small") ||
          (seed === "coast-control-12" &&
            settlement === "town" &&
            size === "small")
        )
          console.log(JSON.stringify(row));
      }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(
    JSON.stringify({
      maps: rows.length,
      treatedMaps: rows.filter((r) => r.changedRoadColumns > 0).length,
      aprons: rows.reduce((n, r) => n + r.apronGroups.length, 0),
      inaccessibleAprons: rows.flatMap((r) =>
        r.apronGroups
          .filter((g) => g.mechReachable === 0)
          .map((g) => ({
            seed: r.seed,
            settlement: r.settlement,
            size: r.size,
            ...g,
          })),
      ),
      bedColumns: rows.reduce((n, r) => n + r.bedColumns, 0),
      mechBedTilesBefore: rows.reduce((n, r) => n + r.mechBedTilesBefore, 0),
      mechBedTilesAfter: rows.reduce((n, r) => n + r.mechBedTilesAfter, 0),
    }),
  );
} finally {
  await server.close();
}
