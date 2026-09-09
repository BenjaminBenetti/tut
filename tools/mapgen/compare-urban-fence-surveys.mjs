import { readFileSync, writeFileSync } from "node:fs";

/** Read one independently generated JSONL survey. */
function read(path) {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
/** Population counts and local cover/access measures from the shipped services. */
function measure(rows) {
  return {
    fences: rows.reduce((n, r) => n + r.fences, 0),
    singletons: rows.reduce(
      (n, r) => n + r.groups.filter((n) => n === 1).length,
      0,
    ),
    coverAdjacency:
      rows.reduce((n, r) => n + r.coverAdjacency, 0) / rows.length,
    withAccessibleCover: rows.reduce((n, r) => n + r.withAccessibleCover, 0),
    relocations: rows.reduce((n, r) => n + r.relocations, 0),
  };
}
const [beforeFile, afterFile, output] = process.argv.slice(2);
if (!beforeFile || !afterFile || !output)
  throw new Error("Pass before.jsonl after.jsonl output.json");
const before = read(beforeFile),
  after = read(afterFile);
if (before.length !== 108 || after.length !== before.length)
  throw new Error("Expected all 108 paired recipes");
for (let i = 0; i < before.length; i++) {
  const a = before[i],
    b = after[i];
  const identity = ["biome", "settlement", "size", "seed"];
  if (identity.some((k) => a[k] !== b[k]))
    throw new Error("Recipe mismatch at " + i);
  if (
    ["groundHash", "buildingsHash", "otherPropsHash"].some((k) => a[k] !== b[k])
  )
    throw new Error("Terrain/building/other-prop drift at " + i);
  if (a.settlement === "rural" && a.mapHash !== b.mapHash)
    throw new Error("Accepted rural map changed at " + i);
  if (
    b.fences > a.fences ||
    b.groups.some((n) => n < 3 || n > 10) ||
    b.fencesOnSlopes > 0
  )
    throw new Error("Unsupported fence allocation at " + i);
}
const groups = [];
for (const settlement of ["rural", "town", "city"])
  for (const biome of ["temperate", "snowy", "desert", "coastal"]) {
    const belongs = (row) =>
      row.settlement === settlement && row.biome === biome;
    const a = before.filter(belongs),
      b = after.filter(belongs);
    groups.push({
      settlement,
      biome,
      maps: a.length,
      before: measure(a),
      after: measure(b),
    });
  }
writeFileSync(
  output,
  JSON.stringify(
    {
      maps: before.length,
      allTerrainBuildingsAndNonFencePropsMatch: true,
      all36RuralMapsMatch: true,
      allPanelsSupportedInRuns: true,
      groups,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    maps: before.length,
    before: measure(before),
    after: measure(after),
  }),
);
