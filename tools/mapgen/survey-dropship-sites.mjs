import { createServer } from "vite";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { format } from "prettier";
const output = process.argv[2] ?? ".git/mapgen-911/survey-after.json";
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
    { hatchSpace },
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
      "mapgen/generator/placer/placer-support",
    ].map(load),
  );
  const digest = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const ground = (d) =>
    Array.from({ length: d.width * d.depth }, (_, i) => ({
      y: d.groundLevelAt(i % d.width, Math.floor(i / d.width)),
      surface: d.groundSurfaceAt(i % d.width, Math.floor(i / d.width)),
      road: d.isRoad(i % d.width, Math.floor(i / d.width)),
    }));
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
          let roadsHash,
            roadsGround = [],
            reservationCuts = [];
          const passes = createSettlementPasses().map((pass) => ({
            id: pass.id,
            requires: pass.requires,
            provides: pass.provides,
            /** Observe the real pass boundary without replacing generation. */
            run(context) {
              pass.run(context);
              if (pass.id === "roads") {
                roadsGround = ground(context.draft);
                roadsHash = digest({
                  ground: roadsGround,
                  roads: context.draft.roads,
                  connectors: context.draft.connectors,
                });
              }
              if (pass.id === "dropship-sites") {
                reservationCuts = ground(context.draft).flatMap((p, i) =>
                  p.y === roadsGround[i].y
                    ? []
                    : [
                        {
                          x: i % context.draft.width,
                          z: Math.floor(i / context.draft.width),
                          before: roadsGround[i].y,
                          after: p.y,
                        },
                      ],
                );
              }
            },
          }));
          const registries = createDefaultRegistries();
          const { draft, diagnostics } = new PipelineMapGenerator(
            passes,
            registries,
          ).run(recipe.params, new Mulberry32Rng(hashSeed(seed)));
          const map = freezeDraft(draft, recipe, registries);
          const violations = validateTacticalMap(map, registries);
          const index = new TileIndex(map),
            reach = new ReachabilityService(index, map.connectors);
          rows.push({
            recipe,
            mapHash: digest(map),
            roadsPassHash: roadsHash,
            roadSegmentsHash: digest(draft.roads),
            roadPaintHash: digest(
              ground(draft).flatMap((p, i) =>
                p.road ? [{ column: i, ...p }] : [],
              ),
            ),
            usedExistingGrade: reservationCuts.length === 0,
            reservationCuts,
            sites: map.dropships ?? [],
            deploy: map.hooks.deployZones,
            metrics: computeMapMetrics(map),
            minimumHatchSpace: Math.min(
              ...map.hooks.objectives.map((h) =>
                hatchSpace({ index, reach }, h.tiles[0], h.meta.hatchRadius, 1),
              ),
            ),
            violations,
            notes: diagnostics.notes.filter((n) =>
              ["dropship-sites", "connectivity"].includes(n.pass),
            ),
            buildings: map.buildings.length,
            props: map.props.length,
          });
        }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, await format(JSON.stringify(rows), { parser: "json" }));
  console.log(
    JSON.stringify(
      {
        maps: rows.length,
        withShips: rows.filter((r) => r.sites.length === 1).length,
        ungraded: rows.filter((r) => r.reservationCuts.length === 0).length,
        raised: rows
          .flatMap((r) => r.reservationCuts)
          .filter((c) => c.after > c.before).length,
        maxCut: Math.max(
          0,
          ...rows
            .flatMap((r) => r.reservationCuts)
            .map((c) => c.before - c.after),
        ),
        violations: rows
          .filter((r) => r.violations.length > 0)
          .map((r) => ({ recipe: r.recipe, violations: r.violations })),
        cramped: rows
          .filter((r) => r.minimumHatchSpace < 6)
          .map((r) => r.recipe),
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
