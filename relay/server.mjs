import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

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
    if (!req.headers["content-type"]?.startsWith("application/json"))
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
      if (!validRequest(payload))
        return reply(400, {
          error: "Expected Jev state, model and Choice or Score questions",
        });
      const upstream = await fetchUpstream(UPSTREAM, {
        method: "POST",
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
        }),
      );
    }
  });
}

/** Bound the evaluation interface; callers cannot choose an upstream or send credentials. */
function validRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (
    Object.keys(value).some(
      (key) => !["model", "state", "questions"].includes(key),
    )
  )
    return false;
  if (
    typeof value.model !== "string" ||
    !/^jev-[a-z0-9.-]{1,40}$/.test(value.model) ||
    value.state == null
  )
    return false;
  if (
    !value.questions ||
    typeof value.questions !== "object" ||
    Array.isArray(value.questions)
  )
    return false;
  const questions = Object.values(value.questions);
  return (
    questions.length > 0 &&
    questions.length <= 16 &&
    questions.every(
      (q) =>
        q &&
        typeof q.instructions === "string" &&
        q.criteria &&
        typeof q.criteria === "object" &&
        ((q.type === "choice" &&
          !Array.isArray(q.criteria) &&
          Object.keys(q.criteria).length >= 1 &&
          Object.keys(q.criteria).length <= 255) ||
          (q.type === "score" &&
            Array.isArray(q.criteria) &&
            q.criteria.length >= 2 &&
            q.criteria.length <= 10 &&
            q.criteria.every(
              (level) => typeof level === "string" && level.length > 0,
            ))),
    )
  );
}
