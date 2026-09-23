import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { validGameRequest } from "./game-request.mjs";

const UPSTREAM = "https://api.typesafe.ai/v1/systemone";
const MAX_BYTES = 512 * 1024;

/** Create a stateless, fixed-upstream relay. Credentials never enter a response or log. */
export function createRelay({
  key,
  origins,
  fetchUpstream = fetch,
  log = console.info,
}) {
  let active = 0;
  let windowStart = Date.now();
  let requests = 0;
  return createServer(async (req, res) => {
    const id = randomUUID();
    const started = Date.now();
    res.setHeader("X-Request-ID", id);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Origin");
    const reply = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/health" && req.method === "GET") {
      reply(200, { status: "ok" });
      return;
    }
    if (req.url !== "/v1/systemone") return reply(404, { error: "Not found" });
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin))
      return reply(403, { error: "Origin not allowed" });
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "X-Request-ID, Retry-After");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== "POST") return reply(405, { error: "Use POST" });
    if (
      req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
      "application/json"
    )
      return reply(415, { error: "Use application/json" });
    if (Date.now() - windowStart >= 60000) {
      windowStart = Date.now();
      requests = 0;
    }
    if (active >= 8 || requests >= 120) {
      res.setHeader("Retry-After", "10");
      return reply(429, { error: "Relay request limit reached" });
    }
    requests++;
    active++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    req.setTimeout(15000, () => req.destroy());
    let context = {};
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BYTES) {
          reply(413, { error: "Request too large" });
          return;
        }
        chunks.push(chunk);
      }
      let payload;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return reply(400, { error: "Invalid JSON" });
      }
      if (!validGameRequest(payload))
        return reply(400, {
          error: "Invalid TUT game decision request",
        });
      context = requestContext(payload, key);
      const upstream = await fetchUpstream(UPSTREAM, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const retry = upstream.headers.get("retry-after");
      if (retry) res.setHeader("Retry-After", retry);
      const body = await upstream.text();
      // Never echo a credential even if an upstream error includes request diagnostics.
      const safe = body.replaceAll(key, "[redacted]");
      let parsed;
      try {
        parsed = JSON.parse(safe);
      } catch {
        return reply(502, { error: "Jev returned an invalid response" });
      }
      reply(upstream.status, parsed);
    } catch {
      if (!res.destroyed && !res.writableEnded)
        reply(controller.signal.aborted ? 504 : 502, {
          error: controller.signal.aborted
            ? "Jev request timed out"
            : "Jev is unavailable",
        });
    } finally {
      clearTimeout(timer);
      active--;
      log(
        JSON.stringify({
          requestId: id,
          status: res.statusCode,
          elapsedMs: Date.now() - started,
          ...context,
        }),
      );
    }
  });
}

/** Identify the acting entity without logging prompts, battlefield state or credentials. */
function requestContext(payload, key) {
  const state = payload.state;
  const actor = state?.actor;
  /** Keep caller-supplied labels short and redact credentials before serialization. */
  const label = (value) =>
    typeof value === "string"
      ? value.replaceAll(key, "[redacted]").slice(0, 120)
      : undefined;
  return {
    actorId: label(actor?.id),
    actorName: label(actor?.name),
    faction: label(state?.faction),
    phase: label(state?.phase),
    turn: Number.isSafeInteger(state?.turn) ? state.turn : undefined,
    questionTypes: Object.values(payload.questions).map(
      (question) => question.type,
    ),
  };
}
