import { createServer } from "vite";
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
const source = process.env.SURVEY_SOURCE_ROOT ?? process.cwd();
const phase = process.argv[2] ?? "before";
const server = await createServer({
  root: source,
  cacheDir: "/workspaces/tut/.git/mapgen-960/survey-cache",
  server: { middlewareMode: true, watch: null, hmr: false },
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
  const hash = (x) =>
    createHash("sha256").update(JSON.stringify(x)).digest("hex");
  const rows = [];
  const maps = {};
  for (const biome of ["temperate", "snowy", "desert", "coastal"])
    for (const settlement of ["rural", "town", "city"])
      for (const size of ["small", "medium", "large"])
        for (const seed of ["mc-resume-01", "mc-opening-02", "mc-opening-03"]) {
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
          const { draft, diagnostics } = new PipelineMapGenerator(
            createSettlementPasses().filter(
              (pass) => phase !== "before" || pass.id !== "yard-arrangements",
            ),
            registries,
          ).run(recipe.params, new Mulberry32Rng(hashSeed(seed)));
          const map = freezeDraft(draft, recipe, registries);
          const errors = validateTacticalMap(map, registries);
          if (errors.length)
            throw new Error(JSON.stringify({ recipe, errors }));
          const id = [biome, settlement, size, seed].join("/");
          const terrain = map.tiles.map(
            ({
              x,
              y,
              z,
              surface,
              walls,
              buildingId,
              floorIndex,
              roomId,
              slope,
              naturalEdge,
            }) => ({
              x,
              y,
              z,
              surface,
              walls,
              buildingId,
              floorIndex,
              roomId,
              slope,
              naturalEdge,
            }),
          );
          const row = {
            id,
            recipe,
            mapHash: hash(map),
            hooks: hash(map.hooks),
            terrain: hash(terrain),
            buildings: hash(map.buildings),
            roads: hash(draft.roads),
            connectors: hash(map.connectors),
            props: map.props,
            tiles: map.tiles.map(({ x, y, z, pass, propId }) => ({
              x,
              y,
              z,
              pass,
              propId,
            })),
            yardPropIds: [...(draft.yardPropIds ?? [])],
            notes: diagnostics,
            metrics: computeMapMetrics(map),
          };
          rows.push(row);
          if (
            biome === "temperate" &&
            settlement === "city" &&
            size === "medium"
          )
            maps[seed] = map;
          console.log(id);
        }
  const dir = "/workspaces/tut/.git/mapgen-960";
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${phase}-survey.json`, JSON.stringify(rows));
  writeFileSync(`${dir}/${phase}-maps.json`, JSON.stringify(maps));
  if (phase === "after") {
    const baseline = JSON.parse(
      readFileSync(`${dir}/before-survey.json`, "utf8"),
    );
    const paired = rows.map((a, i) => {
      const b = baseline[i];
      if (a.id !== b.id) throw Error("recipe order changed");
      const yard = new Set(a.yardPropIds);
      const mutable = (p) =>
        yard.has(p.id) && ["crate", "sandbags", "barrier"].includes(p.kind);
      const retained = b.props.filter((p) => !mutable(p));
      const retainedIds = new Set(retained.map((p) => p.id));
      return {
        id: a.id,
        mapUnchanged: a.mapHash === b.mapHash,
        terrainUnchanged: a.terrain === b.terrain,
        hooksUnchanged: a.hooks === b.hooks,
        buildingsUnchanged: a.buildings === b.buildings,
        roadsUnchanged: a.roads === b.roads,
        connectorsUnchanged: a.connectors === b.connectors,
        otherPropsUnchanged:
          hash(retained) === hash(a.props.filter((p) => retainedIds.has(p.id))),
        budget: b.props.filter(mutable).length,
        newProps: a.props.filter(
          (p) => !b.props.some((old) => old.id === p.id),
        ),
        propsBefore: b.props.length,
        propsAfter: a.props.length,
        metricsBefore: b.metrics,
        metricsAfter: a.metrics,
      };
    });
    writeFileSync(`${dir}/paired-survey.json`, JSON.stringify(paired, null, 2));
    console.log(
      JSON.stringify({
        maps: paired.length,
        unchanged: paired.filter((r) => r.mapUnchanged).length,
        changedPreservation: paired
          .filter(
            (r) =>
              !r.terrainUnchanged ||
              !r.buildingsUnchanged ||
              !r.roadsUnchanged ||
              !r.connectorsUnchanged ||
              !r.otherPropsUnchanged,
          )
          .map((r) => r.id),
      }),
    );
  }
} finally {
  await server.close();
}
