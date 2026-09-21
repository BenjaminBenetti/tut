import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// Reproduce the two movement-only samples from the discussion, without changing gameplay.
const ROWS = ["@.#.", ".#..", "....", "...O"];
const MODEL = "jev-1.13.0";
const OPTIONS = [
  { tile: "B1", x: 1, z: 0, steps: 1 },
  { tile: "A2", x: 0, z: 1, steps: 1 },
  { tile: "A3", x: 0, z: 2, steps: 2 },
];
const QUESTION =
  "Which tile should the actor move to next to reach the objective?";

/** Ordinary breadth-first distances provide ground truth, never additional model input. */
function distances(start) {
  const found = new Map([[`${start.x},${start.z}`, 0]]);
  const queue = [start];
  for (const point of queue) {
    const distance = found.get(`${point.x},${point.z}`);
    for (const [dx, dz] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const x = point.x + dx;
      const z = point.z + dz;
      const key = `${x},${z}`;
      if (!ROWS[z]?.[x] || ROWS[z][x] === "#" || found.has(key)) continue;
      found.set(key, distance + 1);
      queue.push({ x, z });
    }
  }
  return found;
}

/** Build the sample requests with the same map, destinations, ordering and question text. */
function requests() {
  const tiles = ROWS.flatMap((row, z) =>
    [...row].map((cell, x) => [
      x,
      0,
      z,
      cell === "#" ? 0 : 3,
      0,
      {},
      false,
      true,
    ]),
  );
  const state = {
    entity_prompt: "Reach objective-1.",
    commander_prompt: "",
    actor: {
      id: "unit-1",
      name: "Alpha",
      type: "Rifle Squad",
      movement_class: "infantry",
      position: { x: 0, y: 0, z: 0 },
      ap: 2,
      max_ap: 2,
      movement: 2,
    },
    turn: 1,
    phase: "player",
    faction: "tdf",
    eligible_to_act: true,
    navigation: {
      scope:
        "Remembered and visible terrain near the actor. Omitted tiles are unknown or outside this local window; do not infer their geometry. Paths are computed by the game on known terrain. Coordinates are x, elevation layer y, z.",
      columns: [
        "x",
        "y",
        "z",
        "passMask",
        "cover",
        "walls",
        "blocksSight",
        "visible",
      ],
      passMask: {
        0: "Blocked for all movement classes",
        1: "Infantry movement class only",
        2: "Mech movement class only",
        3: "Both infantry and mech movement classes",
      },
      cover: { none: 0, low: 1, high: 2 },
      tiles,
      connectors: [],
    },
    entities: [],
    objectives: [
      { id: "objective-1", complete: false, position: { x: 3, y: 0, z: 3 } },
    ],
    observed_hazards: [],
  };
  return {
    game: {
      model: MODEL,
      state,
      questions: {
        action: {
          type: "choice",
          instructions: QUESTION,
          criteria: Object.fromEntries(
            OPTIONS.map(({ x, z }, i) => [
              `action-${i}`,
              {
                action: "move",
                destination: { x, y: 0, z },
                ap_cost: 1,
                cover: [
                  ["n", 0],
                  ["e", 0],
                  ["s", 0],
                  ["w", 0],
                ],
                known_hazards: [],
              },
            ]),
          ),
        },
      },
    },
    ascii: {
      model: MODEL,
      state: {
        map_legend: {
          "@": "Actor",
          O: "Objective",
          ".": "Walkable tile",
          "#": "Blocked tile",
        },
        coordinates:
          "Columns A–D run left to right. Rows 1–4 run top to bottom.",
        movement:
          "Move up to two tiles per action, horizontally or vertically. Turns are allowed. Cannot cross blocked tiles.",
        map_rows: ROWS,
      },
      questions: {
        action: {
          type: "choice",
          instructions: QUESTION,
          criteria: Object.fromEntries(
            OPTIONS.map(({ tile, steps }) => [
              tile,
              `Move to ${tile}, ${steps === 1 ? "one step" : "two steps"} away.`,
            ]),
          ),
        },
      },
    },
  };
}

/** Summarize observed correctness and measured costs; failures remain in the denominator. */
function summarize(runs, format) {
  const items = runs.filter((run) => run.format === format);
  const answered = items.filter((run) => run.status === "ok");
  const average = (get) =>
    answered.length
      ? answered.reduce((sum, run) => sum + get(run), 0) / answered.length
      : null;
  return {
    attempts: items.length,
    answered: answered.length,
    correct: answered.filter((run) => run.correct).length,
    choices: Object.fromEntries(
      OPTIONS.map(({ tile }) => [
        tile,
        answered.filter((run) => run.tile === tile).length,
      ]),
    ),
    meanConfidence: average((run) => run.answer.confidence),
    meanElapsedMs: average((run) => run.elapsedMs),
    meanInputTokens: average((run) => run.response.usage.input_tokens),
    meanOutputTokens: average((run) => run.response.usage.output_tokens),
  };
}

/** Run ten matched repetitions, alternating format order and retaining every response without retries. */
async function main() {
  const payloads = requests();
  const fromActor = distances({ x: 0, z: 0 });
  const fromGoal = distances({ x: 3, z: 3 });
  const oracle = OPTIONS.map((option) => ({
    ...option,
    remainingSteps: fromGoal.get(`${option.x},${option.z}`),
  }));
  assert.deepEqual(
    oracle.map((option) => option.remainingSteps),
    [7, 5, 4],
  );
  const legal = [...fromActor]
    .filter(([, cost]) => cost > 0 && cost <= 2)
    .map(([key]) => key)
    .sort();
  assert.deepEqual(legal, OPTIONS.map(({ x, z }) => `${x},${z}`).sort());
  const result = {
    startedAt: new Date().toISOString(),
    model: MODEL,
    repetitionsPerFormat: 10,
    method:
      "Identical 4x4 map repeated, alternating game/ascii order; no prompt tuning or retries. These are the two simplified discussion samples, not full production requests or an isolation of map encoding alone.",
    map: ROWS,
    groundTruth: {
      bestTile: "A3",
      actorDistance: fromGoal.get("0,0"),
      options: oracle,
    },
    requests: payloads,
    runs: [],
  };
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const key = process.env.JevKey;
  if (!key)
    throw new Error(
      "Set JevKey via node --env-file=.env; it is never saved or printed.",
    );
  const output = process.argv[2] ?? ".producer/jev/map-format-results.json";
  await mkdir(dirname(output), { recursive: true });
  for (let trial = 1; trial <= 10; trial++) {
    for (const format of trial % 2 ? ["game", "ascii"] : ["ascii", "game"]) {
      const request = payloads[format];
      const started = performance.now();
      let run;
      try {
        const response = await fetch("https://api.typesafe.ai/v1/systemone", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(20000),
        });
        const raw = JSON.parse(
          (await response.text()).replaceAll(key, "[redacted]"),
        );
        const answer = raw.answers?.action;
        const optionIndex = Object.keys(
          request.questions.action.criteria,
        ).indexOf(answer?.choice);
        assert(response.ok, `HTTP ${response.status}`);
        assert.equal(raw.model, MODEL);
        assert(
          optionIndex >= 0 && typeof answer.confidence === "number",
          "Invalid Choice answer",
        );
        const option = oracle[optionIndex];
        run = {
          trial,
          format,
          status: "ok",
          httpStatus: response.status,
          elapsedMs: Math.round(performance.now() - started),
          requestId: response.headers.get("x-request-id"),
          requestBytes: Buffer.byteLength(JSON.stringify(request)),
          tile: option.tile,
          remainingSteps: option.remainingSteps,
          correct: option.tile === "A3",
          answer,
          response: raw,
        };
      } catch (error) {
        run = {
          trial,
          format,
          status: "error",
          elapsedMs: Math.round(performance.now() - started),
          error: String(error.message).replaceAll(key, "[redacted]"),
        };
      }
      result.runs.push(run);
      await writeFile(output, JSON.stringify(result, null, 2) + "\n");
      console.log(
        JSON.stringify({
          trial,
          format,
          status: run.status,
          tile: run.tile,
          confidence: run.answer?.confidence,
          elapsedMs: run.elapsedMs,
          error: run.error,
        }),
      );
    }
  }
  result.finishedAt = new Date().toISOString();
  result.summary = Object.fromEntries(
    ["game", "ascii"].map((format) => [format, summarize(result.runs, format)]),
  );
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result.summary, null, 2));
}

await main();
