import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { format } from "prettier";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const inputs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const output =
  process.argv.find((arg) => arg.startsWith("--out="))?.slice(6) ??
  "docs/experiments/jev-navigation";
assert(inputs.length, "Pass evaluation directories and optionally --out=path");
await mkdir(output, { recursive: true });
const data = {
  batches: [],
  maps: {},
  runs: [],
  requestTemplates: {},
  requests: {},
};
const summary = { batches: [] };
const samples = new Set();
for (const input of inputs) {
  const batch = basename(input);
  const result = JSON.parse(
    await readFile(join(input, "results.json"), "utf8"),
  );
  assert.equal(
    result.scenario,
    "entities-100",
    "This report displays the 100-entity evaluations; pass only those batches",
  );
  data.batches.push({
    id: batch,
    vision: result.visibility,
    suite: result.suite,
    summary: result.summary,
    reverseChoices: result.reverseChoices,
  });
  const maps = new Map();
  for (const item of result.cases) {
    const key = `${item.seed}:${item.size}:${item.biome}:${item.settlement}`;
    maps.set(item.id, key);
    if (data.maps[key]) continue;
    const map = JSON.parse(
      await readFile(join(input, "maps", `${item.id}.json`), "utf8"),
    );
    data.maps[key] = {
      width: map.width,
      depth: map.depth,
      levels: map.levels,
      tiles: map.tiles.map((tile) => [
        tile.x,
        tile.y,
        tile.z,
        tile.pass,
        wallBits(tile.walls),
      ]),
    };
  }
  summary.batches.push({
    id: batch,
    model: result.model,
    suite: result.suite,
    scenario: result.scenario,
    method: result.method,
    gameCommit: result.gameCommit,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    vision: result.visibility,
    reverseChoices: result.reverseChoices ?? false,
    requestCount: result.requestCount,
    cases: result.cases.map((item) =>
      Object.fromEntries(
        Object.entries(item).filter(
          ([key]) => !["roster", "choiceOrder", "entityOrder"].includes(key),
        ),
      ),
    ),
    summary: result.summary,
  });
  for (const run of result.runs) {
    const metadata = result.cases.find((item) => item.id === run.caseId);
    data.runs.push({
      ...run,
      batch,
      vision: result.visibility,
      map: maps.get(run.caseId),
      start: metadata.start,
      goal: metadata.goal.position,
      goalId: metadata.goal.id,
      goalName: metadata.goal.name,
      roster: metadata.roster,
      prompts: metadata.prompts,
      orderKind: metadata.orderKind,
      entityCount: metadata.entityCount,
      steps: run.steps.map((step) => ({
        ...step,
        calls: step.calls.map((call) => ({
          stage: call.stage,
          choice: call.answer?.choice,
          confidence: call.answer?.confidence,
          inputTokens: call.usage?.input_tokens,
          elapsedMs: call.elapsedMs,
          requestHash: call.requestHash,
          error: call.error,
          httpStatus: call.httpStatus,
          requestId: call.requestId,
          response: call.response,
        })),
      })),
    });
    for (const step of run.steps)
      for (const call of step.calls) {
        if (data.requests[call.requestHash]) continue;
        const request = JSON.parse(
          await readFile(
            join(input, "requests", `${call.requestHash}.json`),
            "utf8",
          ),
        );
        const template = {
          ...request,
          state: { ...request.state, actor: null },
        };
        const templateId = createHash("sha256")
          .update(JSON.stringify(template))
          .digest("hex");
        data.requestTemplates[templateId] = template;
        data.requests[call.requestHash] = {
          templateId,
          actor: request.state.actor,
        };
        const restored = {
          ...template,
          state: {
            ...template.state,
            ...(request.state.actor ? { actor: request.state.actor } : {}),
          },
        };
        if (!Object.hasOwn(request.state, "actor")) delete restored.state.actor;
        assert.equal(
          createHash("sha256").update(JSON.stringify(restored)).digest("hex"),
          call.requestHash,
          "Viewer request reconstruction must match the exact recorded payload",
        );
      }
  }
  if (result.suite === "holdout")
    for (const variant of result.variants) {
      if (samples.has(variant)) continue;
      const first = result.runs.find((run) => run.variant === variant)?.steps[0]
        ?.calls[0];
      if (!first) continue;
      samples.add(variant);
      const request = JSON.parse(
        await readFile(
          join(input, "requests", `${first.requestHash}.json`),
          "utf8",
        ),
      );
      await writeFile(
        join(output, `sample-${variant}.json`),
        await format(JSON.stringify(request), { parser: "json" }),
      );
    }
}
const template = await readFile(
  new URL("./navigation-report.html", import.meta.url),
  "utf8",
);
const html = template.replace(
  "__NAV_DATA__",
  gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 }).toString("base64"),
);
await writeFile(
  join(output, "index.html"),
  await format(html, { parser: "html" }),
);
await writeFile(
  join(output, "results.json"),
  await format(JSON.stringify(summary), { parser: "json" }),
);
console.log(
  `Wrote ${data.runs.length} trajectories on ${Object.keys(data.maps).length} maps to ${output}`,
);

/** Encode four directional wall kinds compactly for the standalone viewer. */
function wallBits(walls) {
  return ["n", "e", "s", "w"].reduce(
    (bits, direction, i) =>
      bits |
      ((["solid", "door", "window", "half"].indexOf(walls[direction]) + 1) <<
        (i * 3)),
    0,
  );
}
