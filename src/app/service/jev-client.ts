import { isRecord } from "../../core/model/record-guard";
import type { JevAnswer, JevRequest } from "../../tactical/model/jev-control";

/** Successful relay response; the inspector also keeps the untouched JSON. */
export interface JevReply {
  readonly raw: unknown;
  readonly answer: JevAnswer;
  readonly requestId?: string;
}
/** Injectable transport for deterministic controller tests. */
export interface JevTransport {
  readonly configured: boolean;
  /** Evaluate exactly the given wire request. */
  ask(request: JevRequest, signal: AbortSignal): Promise<JevReply>;
}
/** Failure retaining safe response diagnostics for the inspector. */
export class JevRequestError extends Error {
  /** Preserve structured upstream errors without exposing HTTP credentials. */
  constructor(
    message: string,
    readonly response?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

/** Browser transport contains only a public relay URL, never a TypeSafe credential. */
export class JevClient implements JevTransport {
  readonly configured: boolean;
  /** Inject fetch for transport tests. */
  constructor(
    private readonly relayUrl: string,
    private readonly send: typeof fetch = (...args) => fetch(...args),
  ) {
    this.configured = relayUrl.trim().length > 0;
  }
  /** Bound network waits and reject malformed or out-of-catalogue answers before execution. */
  async ask(request: JevRequest, signal: AbortSignal): Promise<JevReply> {
    if (!this.configured)
      throw new JevRequestError(
        "Set VITE_JEV_RELAY_URL and restart/rebuild the frontend.",
      );
    const body = JSON.stringify(request);
    if (new TextEncoder().encode(body).length > 512 * 1024)
      throw new JevRequestError(
        "Jev request exceeds the relay's 512 KiB limit. Inspect the captured state and choices.",
      );
    const response = await this.send(
      `${this.relayUrl.replace(/\/$/, "")}/v1/systemone`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      },
    );
    const requestId = response.headers.get("x-request-id") ?? undefined;
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new JevRequestError(
        `Relay returned non-JSON (HTTP ${String(response.status)})`,
        undefined,
        requestId,
      );
    }
    if (!response.ok)
      throw new JevRequestError(
        `Jev request failed (HTTP ${String(response.status)})`,
        raw,
        requestId,
      );
    const answer = parseJevAnswer(raw, request);
    if (!answer)
      throw new JevRequestError(
        "Jev returned a malformed or unknown decision",
        raw,
        requestId,
      );
    return { raw, answer, requestId };
  }
}

/** Validate probabilities as well as the selected option; arbitrary response text never becomes a command. */
export function parseJevAnswer(
  raw: unknown,
  request: JevRequest,
): JevAnswer | undefined {
  const entries = Object.entries(request.questions);
  if (entries.length !== 1) return undefined;
  const [id, question] = entries[0]!;
  if (!isRecord(raw) || typeof raw.model !== "string" || !isRecord(raw.answers))
    return undefined;
  const answer = raw.answers[id];
  if (
    !isRecord(answer) ||
    answer.type !== question.type ||
    typeof answer.confidence !== "number" ||
    !Number.isFinite(answer.confidence) ||
    answer.confidence < 0 ||
    answer.confidence > 1 ||
    !isRecord(answer.probabilities)
  )
    return undefined;
  const keys =
    question.type === "score"
      ? question.criteria.map((_, index) => String(index))
      : Object.keys(question.criteria);
  const probabilities: Record<string, number> = {};
  for (const [key, value] of Object.entries(answer.probabilities)) {
    if (
      !keys.includes(key) ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    )
      return undefined;
    probabilities[key] = value;
  }
  if (
    keys.length !== Object.keys(probabilities).length ||
    Math.abs(Object.values(probabilities).reduce((sum, p) => sum + p, 0) - 1) >
      0.03
  )
    return undefined;
  const shared = { confidence: answer.confidence, probabilities };
  if (question.type === "score") {
    if (
      keys.length < 2 ||
      typeof answer.score !== "number" ||
      !Number.isFinite(answer.score) ||
      answer.score < 0 ||
      answer.score > keys.length - 1
    )
      return undefined;
    return { ...shared, score: answer.score };
  }
  if (
    typeof answer.choice !== "string" ||
    !Object.hasOwn(question.criteria, answer.choice)
  )
    return undefined;
  return { ...shared, choice: answer.choice };
}
