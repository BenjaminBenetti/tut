import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
const output = process.argv[2] ?? ".git/mapgen-917/survey.jsonl";
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
          const pair = [];
          for (const before of [true, false]) {
            const registries = createDefaultRegistries();
            // Omitting the sole new pass reconstructs baseline 360778a.
            const passes = createSettlementPasses().filter(
              (p) => !before || p.id !== "rural-fences",
            );
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
            pair.push({
              mapHash: digest(map),
              groundHash: digest(ground),
              buildingsHash: digest(map.buildings),
              otherPropsHash: digest(
                map.props.filter((p) => p.kind !== "fence"),
              ),
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
            if (
              biome === "coastal" &&
              settlement === "rural" &&
              size === "small" &&
              seed === "mc-opening-01"
            )
              writeFileSync(
                `.git/mapgen-917/reported-${before ? "before" : "after"}-map.json`,
                JSON.stringify(map),
              );
          }
          const [before, after] = pair;
          if (
            before.groundHash !== after.groundHash ||
            before.buildingsHash !== after.buildingsHash ||
            before.otherPropsHash !== after.otherPropsHash ||
            (settlement !== "rural" && before.mapHash !== after.mapHash)
          )
            throw new Error("Preservation failure: " + JSON.stringify(recipe));
          if (
            settlement === "rural" &&
            (after.fences > before.fences ||
              after.groups.some((n) => n < 3) ||
              after.fencesOnSlopes > 0)
          )
            throw new Error(
              "Fence placement failure: " +
                JSON.stringify({ recipe, before, after }),
            );
          rows.push({ biome, settlement, size, seed, before, after });
        }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  for (const biome of ["temperate", "snowy", "desert", "coastal"]) {
    const group = rows.filter(
      (r) => r.biome === biome && r.settlement === "rural",
    );
    const summary = {};
    for (const phase of ["before", "after"])
      summary[phase] = {
        fences: group.reduce((n, r) => n + r[phase].fences, 0),
        isolated: group.reduce(
          (n, r) => n + r[phase].groups.filter((g) => g === 1).length,
          0,
        ),
        coverAdjacency:
          group.reduce((n, r) => n + r[phase].coverAdjacency, 0) / group.length,
        lowCoverPer100:
          group.reduce((n, r) => n + r[phase].lowCoverPer100, 0) / group.length,
        withAccessibleCover: group.reduce(
          (n, r) => n + r[phase].withAccessibleCover,
          0,
        ),
      };
    console.log(JSON.stringify({ biome, ...summary }));
  }
} finally {
  await server.close();
}
