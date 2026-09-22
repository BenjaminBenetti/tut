import "./register-typescript.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const { buildCase, applyMove, remaining, RULES } =
  await import("./navigation-cases.mjs");
const { buildEntityCase } = await import("./navigation-entities.mjs");
const { captureJev } = await import("../../src/tactical/ai/jev-request.ts");
const inputs = process.argv.slice(2);
assert(
  inputs.length,
  "Pass one or more evaluation directories; verification makes no API requests",
);
let episodes = 0,
  commands = 0,
  calls = 0,
  refusals = 0,
  targetDecisions = 0,
  correctTargetDecisions = 0;
for (const input of inputs) {
  const result = JSON.parse(
    await readFile(join(input, "results.json"), "utf8"),
  );
  const worlds = new Map(
    result.cases.map((metadata) => [
      metadata.id,
      (result.scenario === "entities-100" ? buildEntityCase : buildCase)(
        metadata,
        result.visibility,
      ),
    ]),
  );
  for (const run of result.runs) {
    const world = worlds.get(run.caseId);
    let mission = world.mission;
    let ap = 0,
      waste = 0;
    assert.equal(run.optimalAp, world.optimalAp);
    assert.deepEqual(
      world.metadata,
      result.cases.find((item) => item.id === run.caseId),
    );
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
        if (result.scenario === "entities-100") {
          const snapshot = captureJev(
            mission,
            mission.units[0].id,
            RULES,
            world.prompts,
            world.names,
          );
          const wireState = JSON.parse(JSON.stringify(snapshot.state));
          assert.equal(request.state.entities.length, 100);
          assert.equal(
            Object.keys(request.questions.action.criteria).length,
            100,
          );
          assert.deepEqual(request.state.actor, wireState.actor);
          assert.equal(request.state.entity_prompt, world.prompts.entity);
          assert.equal(request.state.commander_prompt, world.prompts.commander);
          const byId = new Map(
            wireState.entities.map((entity) => [entity.id, entity]),
          );
          for (const { capability_ref, ...entity } of request.state.entities) {
            const expanded = capability_ref
              ? { ...entity, ...request.state.capabilities[capability_ref] }
              : entity;
            assert.deepEqual(expanded, byId.get(entity.id));
          }
          const order = result.reverseChoices
            ? [...world.choiceOrder].reverse()
            : world.choiceOrder;
          assert.deepEqual(
            Object.keys(request.questions.action.criteria),
            order,
          );
          if (call.answer) {
            assert.equal(step.selectedEntityId, call.answer.choice);
            assert.equal(
              step.selectedEntityCorrect,
              call.answer.choice === world.goal.id,
            );
            targetDecisions++;
            if (step.selectedEntityCorrect) correctTargetDecisions++;
          }
        }
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
  JSON.stringify({
    episodes,
    commands,
    calls,
    refusals,
    targetDecisions,
    correctTargetDecisions,
    networkRequests: 0,
  }),
);
