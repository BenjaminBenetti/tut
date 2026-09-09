import { createServer } from "vite";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const output = process.argv[2];
if (!output)
  throw new Error(
    "Usage: node tools/mapgen/survey-connectivity-kerbs.mjs OUTPUT.jsonl",
  );
const server = await createServer({
  server: { middlewareMode: true, watch: null, hmr: false },
  appType: "custom",
});
try {
  const load = (path) => server.ssrLoadModule(`/src/${path}.ts`);
  const [
    { generateTacticalMapWithDiagnostics },
    { DEFAULT_MISSION_HOOKS },
    { TileIndex },
    { DIRECTIONS },
    { oppositeDirection, stepGridPos },
    { SurfaceIds },
    { PropKindIds },
  ] = await Promise.all([
    load("mapgen/service/generate-tactical-map"),
    load("mapgen/data/hook-requirements"),
    load("mapgen/service/tile-index"),
    load("core/model/direction"),
    load("core/service/grid-math"),
    load("mapgen/data/surfaces"),
    load("mapgen/data/props"),
  ]);
  const rows = [];
  for (const size of ["small", "medium", "large"])
    for (const biome of ["temperate", "snowy", "desert", "coastal"])
      for (const settlement of ["rural", "town", "city"])
        for (let i = 0; i < 3; i++) {
          const seed = `sweep-${size}/${biome}/${settlement}/${i}`;
          const { map, diagnostics } = generateTacticalMapWithDiagnostics({
            seed,
            params: {
              archetype: "settlement",
              biome,
              settlement,
              size,
              hooks: DEFAULT_MISSION_HOOKS,
            },
          });
          const index = new TileIndex(map);
          const joined = new Set(
            map.connectors.flatMap((c) => [
              pair(c.from, c.to),
              pair(c.to, c.from),
            ]),
          );
          let barePavedEdges = 0;
          for (const tile of map.tiles) {
            if (
              tile.buildingId !== undefined ||
              ![SurfaceIds.ROAD, SurfaceIds.SIDEWALK].includes(tile.surface)
            )
              continue;
            for (const side of DIRECTIONS) {
              const next = stepGridPos(tile, side);
              const other = index
                .column(next.x, next.z)
                .find((t) => t.buildingId === undefined);
              if (!other || Math.abs(other.y - tile.y) < 2) continue;
              if (
                tile.walls[side] === undefined &&
                other.walls[oppositeDirection(side)] === undefined &&
                !joined.has(pair(tile, other))
              )
                barePavedEdges++;
            }
          }
          const walledRamps = [];
          for (const c of map.connectors.filter((c) => c.kind === "ramp")) {
            const side = DIRECTIONS.find((d) => {
              const next = stepGridPos(c.from, d);
              return next.x === c.to.x && next.z === c.to.z;
            });
            if (!side) continue;
            const fromWall = index.getAt(c.from)?.walls[side];
            const toWall = index.getAt(c.to)?.walls[oppositeDirection(side)];
            if (fromWall !== undefined || toWall !== undefined)
              walledRamps.push({ from: c.from, to: c.to, fromWall, toWall });
          }
          const fences = map.props.filter((p) => p.kind === PropKindIds.FENCE);
          rows.push({
            seed,
            mapSha256: hash(map),
            fenceSha256: hash(fences),
            fences: fences.length,
            ramps: map.connectors.filter((c) => c.kind === "ramp").length,
            repairs: diagnostics.notes.filter(
              (n) =>
                n.pass === "connectivity" && n.message.includes("added ramp"),
            ),
            barePavedEdges,
            walledRamps,
          });
        }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(
    output,
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  console.log(
    JSON.stringify({
      maps: rows.length,
      repairRamps: rows.reduce((n, row) => n + row.repairs.length, 0),
      walledRamps: rows.reduce((n, row) => n + row.walledRamps.length, 0),
      barePavedEdges: rows.reduce((n, row) => n + row.barePavedEdges, 0),
    }),
  );
} finally {
  await server.close();
}

/** Directed ground-column edge, matching the paved-edge generation invariant. */
function pair(a, b) {
  return `${a.x},${a.z}|${b.x},${b.z}`;
}

/** Exact frozen-map/prop fingerprint; diagnostic timings are excluded. */
function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
