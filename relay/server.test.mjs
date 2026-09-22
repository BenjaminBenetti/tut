import { test } from "node:test";
import assert from "node:assert/strict";
import { createRelay } from "./server.mjs";

const request = {
  model: "jev-latest",
  state: { entity_prompt: "Hold" },
  questions: {
    action: {
      type: "choice",
      instructions: "Choose",
      criteria: { finish: "Hold" },
    },
  },
};

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

test("forwards Score questions unchanged and rejects invalid ordered scales before upstream", async () => {
  const scoreRequest = {
    ...request,
    questions: {
      distance: {
        type: "score",
        instructions: "How far?",
        criteria: ["minimal", "short", "half", "mostly", "full"],
      },
    },
  };
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
