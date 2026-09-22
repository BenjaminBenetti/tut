import "./register-typescript.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const { buildCase, applyMove, remaining } =
  await import("./navigation-cases.mjs");
const inputs = process.argv.slice(2);
assert(
  inputs.length,
  "Pass one or more evaluation directories; verification makes no API requests",
);
let episodes = 0,
  commands = 0,
  calls = 0,
  refusals = 0;
for (const input of inputs) {
  const result = JSON.parse(
    await readFile(join(input, "results.json"), "utf8"),
  );
  const worlds = new Map(
    result.cases.map((metadata) => [
      metadata.id,
      buildCase(metadata, result.visibility),
    ]),
  );
  for (const run of result.runs) {
    const world = worlds.get(run.caseId);
    let mission = world.mission;
    let ap = 0,
      waste = 0;
    assert.equal(run.optimalAp, world.optimalAp);
    for (const step of run.steps) {
      assert.deepEqual(step.from, mission.units[0].pos);
      assert.equal(step.distanceBefore, remaining(world, mission.units[0].pos));
      for (const call of step.calls) {
        const body = (
          await readFile(
            join(input, "requests", `${call.requestHash}.json`),
            "utf8",
          )
        ).replace(/\n$/, "");
        assert.equal(
          createHash("sha256").update(body).digest("hex"),
          call.requestHash,
        );
        const request = JSON.parse(body);
        assert.equal(request.model, result.model);
        if (call.answer)
          assert(
            Object.hasOwn(
              request.questions.action.criteria,
              call.answer.choice,
            ),
          );
        calls++;
      }
      if (step.refusal) {
        assert.throws(
          () => applyMove(world, mission, { command: step.command }),
          (error) => {
            assert.deepEqual(error.gameError, step.refusal);
            return true;
          },
        );
        refusals++;
      }
      if (!step.to) continue;
      const command = step.command ?? {
        type: "tactical:move",
        payload: { unitId: mission.units[0].id, path: step.path },
      };
      mission = applyMove(world, mission, { command });
      assert.deepEqual(mission.units[0].pos, step.to);
      assert.equal(remaining(world, mission.units[0].pos), step.distanceAfter);
      assert.equal(
        Math.ceil(step.distanceBefore / world.movement),
        step.optimalApBefore,
      );
      assert.equal(
        Math.ceil(step.distanceAfter / world.movement),
        step.optimalApAfter,
      );
      waste += 1 + step.optimalApAfter - step.optimalApBefore;
      ap++;
      commands++;
    }
    assert.equal(run.apUsed, ap);
    assert.equal(run.wastedAp, waste);
    assert.equal(run.distanceRemaining, remaining(world, mission.units[0].pos));
    assert.equal(run.status === "reached", run.distanceRemaining === 0);
    episodes++;
  }
  console.log(`Verified ${input}: ${result.runs.length} episodes`);
}
console.log(
  JSON.stringify({ episodes, commands, calls, refusals, networkRequests: 0 }),
);
