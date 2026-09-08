import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const out = "docs/design/diagnostics/945";
mkdirSync(out, { recursive: true });
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const load = (p) => server.ssrLoadModule("/src/" + p + ".ts");
  const [
    { createSettlementPasses },
    { createDefaultRegistries },
    { PipelineMapGenerator },
    { Mulberry32Rng },
    { hashSeed },
    { DEFAULT_MISSION_HOOKS },
    { freezeDraft },
  ] = await Promise.all(
    [
      "mapgen/service/settlement-pipeline",
      "mapgen/service/default-registries",
      "mapgen/service/pipeline-map-generator",
      "core/service/mulberry32-rng",
      "core/service/seed-hash",
      "mapgen/data/hook-requirements",
      "mapgen/service/draft-freezer",
    ].map(load),
  );
  const result = [];
  for (const c of [
    {
      biome: "coastal",
      settlement: "rural",
      size: "small",
      seed: "mc-opening-01",
      focus: { x: 5, z: 22 },
    },
    {
      biome: "snowy",
      settlement: "city",
      size: "medium",
      seed: "mc-opening-02",
      focus: { x: 56, z: 62 },
    },
    {
      biome: "snowy",
      settlement: "rural",
      size: "small",
      seed: "mc-resume-01",
      focus: { x: 13, z: 24 },
    },
  ]) {
    let previous = [],
      paint = [];
    const changes = [];
    const passes = createSettlementPasses().map((p) => ({
      id: p.id,
      requires: p.requires,
      provides: p.provides,
      run(context) {
        p.run(context);
        const d = context.draft;
        const next = Array.from({ length: d.width * d.depth }, (_, i) =>
          d.groundSurfaceAt(i % d.width, Math.floor(i / d.width)),
        );
        let changed = 0;
        next.forEach((surface, i) => {
          if (previous[i] !== surface) {
            paint[i] = p.id;
            changed++;
          }
        });
        changes.push({ pass: p.id, painted: changed });
        previous = next;
      },
    }));
    const registries = createDefaultRegistries();
    const recipe = {
      seed: c.seed,
      params: {
        archetype: "settlement",
        ...c,
        hooks: DEFAULT_MISSION_HOOKS,
        slopeShare: 1,
      },
    };
    delete recipe.params.focus;
    delete recipe.params.seed;
    const { draft } = new PipelineMapGenerator(
      passes,
      registries,
    ).run(recipe.params, new Mulberry32Rng(hashSeed(c.seed)));
    const map = freezeDraft(draft, recipe, registries);
    const natural = new Set(["grass", "sand", "dirt", "rock", "snow"]);
    const edges = {};
    let count = 0;
    const local = {};
    for (let z = 0; z < draft.depth; z++)
      for (let x = 0; x < draft.width; x++)
        for (const [dx, dz] of [
          [1, 0],
          [0, 1],
        ]) {
          const nx = x + dx,
            nz = z + dz;
          if (
            !draft.inBounds(nx, nz) ||
            draft.isCovered(x, z) ||
            draft.isCovered(nx, nz)
          )
            continue;
          const a = draft.groundSurfaceAt(x, z),
            b = draft.groundSurfaceAt(nx, nz);
          if (a === b || !natural.has(a) || !natural.has(b)) continue;
          const who = [paint[z * draft.width + x], paint[nz * draft.width + nx]]
            .sort()
            .join("/");
          edges[who] = (edges[who] ?? 0) + 1;
          count++;
          if (Math.abs(x - c.focus.x) <= 12 && Math.abs(z - c.focus.z) <= 12)
            local[who] = (local[who] ?? 0) + 1;
        }
    const mapHash = createHash("sha256")
      .update(JSON.stringify(map))
      .digest("hex");
    result.push({
      recipe,
      changes,
      naturalMaterialEdges: count,
      lastPaintPassPairs: edges,
      focusRegionPassPairs: local,
      mapHash,
      tiles: map.tiles.length,
      props: map.props.length,
      buildings: map.buildings.length,
      connectors: map.connectors.length,
    });
  }
  writeFileSync(out + "/provenance.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await server.close();
}
