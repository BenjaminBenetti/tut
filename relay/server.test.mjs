import { test } from "node:test";
import assert from "node:assert/strict";
import { createRelay } from "./server.mjs";
import { gameRequest, distanceRequest } from "./game-request.test-helper.mjs";

const request = gameRequest();

/** Bind a real ephemeral HTTP server and close it even when an assertion fails. */
async function withRelay(
  run,
  fetchUpstream = async () => new Response(JSON.stringify({ answers: {} })),
) {
  const logs = [];
  const server = createRelay({
    key: "secret-for-test",
    origins: ["http://localhost:5173"],
    fetchUpstream,
    log: (line) => logs.push(line),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`, logs);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("forwards the exact request, authenticates only upstream, and permits the configured browser origin", async () => {
  let captured;
  await withRelay(
    async (base, logs) => {
      const preflight = await fetch(`${base}/v1/systemone`, {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5173" },
      });
      assert.equal(preflight.status, 204);
      assert.equal(
        preflight.headers.get("access-control-allow-origin"),
        "http://localhost:5173",
      );
      const response = await fetch(`${base}/v1/systemone`, {
        method: "POST",
        headers: {
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
      assert.equal(response.status, 200);
      assert.ok(response.headers.get("x-request-id"));
      assert.deepEqual(JSON.parse(captured.body), request);
      assert.equal(captured.headers.Authorization, "Bearer secret-for-test");
      assert.ok(!JSON.stringify(logs).includes("secret-for-test"));
    },
    async (url, options) => {
      assert.equal(url, "https://api.typesafe.ai/v1/systemone");
      captured = options;
      return new Response(JSON.stringify({ answers: {} }));
    },
  );
});

test("rejects untrusted origins, invalid requests and large bodies before reaching Jev", async () => {
  let calls = 0;
  await withRelay(
    async (base) => {
      const send = (body, origin = "http://localhost:5173") =>
        fetch(`${base}/v1/systemone`, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body,
        });
      assert.equal(
        (await send(JSON.stringify(request), "https://untrusted.example"))
          .status,
        403,
      );
      assert.equal((await send("{")).status, 400);
      assert.equal(
        (
          await send(
            JSON.stringify({ ...request, upstream: "http://internal" }),
          )
        ).status,
        400,
      );
      assert.equal(
        (await send(JSON.stringify({ ...request, state: "x".repeat(600000) })))
          .status,
        413,
      );
      assert.equal(calls, 0);
      assert.equal((await fetch(`${base}/health`)).status, 200);
    },
    async () => {
      calls++;
      return new Response("{}");
    },
  );
});

test("preserves upstream errors and retry headers but redacts credentials", async () => {
  await withRelay(
    async (base) => {
      const response = await fetch(`${base}/v1/systemone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      assert.equal(response.status, 429);
      assert.equal(response.headers.get("retry-after"), "12");
      assert.deepEqual(await response.json(), { error: "[redacted]" });
    },
    async () =>
      new Response(JSON.stringify({ error: "secret-for-test" }), {
        status: 429,
        headers: { "Retry-After": "12" },
      }),
  );
});

test("identifies the acting unit and faction in logs without recording prompts or secrets", async () => {
  await withRelay(async (base, logs) => {
    const response = await fetch(`${base}/v1/systemone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...request,
        state: {
          ...request.state,
          actor: {
            ...request.state.actor,
            name: "Alpha secret-for-test",
            hp: 10,
          },
          faction: "tdf",
          phase: "player",
          turn: 3,
          entity_prompt: "private unit orders",
          commander_prompt: "private faction orders",
        },
      }),
    });
    assert.equal(response.status, 200);
    const entry = JSON.parse(logs[0]);
    assert.deepEqual(
      {
        actorId: entry.actorId,
        actorName: entry.actorName,
        faction: entry.faction,
        phase: entry.phase,
        turn: entry.turn,
        questionTypes: entry.questionTypes,
      },
      {
        actorId: "unit-1",
        actorName: "Alpha [redacted]",
        faction: "tdf",
        phase: "player",
        turn: 3,
        questionTypes: ["choice"],
      },
    );
    assert.ok(!logs[0].includes("secret-for-test"));
    assert.ok(!logs[0].includes("private"));
    assert.equal(entry.hp, undefined);
  });
});

test("forwards Score questions unchanged and rejects invalid ordered scales before upstream", async () => {
  const scoreRequest = distanceRequest();
  let calls = 0;
  await withRelay(
    async (base) => {
      const send = (payload) =>
        fetch(`${base}/v1/systemone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      assert.equal((await send(scoreRequest)).status, 200);
      for (const criteria of [
        [],
        ["one"],
        Array(11).fill("level"),
        { 0: "minimal", 1: "full" },
        ["minimal", null],
      ])
        assert.equal(
          (
            await send({
              ...scoreRequest,
              questions: {
                distance: { ...scoreRequest.questions.distance, criteria },
              },
            })
          ).status,
          400,
        );
      assert.equal(calls, 1);
    },
    async (_url, options) => {
      calls++;
      assert.deepEqual(JSON.parse(options.body), scoreRequest);
      return new Response(
        JSON.stringify({
          model: "jev-test",
          answers: {
            distance: {
              type: "score",
              score: 4,
              confidence: 1,
              probabilities: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1 },
            },
          },
        }),
      );
    },
  );
});

test("rejects non-game envelopes, extra fields and malformed tactical data without spending the key", async () => {
  let calls = 0;
  const invalid = [
    [
      "different model",
      (r) => {
        r.model = "jev-1.13.0";
      },
    ],
    [
      "missing state",
      (r) => {
        delete r.state;
      },
    ],
    [
      "text state",
      (r) => {
        r.state = "Classify this customer message";
      },
    ],
    [
      "array state",
      (r) => {
        r.state = [];
      },
    ],
    [
      "empty state",
      (r) => {
        r.state = {};
      },
    ],
    [
      "unknown state key",
      (r) => {
        r.state.messages = [{ role: "user", content: "Other task" }];
      },
    ],
    [
      "missing actor",
      (r) => {
        delete r.state.actor;
      },
    ],
    [
      "extra actor field",
      (r) => {
        r.state.actor.messages = [];
      },
    ],
    [
      "wrong actor field type",
      (r) => {
        r.state.actor.hp = "20";
      },
    ],
    [
      "extra coordinate field",
      (r) => {
        r.state.actor.position.prompt = "Other task";
      },
    ],
    [
      "fractional coordinate",
      (r) => {
        r.state.actor.position.y = 0.5;
      },
    ],
    [
      "unknown weapon data",
      (r) => {
        r.state.actor.weapons[0].profile.instructions = "Other task";
      },
    ],
    [
      "malformed entities",
      (r) => {
        r.state.entities = ["anything"];
      },
    ],
    [
      "unbounded entity list",
      (r) => {
        r.state.entities = Array(4097).fill({});
      },
    ],
    [
      "malformed objective",
      (r) => {
        r.state.objectives = [
          { id: "o-1", kind: "destroy-spawner", complete: "yes" },
        ];
      },
    ],
    [
      "wrong faction",
      (r) => {
        r.state.faction = "other";
      },
    ],
    [
      "wrong faction phase",
      (r) => {
        r.state.phase = "bugs";
      },
    ],
    [
      "out of AP",
      (r) => {
        r.state.actor.ap = 0;
      },
    ],
    [
      "ineligible actor",
      (r) => {
        r.state.eligible_to_act = false;
      },
    ],
    [
      "long entity prompt",
      (r) => {
        r.state.entity_prompt = "x".repeat(8001);
      },
    ],
    [
      "long commander prompt",
      (r) => {
        r.state.commander_prompt = "x".repeat(8001);
      },
    ],
    [
      "replaced game rules",
      (r) => {
        r.state.gameplay.combat = "Other task";
      },
    ],
    [
      "replaced faction goal",
      (r) => {
        r.state.faction_goal = "Other task";
      },
    ],
    [
      "arbitrary question name",
      (r) => {
        r.questions = { classify: r.questions.action };
      },
    ],
    [
      "multiple questions",
      (r) => {
        r.questions.distance = distanceRequest().questions.distance;
      },
    ],
    [
      "wrong primitive",
      (r) => {
        r.questions.action.type = "noul";
      },
    ],
    [
      "arbitrary task",
      (r) => {
        r.questions.action.instructions = "Classify this customer message";
      },
    ],
    [
      "extra question field",
      (r) => {
        r.questions.action.model = "other";
      },
    ],
    [
      "arbitrary criteria",
      (r) => {
        r.questions.action.criteria = { yes: "yes", no: "no" };
      },
    ],
    [
      "empty criteria",
      (r) => {
        r.questions.action.criteria = {};
      },
    ],
    [
      "array criteria",
      (r) => {
        r.questions.action.criteria = [];
      },
    ],
    [
      "unknown action",
      (r) => {
        r.questions.action.criteria.finish =
          r.questions.action.criteria.overwatch;
      },
    ],
    [
      "malformed option",
      (r) => {
        r.questions.action.criteria.overwatch.ap_costs = "one";
      },
    ],
    [
      "extra option field",
      (r) => {
        r.questions.action.criteria.overwatch.messages = [];
      },
    ],
    [
      "oversized instructions",
      (r) => {
        r.questions.action.instructions += "x".repeat(16001);
      },
    ],
    [
      "prototype field",
      (r) => {
        Object.defineProperty(r.state, "__proto__", {
          value: {},
          enumerable: true,
        });
      },
    ],
    [
      "prototype dictionary key",
      (r) => {
        r.state.equipment_definitions = JSON.parse('{"constructor":{}}');
      },
    ],
  ];
  await withRelay(
    async (base) => {
      for (const [label, mutate] of invalid) {
        const payload = structuredClone(gameRequest());
        mutate(payload);
        const response = await fetch(`${base}/v1/systemone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        assert.equal(response.status, 400, label);
        assert.deepEqual(
          await response.json(),
          { error: "Invalid TUT game decision request" },
          label,
        );
      }
      // Valid JSON can parse an overflowing exponent to Infinity.
      const overflow = JSON.stringify(gameRequest()).replace(
        '"hp":20',
        '"hp":1e999',
      );
      assert.equal(
        (
          await fetch(`${base}/v1/systemone`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: overflow,
          })
        ).status,
        400,
      );
      for (const value of [null, [], 1, "state"])
        assert.equal(
          (
            await fetch(`${base}/v1/systemone`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(value),
            })
          ).status,
          400,
        );
      assert.equal(
        (
          await fetch(`${base}/v1/systemone`, {
            method: "POST",
            headers: { "Content-Type": "application/jsonp" },
            body: JSON.stringify(gameRequest()),
          })
        ).status,
        415,
      );
      assert.equal(calls, 0);
    },
    async () => {
      calls++;
      return new Response("{}");
    },
  );
});

test("accepts only the game's movement distance task, scale and one-AP path", async () => {
  let calls = 0;
  const invalid = [
    (r) => {
      delete r.state.selected_movement;
    },
    (r) => {
      r.questions.distance.instructions = "Rate this review";
    },
    (r) => {
      r.questions.distance.criteria = ["bad", "fair", "good", "better", "best"];
    },
    (r) => {
      r.state.selected_movement.ap_cost = 2;
    },
    (r) => {
      r.state.selected_movement.intent = "other-task";
    },
    (r) => {
      r.state.selected_movement.proposed_path = [];
    },
    (r) => {
      r.state.selected_movement.proposed_endpoint.x++;
    },
    (r) => {
      r.state.selected_movement.proposed_path[0].instructions = "Other task";
    },
    (r) => {
      r.questions = gameRequest().questions;
    },
  ];
  await withRelay(
    async (base) => {
      for (const mutate of invalid) {
        const payload = structuredClone(distanceRequest());
        mutate(payload);
        const response = await fetch(`${base}/v1/systemone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        assert.equal(response.status, 400);
      }
      assert.equal(calls, 0);
    },
    async () => {
      calls++;
      return new Response("{}");
    },
  );
});
