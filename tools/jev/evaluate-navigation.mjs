import assert from "node:assert/strict";
import "./register-typescript.mjs";
import { dirname, join } from "node:path";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const { buildCase, caseDefinitions, applyMove, remaining, RULES } =
  await import("./navigation-cases.mjs");
const { choicePage, VARIANTS } = await import("./navigation-formats.mjs");
const { captureJev } = await import("./navigation-snapshot.mjs");
const { buildEntityCase, entityCaseDefinitions } =
  await import("./navigation-entities.mjs");
const { moveTowardEntity } = await import("./navigation-entity-choice.mjs");
const MODEL = "jev-1.13.0";

/** Read named options; all requests and full traces are kept beneath the selected output directory. */
function option(name, fallback) {
  const prefix = `--${name}=`;
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    fallback
  );
}
const suite = option("suite", "pilot");
const visibility = option("vision", "full");
const variants = option("variants", "current,lean-flat,goal-route-doors").split(
  ",",
);
const output = option("out", `.producer/jev/navigation-${suite}-${visibility}`);
const maxRequests = Number(option("max-requests", "400"));
const repetitions = Number(option("repeat", "1"));
const selected = option("cases", "").split(",").filter(Boolean);
const dry = process.argv.includes("--dry-run");
const oracleOnly = process.argv.includes("--oracle");
const reverseChoices = process.argv.includes("--reverse-choices");
const scenario = option("scenario", "objectives");
assert(["objectives", "entities-100"].includes(scenario));
assert(
  variants.every(
    (value) => value.startsWith("entities-") === (scenario === "entities-100"),
  ),
  "Entity scenarios need entities-inline/shared variants",
);
assert(["pilot", "development", "holdout"].includes(suite));
assert(["full", "fog"].includes(visibility));
assert(variants.every((value) => VARIANTS.includes(value)));
assert(Number.isSafeInteger(maxRequests) && maxRequests > 0);
assert(Number.isSafeInteger(repetitions) && repetitions > 0);
if (!dry && !oracleOnly)
  assert(process.env.JevKey, "JevKey must be supplied through --env-file=.env");
await mkdir(dirname(output), { recursive: true });
try {
  await mkdir(output);
} catch (error) {
  if (error.code === "EEXIST")
    throw new Error(
      `Output directory already exists: ${output}. Choose a fresh --out to preserve previous traces.`,
      { cause: error },
    );
  throw error;
}
await mkdir(join(output, "requests"), { recursive: true });
await mkdir(join(output, "maps"), { recursive: true });
let requestCount = 0;
const result = {
  startedAt: new Date().toISOString(),
  model: MODEL,
  suite,
  visibility,
  repetitions,
  maxRequests,
  oracleOnly,
  reverseChoices,
  scenario,
  gameCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  method:
    scenario === "entities-100"
      ? "Generated game maps with 100 static, fully observed units plus a rookie rifle actor. All 100 destinations and production actor/entity metadata are sent every decision; shared format losslessly factors repeated capabilities. Named ally, named hostile, equipment and commander-override orders. Jev chooses the entity; game pathfinding routes to a free adjacent tile with real unit occupancy. Fresh inference after every 1 AP move. No combat, enemy turns, retries, confidence threshold or response substitution. Full-map distances are offline scoring only. AP refreshes after two moves. Stop at arrival, wrong destination, error, 2*optimalAP+10 AP, or four identical states. Entity and option order are independently shuffled by seed."
      : "Generated game maps; shipped rookie rifle squad; navigation only; farthest generated objective. Action-type selection is fixed to move. Current uses the production movement question. No enemy turns, combat or hazards. Full-map oracle distances are offline scoring only. Tile-choice variants retain every legal move. Goal-route variants instead offer public objectives and use deterministic routes on faction knowledge. Goal-route-doors also attempts one unknown step beyond an observed door and remembers refusals; no hidden map is read to plan it. No inference retries or confidence threshold. At most 2*optimalAP+10 spent AP, four times that many attempts, or four visits to identical position+knowledge+refusals. AP refreshes after two moves. Fog AP ratios use the omniscient lower bound, not an achievable fog optimum.",
  variants,
  cases: [],
  runs: [],
  summary: {},
};

/** Persist the summary after every completed trajectory, including failures. */
async function checkpoint() {
  result.requestCount = requestCount;
  result.summary = Object.fromEntries(
    variants.map((variant) => {
      const runs = result.runs.filter((run) => run.variant === variant);
      const reached = runs.filter((run) => run.status === "reached");
      const calls = runs.flatMap((run) =>
        run.steps.flatMap((step) => step.calls),
      );
      const metered = calls.filter((call) =>
        Number.isFinite(call.usage?.input_tokens),
      );
      return [
        variant,
        {
          episodes: runs.length,
          reached: reached.length,
          statuses: Object.fromEntries(
            [...new Set(runs.map((run) => run.status))].map((status) => [
              status,
              runs.filter((run) => run.status === status).length,
            ]),
          ),
          meanApRatioOnSuccess: reached.length
            ? reached.reduce(
                (sum, run) => sum + run.apUsed / run.optimalAp,
                0,
              ) / reached.length
            : null,
          wastedAp: runs.reduce((sum, run) => sum + run.wastedAp, 0),
          refusedDoorAttempts: runs
            .flatMap((run) => run.steps)
            .filter((step) => step.refusal).length,
          calls: calls.length,
          targetDecisions: runs
            .flatMap((run) => run.steps)
            .filter((step) => step.selectedEntityId).length,
          correctTargetDecisions: runs
            .flatMap((run) => run.steps)
            .filter((step) => step.selectedEntityCorrect).length,
          meanInputTokens: metered.length
            ? metered.reduce((sum, call) => sum + call.usage.input_tokens, 0) /
              metered.length
            : null,
          meanLatencyMs: calls.length
            ? calls.reduce((sum, call) => sum + call.elapsedMs, 0) /
              calls.length
            : null,
        },
      ];
    }),
  );
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
}

/** Save exact requests by content hash, without any authentication header or secret. */
async function evaluate(page) {
  if (requestCount >= maxRequests) throw new Error("request-budget-exhausted");
  const request = {
    ...page.request,
    model: MODEL,
    ...(reverseChoices
      ? {
          questions: {
            action: {
              ...page.request.questions.action,
              criteria: Object.fromEntries(
                Object.entries(
                  page.request.questions.action.criteria,
                ).reverse(),
              ),
            },
          },
        }
      : {}),
  };
  const body = JSON.stringify(request);
  const requestHash = createHash("sha256").update(body).digest("hex");
  await writeFile(join(output, "requests", `${requestHash}.json`), body + "\n");
  requestCount++;
  const start = performance.now();
  let call;
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.JevKey}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(20000),
    });
    const bodyText = (await response.text()).replaceAll(
      process.env.JevKey,
      "[redacted]",
    );
    let raw;
    try {
      raw = JSON.parse(bodyText);
    } catch {
      raw = { unparsed: bodyText };
    }
    call = {
      requestHash,
      stage: page.stage,
      requestBytes: Buffer.byteLength(body),
      httpStatus: response.status,
      elapsedMs: Math.round(performance.now() - start),
      requestId: response.headers.get("x-request-id"),
      usage: raw.usage,
      response: raw,
    };
    const answer = raw.answers?.action;
    if (!response.ok)
      call.error = `HTTP ${response.status}: ${JSON.stringify(raw.detail ?? raw.error)}`;
    else if (
      raw.model !== MODEL ||
      !answer ||
      !Object.hasOwn(request.questions.action.criteria, answer.choice)
    )
      call.error = "Response model or offered choice did not match request";
    else call.answer = answer;
  } catch (error) {
    call = {
      requestHash,
      stage: page.stage,
      requestBytes: Buffer.byteLength(body),
      elapsedMs: Math.round(performance.now() - start),
      error: String(error.message).replaceAll(process.env.JevKey, "[redacted]"),
    };
  }
  await appendFile(
    join(output, "exchanges.jsonl"),
    JSON.stringify(call) + "\n",
  );
  return call;
}

/** Run closed-loop movement until arrival, a repeated state, a legal-action failure or the fixed AP cap. */
async function episode(world, variant, trial) {
  let mission = world.mission;
  const run = {
    caseId: world.definition.id,
    variant,
    trial,
    optimalAp: world.optimalAp,
    apCap: 2 * world.optimalAp + 10,
    apUsed: 0,
    wastedAp: 0,
    status: "ap-limit",
    steps: [],
  };
  const visits = new Map();
  const navigationMemory = {};
  const rejectedDoors = new Set();
  for (let step = 0; step < 4 * run.apCap && run.apUsed < run.apCap; step++) {
    const actor = mission.units[0];
    const distanceBefore = remaining(world, actor.pos);
    if (distanceBefore === 0) {
      run.status = "reached";
      break;
    }
    const stateKey = `${world.graph.index.keyOf(actor.pos)}:${mission.jev.knowledge.tdf.tiles.length}:${rejectedDoors.size}`;
    const visitsHere = (visits.get(stateKey) ?? 0) + 1;
    visits.set(stateKey, visitsHere);
    if (visitsHere >= 4) {
      run.status = "loop";
      break;
    }
    const snapshot = captureJev(
      mission,
      actor.id,
      RULES,
      world.prompts ?? {
        entity: `Reach ${world.goal.id} as quickly as possible.`,
        commander: "",
      },
      world.names ?? { [actor.id]: "Alpha" },
    );
    let candidates = snapshot.candidates.filter(
      (candidate) => candidate.category === "move",
    );
    if (
      !candidates.length &&
      variant !== "goal-route-doors" &&
      !variant.startsWith("entities-")
    ) {
      run.status = "no-legal-move";
      break;
    }
    const moveStep = {
      from: actor.pos,
      distanceBefore,
      candidates: candidates.length,
      knownTiles: mission.jev.knowledge.tdf.tiles.length,
      calls: [],
    };
    run.steps.push(moveStep);
    let chosen;
    try {
      if (oracleOnly)
        chosen = [...candidates].sort(
          (a, b) =>
            remaining(world, a.command.payload.path.at(-1)) -
            remaining(world, b.command.payload.path.at(-1)),
        )[0];
      else
        for (let depth = 0; depth < 10; depth++) {
          const page = choicePage(variant, snapshot, candidates, world.goal, {
            mission,
            history: run.steps.slice(0, -1),
            navigationMemory,
            rejectedDoors,
            choiceOrder: world.choiceOrder,
            entityOrder: world.entityOrder,
          });
          const call = await evaluate(page);
          moveStep.calls.push(call);
          if (call.error) throw new Error(call.error);
          if (variant.startsWith("entities-")) {
            moveStep.selectedEntityId = call.answer.choice;
            moveStep.selectedEntityCorrect =
              call.answer.choice === world.goal.id;
            const movement = moveTowardEntity(
              mission,
              call.answer.choice,
              world.movement,
            );
            if (movement.arrived) {
              run.status = "wrong-destination";
              break;
            }
            chosen = movement.candidate;
            moveStep.plan = movement.plan;
            break;
          }
          if (!page.groups) {
            chosen =
              page.actions?.[call.answer.choice] ??
              candidates.find(
                (candidate) => candidate.id === call.answer.choice,
              );
            if (page.plans) moveStep.plan = page.plans[call.answer.choice];
            break;
          }
          candidates = page.groups[call.answer.choice];
        }
      if (run.status === "wrong-destination") break;
      assert(chosen, "Routing must reach one concrete move");
      moveStep.command = chosen.command;
      mission = applyMove(world, mission, chosen);
      const after = remaining(world, mission.units[0].pos);
      Object.assign(moveStep, {
        choice: chosen.id,
        to: mission.units[0].pos,
        distanceAfter: after,
        path: chosen.command.payload.path,
        optimalApBefore: Math.ceil(distanceBefore / world.movement),
        optimalApAfter: Math.ceil(after / world.movement),
      });
      run.apUsed++;
      run.wastedAp += 1 + moveStep.optimalApAfter - moveStep.optimalApBefore;
      if (after === 0) {
        run.status = "reached";
        break;
      }
    } catch (error) {
      if (
        moveStep.plan?.attemptedUnknownDoor &&
        error.gameError?.kind === "illegal-move"
      ) {
        moveStep.refusal = error.gameError;
        rejectedDoors.add(
          world.graph.index.keyOf(moveStep.plan.attemptedUnknownDoor),
        );
        continue;
      }
      run.status =
        error.message === "request-budget-exhausted" ? "budget" : "error";
      run.error = String(error.message).replaceAll(
        process.env.JevKey ?? "__no_key__",
        "[redacted]",
      );
      break;
    }
  }
  run.distanceRemaining = remaining(world, mission.units[0].pos);
  return run;
}

for (const definition of (scenario === "entities-100"
  ? entityCaseDefinitions(suite)
  : caseDefinitions(suite)
).filter((def) => !selected.length || selected.includes(def.id))) {
  const world =
    scenario === "entities-100"
      ? buildEntityCase(definition, visibility)
      : buildCase(definition, visibility);
  result.cases.push(world.metadata);
  await writeFile(
    join(output, "maps", `${definition.id}.json`),
    JSON.stringify(world.mission.map),
  );
  console.log(
    JSON.stringify({
      case: definition.id,
      dimensions: world.metadata.dimensions,
      entities: world.metadata.entityCount,
      order: world.metadata.prompts,
      goal: world.goal,
      optimalAp: world.optimalAp,
    }),
  );
  if (!dry)
    for (let trial = 1; trial <= repetitions; trial++) {
      // Alternate method order between matched cases/trials; no silent retries or dropped failures.
      const order =
        (result.cases.length + trial) % 2 ? [...variants].reverse() : variants;
      for (const variant of order) {
        if (!oracleOnly && requestCount >= maxRequests) break;
        const run = await episode(world, variant, trial);
        result.runs.push(run);
        await checkpoint();
        console.log(
          JSON.stringify({
            case: definition.id,
            variant,
            trial,
            status: run.status,
            ap: run.apUsed,
            optimal: run.optimalAp,
            remaining: run.distanceRemaining,
            calls: run.steps.reduce((sum, step) => sum + step.calls.length, 0),
            error: run.error,
          }),
        );
      }
    }
  await checkpoint();
}
result.finishedAt = new Date().toISOString();
await checkpoint();
console.log(JSON.stringify(result.summary, null, 2));
