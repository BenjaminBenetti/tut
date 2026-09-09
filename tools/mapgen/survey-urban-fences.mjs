import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
const output = process.argv[2] ?? ".git/mapgen-1006/survey.jsonl";
const server = await createServer({
  root: resolve(process.env.SURVEY_SOURCE_ROOT ?? "."),
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
    { TileIndex },
    { ReachabilityService },
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
      "mapgen/service/tile-index",
      "mapgen/service/reachability-service",
    ].map(load),
  );
  const digest = (v) =>
    createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const key = (t) => `${t.x},${t.y},${t.z}`;
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
          const registries = createDefaultRegistries();
          const passes = createSettlementPasses();
          const { draft, diagnostics } = new PipelineMapGenerator(
            passes,
            registries,
          ).run(recipe.params, new Mulberry32Rng(hashSeed(seed)));
          const map = freezeDraft(draft, recipe, registries);
          const errors = validateTacticalMap(map, registries);
          if (errors.length)
            throw new Error(JSON.stringify({ recipe, errors }));
          const index = new TileIndex(map);
          const reachable = new ReachabilityService(
            index,
            map.connectors,
          ).reachableFrom(
            map.hooks.deployZones.flatMap((z) => z.tiles),
            1,
          );
          const fences = map.props.filter((p) => p.kind === "fence");
          const lookup = new Map(fences.map((p) => [key(p.tile), p]));
          const groups = [];
          for (const p of fences) {
            const dx = p.rotation % 2 === 0 ? 1 : 0,
              dz = 1 - dx;
            const prev = lookup.get(
              key({ ...p.tile, x: p.tile.x - dx, z: p.tile.z - dz }),
            );
            if (prev && prev.rotation % 2 === p.rotation % 2) continue;
            const group = [p];
            for (let n = 1; ; n++) {
              const next = lookup.get(
                key({
                  ...p.tile,
                  x: p.tile.x + dx * n,
                  z: p.tile.z + dz * n,
                }),
              );
              if (!next || next.rotation % 2 !== p.rotation % 2) break;
              group.push(next);
            }
            groups.push(group.length);
          }
          const withAccessibleCover = fences.filter((p) =>
            ["n", "e", "s", "w"].some((direction) => {
              const t = index.neighbour(p.tile, direction);
              return t !== undefined && reachable.has(index.keyOf(t));
            }),
          ).length;
          const metrics = computeMapMetrics(map);
          const ground = Array.from(
            { length: draft.width * draft.depth },
            (_, i) => {
              const x = i % draft.width,
                z = Math.floor(i / draft.width);
              return [
                draft.groundLevelAt(x, z),
                draft.groundSurfaceAt(x, z),
                draft.isRoad(x, z),
              ];
            },
          );
          rows.push({
            biome,
            settlement,
            size,
            seed,
            mapHash: digest(map),
            groundHash: digest(ground),
            buildingsHash: digest(map.buildings),
            otherPropsHash: digest(map.props.filter((p) => p.kind !== "fence")),
            fences: fences.length,
            groups,
            withAccessibleCover,
            fencesOnSlopes: fences.filter(
              (p) => index.getAt(p.tile)?.slope !== undefined,
            ).length,
            lowCoverPer100: metrics.lowCoverPer100,
            coverAdjacency: metrics.coverAdjacency,
            coveredShare: metrics.coveredShare,
            openTiles: metrics.openTiles,
            relocations: diagnostics.notes.filter((n) =>
              n.message.includes("relocated"),
            ).length,
            note: diagnostics.notes.find((n) => n.pass === "rural-fences")
              ?.message,
          });
        }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(
    JSON.stringify({
      maps: rows.length,
      fences: rows.reduce((n, r) => n + r.fences, 0),
      singletons: rows.reduce(
        (n, r) => n + r.groups.filter((n) => n === 1).length,
        0,
      ),
    }),
  );
} finally {
  await server.close();
}
