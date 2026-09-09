import { readFileSync, writeFileSync } from "node:fs";
import { format } from "prettier";
const directory = "docs/design/diagnostics/911/generated";
const before = JSON.parse(
  readFileSync(process.argv[2] ?? `${directory}/survey-before.json`, "utf8"),
);
const after = JSON.parse(
  readFileSync(process.argv[3] ?? `${directory}/survey-after.json`, "utf8"),
);
if (
  before.length !== after.length ||
  before.some(
    (row, i) => JSON.stringify(row.recipe) !== JSON.stringify(after[i].recipe),
  )
)
  throw new Error("Survey recipes differ");
const mean = (rows, key) =>
  rows.reduce((sum, row) => sum + row.metrics[key], 0) / rows.length;
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const inset = (site, size) => {
  const extent =
    typeof size === "object"
      ? size
      : {
          width: { small: 48, medium: 72, large: 96 }[size],
          depth: { small: 48, medium: 72, large: 96 }[size],
        };
  const r = site.clearance;
  return {
    n: r.z,
    w: r.x,
    s: extent.depth - r.z - r.d,
    e: extent.width - r.x - r.w,
  }[site.facing];
};
const report = {
  maps: after.length,
  mismatches: Object.fromEntries(
    ["roadsPassHash", "roadSegmentsHash", "roadPaintHash"].map((key) => [
      key,
      before.filter((row, i) => row[key] !== after[i][key]).length,
    ]),
  ),
  withAircraft: after.filter((row) => row.sites.length === 1).length,
  ungraded: after.filter((row) => row.usedExistingGrade).length,
  cutColumns: after.reduce((sum, row) => sum + row.reservationCuts.length, 0),
  maxCut: Math.max(
    0,
    ...after.flatMap((row) =>
      row.reservationCuts.map((c) => c.before - c.after),
    ),
  ),
  raisedColumns: after
    .flatMap((row) => row.reservationCuts)
    .filter((c) => c.after > c.before).length,
  insetHistogram: Object.fromEntries(
    [4, 8, 12].map((band, i) => [
      String(band),
      after.filter((row) =>
        row.sites.some((site) => {
          const n = inset(site, row.recipe.params.size);
          return n <= band && (i === 0 || n > [4, 8, 12][i - 1]);
        }),
      ).length,
    ]),
  ),
  failed: after
    .filter(
      (row) =>
        row.violations.length ||
        row.minimumHatchSpace < 6 ||
        row.sites.length !== 1,
    )
    .map((row) => ({
      recipe: row.recipe,
      violations: row.violations,
      hatchSpace: row.minimumHatchSpace,
      sites: row.sites.length,
    })),
  settlements: ["rural", "town", "city"].map((scale) => {
    const b = before.filter((row) => row.recipe.params.settlement === scale),
      a = after.filter((row) => row.recipe.params.settlement === scale);
    return {
      scale,
      maps: a.length,
      buildings: [sum(b, "buildings"), sum(a, "buildings")],
      props: [sum(b, "props"), sum(a, "props")],
      meanCoverAdjacency: [
        mean(b, "coverAdjacency"),
        mean(a, "coverAdjacency"),
      ],
      meanOpenTiles: [mean(b, "openTiles"), mean(a, "openTiles")],
    };
  }),
};
writeFileSync(
  process.argv[4] ?? `${directory}/survey-comparison.json`,
  await format(JSON.stringify(report), { parser: "json" }),
);
console.log(JSON.stringify(report, null, 2));
if (
  report.failed.length ||
  Object.values(report.mismatches).some((n) => n !== 0) ||
  report.raisedColumns
)
  process.exitCode = 1;
