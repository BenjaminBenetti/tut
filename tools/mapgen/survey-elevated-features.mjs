import { createServer } from "vite";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
const output = process.argv[2] ?? ".git/mapgen-910/survey.jsonl";
const uncapped = process.argv.includes("--uncapped");
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
  ] = await Promise.all([
    load("mapgen/service/default-registries"),
    load("mapgen/service/settlement-pipeline"),
    load("mapgen/service/pipeline-map-generator"),
    load("core/service/mulberry32-rng"),
    load("core/service/seed-hash"),
    load("mapgen/data/hook-requirements"),
    load("mapgen/service/draft-freezer"),
    load("mapgen/service/map-validator"),
    load("mapgen/service/tile-index"),
    load("mapgen/service/reachability-service"),
  ]);
  const { createRegistry } = await load("core/service/definition-registry");
  const rows = [];
  for (const biome of ["temperate", "snowy", "desert", "coastal"])
    for (const settlement of ["rural", "town", "city"])
      for (const size of ["small", "medium", "large"])
        for (let i = 1; i <= 3; i++) {
          const seed = `mc-opening-0${i}`;
          const params = {
            archetype: "settlement",
            biome,
            settlement,
            size,
            hooks: DEFAULT_MISSION_HOOKS,
            slopeShare: 1,
          };
          const registries = createDefaultRegistries();
          if (uncapped)
            registries.elevatedFeatures = createRegistry(
              "elevated feature",
              registries.elevatedFeatures.values.map((f) => ({
                ...f,
                maxPerMap: Number.MAX_SAFE_INTEGER,
              })),
            );
          const features = [];
          let columns;
          const passes = createSettlementPasses().map((pass) =>
            pass.id !== "elevation"
              ? pass
              : {
                  id: pass.id,
                  requires: pass.requires,
                  provides: pass.provides,
                  /** Records planned columns, then counts only those realised in the final map. */
                  run(ctx) {
                    const setLevel = ctx.draft.setGroundLevel.bind(ctx.draft);
                    const wrapped = new Proxy(ctx.rng, {
                      get(target, key) {
                        if (key === "pickWeighted")
                          return (...args) => {
                            const f = target.pickWeighted(...args);
                            columns = [];
                            features.push({
                              id: f.id,
                              surface: f.surface,
                              columns,
                            });
                            return f;
                          };
                        const value = target[key];
                        return typeof value === "function"
                          ? value.bind(target)
                          : value;
                      },
                    });
                    ctx.draft.setGroundLevel = (x, z, y) => {
                      if (y > ctx.draft.groundLevelAt(x, z))
                        columns?.push({
                          x,
                          z,
                          y,
                          before: ctx.draft.groundLevelAt(x, z),
                        });
                      setLevel(x, z, y);
                    };
                    try {
                      pass.run({ ...ctx, rng: wrapped });
                    } finally {
                      ctx.draft.setGroundLevel = setLevel;
                    }
                  },
                },
          );
          const { draft, diagnostics } = new PipelineMapGenerator(
            passes,
            registries,
          ).run(params, new Mulberry32Rng(hashSeed(seed)));
          const map = freezeDraft(draft, { seed, params }, registries);
          const errors = validateTacticalMap(map, registries);
          if (errors.length)
            throw new Error(
              JSON.stringify({ seed, biome, settlement, size, errors }),
            );
          const index = new TileIndex(map),
            reach = new ReachabilityService(index, map.connectors);
          const mech = reach.reachableFrom(
            map.hooks.deployZones.flatMap((h) => h.tiles),
            2,
          );
          const placed = features
            .filter((f) =>
              f.columns.some((c) => draft.groundLevelAt(c.x, c.z) === c.y),
            )
            .map((f) => {
              const tiles = f.columns
                .map((c) => index.getAt(c))
                .filter(Boolean);
              const xs = f.columns.map((c) => c.x),
                zs = f.columns.map((c) => c.z);
              return {
                id: f.id,
                surface: f.surface,
                columns: f.columns.length,
                bounds: {
                  x: Math.min(...xs),
                  z: Math.min(...zs),
                  w: Math.max(...xs) - Math.min(...xs) + 1,
                  d: Math.max(...zs) - Math.min(...zs) + 1,
                  y: f.columns[0].y,
                },
                mechReachable: tiles.filter((t) => mech.has(index.keyOf(t)))
                  .length,
                props: tiles
                  .filter((t) => t.propId)
                  .map((t) => map.props.find((p) => p.id === t.propId)?.kind),
              };
            });
          const counts = {};
          for (const f of placed) counts[f.id] = (counts[f.id] ?? 0) + 1;
          const paved = placed.filter((f) => f.surface === "sidewalk");
          const beds = placed.filter(
            (f) => f.surface === "grass" || f.surface === "dirt",
          );
          const row = {
            seed,
            biome,
            settlement,
            size,
            counts,
            paved: paved.length,
            pavedColumns: paved.reduce((n, f) => n + f.columns, 0),
            beds: beds.length,
            bedColumns: beds.reduce((n, f) => n + f.columns, 0),
            mechBedTiles: beds.reduce((n, f) => n + f.mechReachable, 0),
            mechRaisedTiles: placed.reduce((n, f) => n + f.mechReachable, 0),
            plantedBeds: beds.filter((f) =>
              f.props.some((p) => p?.startsWith("tree-") || p === "boulder"),
            ).length,
            features: placed,
            note: diagnostics.notes.find((n) => n.pass === "elevation")
              ?.message,
          };
          rows.push(row);
          if (settlement === "city" && size === "small")
            console.log(
              JSON.stringify({
                biome,
                size,
                seed,
                paved: row.paved,
                beds: row.beds,
                counts,
              }),
            );
        }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(
    output,
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  for (const settlement of ["rural", "town", "city"])
    for (const biome of ["temperate", "snowy", "desert", "coastal"]) {
      const set = rows.filter(
        (r) => r.settlement === settlement && r.biome === biome,
      );
      console.log(
        JSON.stringify({
          settlement,
          biome,
          maps: set.length,
          withPaved: set.filter((r) => r.paved > 0).length,
          paved: set.reduce((s, r) => s + r.paved, 0),
          beds: set.reduce((s, r) => s + r.beds, 0),
          mechBedTiles: set.reduce((s, r) => s + r.mechBedTiles, 0),
        }),
      );
    }
} finally {
  await server.close();
}
