import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";

// The optional baseline must come from an independently executed checkout.
const output = process.argv[2];
if (!output) throw new Error("Expected output JSONL path");
const previous = process.argv[3]
  ? readFileSync(process.argv[3], "utf8").trim().split("\n").map(JSON.parse)
  : undefined;
const root = resolve(process.env.SURVEY_SOURCE_ROOT ?? process.cwd());
const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const [
    { generateTacticalMap },
    { DEFAULT_MISSION_HOOKS },
    { MAX_DEPLOYED_UNITS },
    { TileIndex },
    { allows, PassMask },
  ] = await Promise.all(
    [
      "mapgen/service/generate-tactical-map",
      "mapgen/data/hook-requirements",
      "overworld/model/deployment",
      "mapgen/service/tile-index",
      "mapgen/model/pass-mask",
    ].map((name) => server.ssrLoadModule(`/src/${name}.ts`)),
  );
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
          const map = generateTacticalMap(recipe);
          const index = new TileIndex(map);
          const zones = map.hooks.deployZones.map((zone) => {
            const tiles = [
              ...new Set(zone.tiles.map((coord) => index.getAt(coord))),
            ];
            assert(tiles.every(Boolean), "deploy coordinate is missing");
            const mech = tiles.filter((tile) =>
              allows(tile.pass, PassMask.MECH),
            ).length;
            const infantry = tiles.filter((tile) =>
              allows(tile.pass, PassMask.INFANTRY),
            ).length;
            assert(
              mech >= MAX_DEPLOYED_UNITS && infantry >= MAX_DEPLOYED_UNITS,
              "generated capacity below legal deployment",
            );
            return {
              entries: zone.tiles.length,
              distinct: tiles.length,
              mech,
              infantry,
            };
          });
          const key = `${biome}/${settlement}/${size}/${seed}`;
          const hash = createHash("sha256")
            .update(JSON.stringify(map))
            .digest("hex");
          rows.push({ key, head, hash, cap: MAX_DEPLOYED_UNITS, zones });
        }
  if (previous) {
    assert.equal(previous.length, rows.length);
    rows.forEach((row, i) => {
      assert.equal(row.key, previous[i].key);
      assert.equal(
        row.hash,
        previous[i].hash,
        `generated map changed: ${row.key}`,
      );
      assert.deepEqual(
        row.zones,
        previous[i].zones,
        `capacity changed: ${row.key}`,
      );
    });
  }
  writeFileSync(
    output,
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  console.log(
    JSON.stringify({
      maps: rows.length,
      zones: [...new Set(rows.flatMap((row) => row.zones.map(JSON.stringify)))],
      unchangedMaps: previous ? rows.length : undefined,
    }),
  );
} finally {
  await server.close();
}
