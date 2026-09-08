import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { format } from "prettier";
const output = process.argv[2] ?? ".git/mapgen-959/before.json";
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
    { computeMapMetrics },
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
      "mapgen/service/map-metrics",
    ].map(load),
  );
  const digest = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const rows = [];
  for (const biome of ["temperate", "snowy", "desert", "coastal"])
    for (const settlement of ["rural", "town", "city"])
      for (const size of ["small", "medium", "large"])
        for (const seed of ["mc-resume-01", "mc-resume-02", "mc-resume-03"]) {
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
          const registries = createDefaultRegistries();
          let original = [],
            overlap = 0,
            roadColumns = 0;
          const passes = createSettlementPasses().map((pass) => ({
            id: pass.id,
            requires: pass.requires,
            provides: pass.provides,
            /** Observe what each road column looked like before it was painted. */
            run(context) {
              const d = context.draft;
              if (pass.id === "roads")
                original = Array.from({ length: d.width * d.depth }, (_, i) =>
                  d.groundSurfaceAt(i % d.width, Math.floor(i / d.width)),
                );
              pass.run(context);
              if (pass.id === "roads")
                for (let z = 0; z < d.depth; z++)
                  for (let x = 0; x < d.width; x++) {
                    if (!d.isRoad(x, z)) continue;
                    roadColumns++;
                    if (original[z * d.width + x] === d.groundSurfaceAt(x, z))
                      overlap++;
                  }
            },
          }));
          const { draft, diagnostics } = new PipelineMapGenerator(
            passes,
            registries,
          ).run(recipe.params, new Mulberry32Rng(hashSeed(seed)));
          const map = freezeDraft(draft, recipe, registries);
          const errors = validateTacticalMap(map, registries);
          if (errors.length)
            throw new Error(JSON.stringify({ recipe, errors }));
          let indistinguishableEdges = 0;
          for (let z = 0; z < draft.depth; z++)
            for (let x = 0; x < draft.width; x++) {
              if (!draft.isRoad(x, z)) continue;
              for (const [dx, dz] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ]) {
                const nx = x + dx,
                  nz = z + dz;
                if (
                  draft.inBounds(nx, nz) &&
                  !draft.isRoad(nx, nz) &&
                  !draft.isCovered(nx, nz) &&
                  draft.groundSurfaceAt(nx, nz) === draft.groundSurfaceAt(x, z)
                )
                  indistinguishableEdges++;
              }
            }
          const withoutSurface = map.tiles.map((tile) => {
            const result = { ...tile };
            delete result.surface;
            return result;
          });
          const offRoadTiles = map.tiles.filter((t) => !draft.isRoad(t.x, t.z));
          rows.push({
            recipe,
            roadColumns,
            paintAlreadyMatchedGround: overlap,
            indistinguishableEdges,
            completeMapHash: digest(map),
            nonSurfaceMapHash: digest({ ...map, tiles: withoutSurface }),
            offRoadTilesHash: digest(offRoadTiles),
            roadGeometryHash: digest(draft.roads),
            trailSurfaces: [
              ...new Set(
                map.tiles
                  .filter((t) => draft.isRoad(t.x, t.z))
                  .map((t) => t.surface),
              ),
            ],
            metrics: computeMapMetrics(map),
            relocations: diagnostics.notes.filter((n) =>
              n.message.includes("relocated"),
            ).length,
          });
        }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, await format(JSON.stringify(rows), { parser: "json" }));
  console.log(
    JSON.stringify(
      rows
        .filter(
          (r) =>
            r.recipe.seed === "mc-resume-01" &&
            r.recipe.params.settlement === "rural",
        )
        .map(
          ({
            recipe,
            roadColumns,
            paintAlreadyMatchedGround,
            indistinguishableEdges,
          }) => ({
            recipe,
            roadColumns,
            paintAlreadyMatchedGround,
            indistinguishableEdges,
          }),
        ),
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
